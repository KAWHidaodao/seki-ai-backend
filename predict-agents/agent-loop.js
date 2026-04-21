// Seki Predict Meme-Agent Loop
// 每个发币方绑定一个 AI agent：独立钱包、独立人格、LLM 自主决策是否开预测盘
//
// registry.json schema:
// {
//   "agents": [{
//     "id": "uuid",
//     "tokenAddr": "0x...",
//     "symbol": "XYZ",
//     "owner": "0xOwnerWallet",
//     "name": "Agent Name",
//     "persona": "you are ...",
//     "walletAddr": "0x...",
//     "walletPk": "0x...",       // encrypted later
//     "active": true,
//     "createdAt": 1700000000,
//     "policy": {
//       "minIntervalSec": 3600,   // 两次开盘最小间隔
//       "maxMarketsPerDay": 3,
//       "maxDurationSec": 86400
//     },
//     "stats": {
//       "marketsCreated": 0,
//       "lastActionAt": 0,
//       "lastDecision": ""
//     }
//   }]
// }
'use strict';
require('dotenv').config({ path: '/var/www/seki-ai/.env' });
const fs = require('fs');
const path = require('path');
const { ethers } = require('/var/www/seki-ai/node_modules/ethers');

const RPC     = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
const CORE    = process.env.PREDICT_CORE_ADDRESS;
const TG_TOK  = process.env.TG_BOT_TOKEN || '';
const TG_CHAT = process.env.TG_CHAT_ID   || '';
const LLM_BASE  = process.env.LLM_BASE  || 'https://code.newcli.com/codex/v1';
const LLM_KEY   = process.env.LLM_KEY   || 'sk-ant-oat01-biFe9ra5JZFx7RWA1_pFNjay2Vr3MOSOJuf9rxtdw5MTxP_-yggQmxZWsYuIgZfjr2vA3qgFBSz2ZmK83ZbAgvAZZR7mHAA';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-5.4';

const REG_FILE = path.join(__dirname, 'registry.json');
const LOG_FILE = path.join(__dirname, 'agent-log.jsonl');
const POLL_MS  = 60_000;          // 每分钟扫一次
const MIN_BNB  = 0.002;            // 低于这个 BNB 报警并跳过
const DEFAULT_POLICY = {
  minIntervalSec: 3600,
  maxMarketsPerDay: 3,
  maxDurationSec: 86400,
};

const CORE_ABI = [
  'function createMarket(string question, uint8 optionCount, uint64 duration) returns (uint256)',
  'function marketCount() view returns (uint256)',
];

const provider = new ethers.JsonRpcProvider(RPC);
const coreRead = new ethers.Contract(CORE, CORE_ABI, provider);

// ---------- utils ----------
function log(...a) { console.log(new Date().toISOString(), ...a); }
function loadReg() { return JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); }
function saveReg(r) { fs.writeFileSync(REG_FILE, JSON.stringify(r, null, 2)); }
function appendLog(o) {
  try { fs.appendFileSync(LOG_FILE, JSON.stringify({ t: Date.now(), ...o }) + '\n'); }
  catch (e) { log('log err', e.message); }
}
async function tg(msg) {
  if (!TG_TOK || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOK}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: '[meme-agent] ' + msg })
    });
  } catch {}
}

// ---------- LLM ----------
async function callLLM(system, user) {
  const body = JSON.stringify({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    max_tokens: 800,
    stream: false,
  });
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 15000);
  let r;
  try {
    r = await fetch(LLM_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LLM_KEY },
      body,
      signal: ctl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('LLM timeout 15s');
    throw e;
  } finally {
    clearTimeout(to);
  }
  if (!r.ok) throw new Error('LLM HTTP ' + r.status);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

function extractJson(text) {
  // 尝试直接解析；失败则找 {...} 块
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ---------- data sources ----------
async function getTokenContext(tokenAddr) {
  // 从自家 API 拿价格/市场情报，失败就空
  try {
    const r = await fetch(`http://127.0.0.1:3001/api/okx/price?token=${tokenAddr}`);
    if (r.ok) return await r.json();
  } catch {}
  return {};
}

// ---------- per-agent tick ----------
async function tickAgent(agent, reg) {
  if (!agent.active) return;

  const policy = { ...DEFAULT_POLICY, ...(agent.policy || {}) };
  const now = Math.floor(Date.now() / 1000);

  // 冷却
  if (agent.stats?.lastActionAt && now - agent.stats.lastActionAt < policy.minIntervalSec) return;

  // 今日额度
  const dayStart = Math.floor(now / 86400) * 86400;
  if (agent.stats?.dayStart !== dayStart) {
    agent.stats = { ...(agent.stats || {}), dayStart, todayCount: 0 };
  }
  if ((agent.stats.todayCount || 0) >= policy.maxMarketsPerDay) return;

  // 余额检查
  const bal = await provider.getBalance(agent.walletAddr);
  if (bal < ethers.parseEther(MIN_BNB.toString())) {
    if (!agent.stats.lowBnbAlerted) {
      await tg(`agent ${agent.name} (${agent.symbol}) BNB 不足 (${ethers.formatEther(bal)})，请 owner ${agent.owner} 充值到 ${agent.walletAddr}`);
      agent.stats.lowBnbAlerted = true;
      saveReg(reg);
    }
    return;
  } else if (agent.stats.lowBnbAlerted) {
    agent.stats.lowBnbAlerted = false;
  }

  // 拉链上情报
  const ctx = await getTokenContext(agent.tokenAddr);

  // 构造 LLM prompt
  const system = `你是一个链上 meme 币的 AI agent。你的人格设定如下：
---
${agent.persona}
---
你的能力：在 Seki Predict 上创建预测市场（binary / ternary / race）。
你要根据当前市场情况，自主判断是否值得开一个预测盘。
不要每次都开盘；只在有话题、有行情、或有理由时出手。
输出严格 JSON：
  {"action": "skip", "reason": "..."}  或
  {"action": "create", "question": "...", "optionCount": 2, "duration": 3600, "reason": "..."}
约束：
- optionCount 2~4
- duration 900~${policy.maxDurationSec} 秒
- question 必须包含 SPEC 首行，否则 keeper 无法结算，例如:
    SPEC:{"t":"BIN","a":"BTCUSDT"}\\n题面文字
- 标的只能是主流币 (BTCUSDT/ETHUSDT/BNBUSDT/SOLUSDT) 或 SEKI 或你自己的币
- 题面用人话，有 meme 感`;

  const user = `Token: ${agent.symbol} (${agent.tokenAddr})
当前时间 UTC: ${new Date().toISOString()}
最近一次开盘: ${agent.stats?.lastActionAt ? new Date(agent.stats.lastActionAt*1000).toISOString() : '从未'}
今日已开: ${agent.stats?.todayCount || 0}/${policy.maxMarketsPerDay}
行情: ${JSON.stringify(ctx).slice(0, 400)}

该出手吗？给我 JSON。`;

  let decision;
  try {
    const raw = await callLLM(system, user);
    decision = extractJson(raw);
    if (!decision) throw new Error('LLM 返回无法解析: ' + raw.slice(0, 200));
  } catch (e) {
    log(`[${agent.name}] LLM 失败: ${e.message}`);
    appendLog({ agent: agent.id, event: 'llm_error', error: e.message });
    return;
  }

  appendLog({ agent: agent.id, event: 'decision', decision });
  agent.stats.lastDecision = decision.action + ': ' + (decision.reason || '');

  if (decision.action !== 'create') {
    saveReg(reg);
    return;
  }

  // 参数校验
  const q = String(decision.question || '');
  const oc = Number(decision.optionCount || 2);
  const dur = Number(decision.duration || 3600);
  if (!q.startsWith('SPEC:')) {
    log(`[${agent.name}] 拒绝：question 缺 SPEC`);
    saveReg(reg);
    return;
  }
  if (oc < 2 || oc > 4) { log(`[${agent.name}] 拒绝：optionCount ${oc}`); saveReg(reg); return; }
  if (dur < 900 || dur > policy.maxDurationSec) { log(`[${agent.name}] 拒绝：duration ${dur}`); saveReg(reg); return; }

  // 上链
  try {
    const signer = new ethers.Wallet(agent.walletPk, provider);
    const core = new ethers.Contract(CORE, CORE_ABI, signer);
    const tx = await core.createMarket(q, oc, dur);
    const rc = await tx.wait();
    log(`[${agent.name}] ✅ createMarket tx=${rc.hash}`);
    agent.stats.lastActionAt = now;
    agent.stats.todayCount = (agent.stats.todayCount || 0) + 1;
    agent.stats.marketsCreated = (agent.stats.marketsCreated || 0) + 1;
    agent.stats.lastTx = rc.hash;
    appendLog({ agent: agent.id, event: 'created', tx: rc.hash, question: q });
    await tg(`🤖 ${agent.name} (${agent.symbol}) 开盘\n${q.split('\n')[1] || q}\nhttps://bscscan.com/tx/${rc.hash}`);
    saveReg(reg);
  } catch (e) {
    log(`[${agent.name}] ❌ 上链失败: ${e.message}`);
    appendLog({ agent: agent.id, event: 'tx_error', error: e.message });
    saveReg(reg);
  }
}

//
// ---------- main loop ----------
async function tickAll() {
  let reg;
  try { reg = loadReg(); } catch (e) { log('reg load fail', e.message); return; }
  for (const a of reg.agents) {
    try { await tickAgent(a, reg); }
    catch (e) { log(`[${a.name}] tick err`, e.message); }
  }
}

(async () => {
  log('predict-agent loop start, core=' + CORE);
  while (true) {
    try { await tickAll(); } catch (e) { log('loop err', e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
})();
