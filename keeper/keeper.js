// Seki Predict Keeper
// 扫描 MarketCreated → 到期快照 Binance/Pancake → proposeOutcome → 24h 后 finalize
// 参数规范（question 首行）:
//   SPEC:{"t":"BIN","a":"BTCUSDT"}
//   SPEC:{"t":"TER","a":"BNBUSDT","band":0.003}
//   SPEC:{"t":"RACE","a":["BTCUSDT","ETHUSDT","BNBUSDT"]}
//   SPEC:{"t":"BIN","a":"SEKI","pair":"0x...","win":1800}   // TWAP 窗口秒
// 判定:
//   BIN: close(openUntil) vs close(openUntil - duration); > 涨(1) < 跌(2) = VOID(0 退款)
//   TER: 同上；|Δ| <= band 横(3)，> band 涨(1)，< -band 跌(2)
//   RACE: 各标的涨跌幅 %；最大者胜（1-based index）；并列 VOID 退款
// 最低 4 唯一下注者由合约强制。

'use strict';
require('dotenv').config({ path: '/var/www/seki-ai/.env' });
const fs = require('fs');
const path = require('path');
const { ethers } = require('/var/www/seki-ai/node_modules/ethers');

const RPC        = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
const CORE       = process.env.PREDICT_CORE_ADDRESS;
const PK         = process.env.PRIVATE_KEY;
const TG_TOKEN   = process.env.TG_BOT_TOKEN || '';
const TG_CHAT    = process.env.TG_CHAT_ID   || '';
const STATE_FILE = path.join(__dirname, 'state.json');
const POLL_MS    = 60_000;

if (!CORE || !PK) { console.error('Missing PREDICT_CORE_ADDRESS or PRIVATE_KEY'); process.exit(1); }

const ABI = [
  'event MarketCreated(uint256 indexed id, address indexed creator, uint8 optionCount, uint64 openUntil, string question)',
  'event OutcomeProposed(uint256 indexed id, uint8 winningOption, uint64 proposedAt)',
  'event MarketResolved(uint256 indexed id, uint8 winningOption)',
  'event MarketCancelled(uint256 indexed id)',
  'function marketCount() view returns (uint256)',
  'function DEFAULT_DISPUTE_WINDOW() view returns (uint64)',
  'function getMarket(uint256) view returns (address creator, uint8 optionCount, uint8 winningOption, uint8 status, uint64 openUntil, uint64 proposedAt, uint64 disputeWindow, uint256 totalPool, uint256 uniqueBettors, string memory question)',
  'function proposeOutcome(uint256 id, uint8 winningOption)',
  'function finalize(uint256 id)',
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(PK, provider);
const core     = new ethers.Contract(CORE, ABI, wallet);

// ---------- util ----------
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastBlock: 0, markets: {} }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function log(...a) { console.log(new Date().toISOString(), ...a); }

async function tg(msg) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: '[keeper] ' + msg })
    });
  } catch (e) { log('tg err', e.message); }
}

function parseSpec(question) {
  const line = (question || '').split('\n')[0].trim();
  if (!line.startsWith('SPEC:')) return null;
  try { return JSON.parse(line.slice(5)); } catch { return null; }
}

// ---------- price sources ----------
const BINANCE_HOSTS = ['https://api.binance.com', 'https://api1.binance.com', 'https://api-gcp.binance.com'];

async function binanceKlineClose(symbol, ts) {
  // 取包含 ts 的 1m K 线收盘价。endTime 设为 ts*1000，startTime = ts*1000 - 60_000
  const endMs = ts * 1000;
  const startMs = endMs - 60_000;
  let lastErr;
  for (const host of BINANCE_HOSTS) {
    try {
      const url = `${host}/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startMs}&endTime=${endMs}&limit=2`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) throw new Error('empty');
      // 取最后一根已闭合 K 线
      const last = j[j.length - 1];
      return parseFloat(last[4]);
    } catch (e) { lastErr = e; }
  }
  throw new Error('binance all hosts failed: ' + (lastErr && lastErr.message));
}

// Pancake V2 pair TWAP via price0CumulativeLast / price1CumulativeLast
const PAIR_ABI = [
  'function price0CumulativeLast() view returns (uint256)',
  'function price1CumulativeLast() view returns (uint256)',
  'function getReserves() view returns (uint112 r0, uint112 r1, uint32 ts)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];
const SEKI = (process.env.SEKI_TOKEN_ADDRESS || '').toLowerCase();

async function pancakeTwapSekiPrice(pairAddr, startTs, endTs) {
  // 简化：直接取 endTs 附近 block 的 reserves 计算即时价；TWAP 需历史 cumulative 快照
  // 因为 keeper 长期运行，这里改成：keeper 启动时记录每个 pair 的 cumulative 快照，到期时算 TWAP。
  // 先 MVP：用 startTs/endTs 两点 reserves（archive 需求）。BSC 公共节点多不支持 archive，
  // 所以 keeper 定时采样（每 5 分钟）写入本地 history.json。这里读 history 做 TWAP。
  const hist = loadHistory();
  const pts = (hist[pairAddr.toLowerCase()] || []).filter(p => p.ts >= startTs && p.ts <= endTs);
  if (pts.length < 2) throw new Error(`twap hist insufficient for ${pairAddr} [${startTs},${endTs}]`);
  // 简单时间加权平均
  let sum = 0, wsum = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].ts - pts[i-1].ts;
    const avg = (pts[i].price + pts[i-1].price) / 2;
    sum += avg * dt; wsum += dt;
  }
  return sum / wsum;
}

const HIST_FILE = path.join(__dirname, 'pair-history.json');
function loadHistory() { try { return JSON.parse(fs.readFileSync(HIST_FILE, 'utf8')); } catch { return {}; } }
function saveHistory(h) { fs.writeFileSync(HIST_FILE, JSON.stringify(h)); }

async function samplePair(pairAddr) {
  const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
  const [r0, r1] = await pair.getReserves();
  const [t0, t1] = await Promise.all([pair.token0(), pair.token1()]);
  // price = 对 SEKI 的 USD 或 WBNB 价；此处返回 SEKI per other 的倒数（SEKI 标价）
  let price;
  if (t0.toLowerCase() === SEKI) price = Number(r1) / Number(r0);
  else if (t1.toLowerCase() === SEKI) price = Number(r0) / Number(r1);
  else throw new Error('pair does not contain SEKI');
  const hist = loadHistory();
  const key = pairAddr.toLowerCase();
  hist[key] = hist[key] || [];
  hist[key].push({ ts: Math.floor(Date.now()/1000), price });
  // 只保留 2 天
  const cutoff = Math.floor(Date.now()/1000) - 48*3600;
  hist[key] = hist[key].filter(p => p.ts >= cutoff);
  saveHistory(hist);
}

// ---------- resolution logic ----------
async function resolveSpec(spec, openUntil, duration) {
  const tEnd = Number(openUntil);
  const tStart = tEnd - Number(duration);

  const getPrice = async (asset, ts, extra) => {
    if (asset === 'SEKI') {
      const win = (extra && extra.win) || 1800;
      return pancakeTwapSekiPrice(extra.pair, ts - win, ts);
    }
    return binanceKlineClose(asset, ts);
  };

  if (spec.t === 'BIN') {
    const [p0, p1] = await Promise.all([getPrice(spec.a, tStart, spec), getPrice(spec.a, tEnd, spec)]);
    if (p1 > p0) return 1;
    if (p1 < p0) return 2;
    return 0; // 相等退款
  }
  if (spec.t === 'TER') {
    const band = spec.band != null ? spec.band : (spec.a === 'SEKI' ? 0.02 : 0.003);
    const [p0, p1] = await Promise.all([getPrice(spec.a, tStart, spec), getPrice(spec.a, tEnd, spec)]);
    const d = (p1 - p0) / p0;
    if (d > band)  return 1;
    if (d < -band) return 2;
    return 3;
  }
  if (spec.t === 'RACE') {
    const prices = await Promise.all(spec.a.flatMap(a => [getPrice(a, tStart, spec), getPrice(a, tEnd, spec)]));
    const ret = spec.a.map((_, i) => (prices[i*2+1] - prices[i*2]) / prices[i*2]);
    let best = -Infinity, idx = -1, tie = false;
    ret.forEach((r, i) => { if (r > best) { best = r; idx = i; tie = false; } else if (r === best) tie = true; });
    if (tie) return 0;
    return idx + 1;
  }
  throw new Error('unknown spec.t=' + spec.t);
}

// ---------- main loop ----------
async function syncMarkets(state) {
  // Use marketCount() + getMarket() instead of eth_getLogs to avoid BSC public RPC rate limits
  const count = Number(await core.marketCount());
  const lastKnown = state.lastMarketId || 0;
  if (count <= lastKnown) return;
  for (let id = lastKnown + 1; id <= count; id++) {
    try {
      const m = await core.getMarket(id);
      const question = m[9]; // question is last field
      const openUntil = Number(m[4]);
      const optionCount = Number(m[1]);
      const spec = parseSpec(question);
      // Estimate createdAt from current time or duration
      // For accuracy we'd need the MarketCreated event block, but to avoid getLogs:
      // createdAt ≈ now - (openUntil - now) is wrong. Use a single getLogs for just this market.
      let createdAt;
      try {
        const head = await provider.getBlockNumber();
        const logs = await core.queryFilter(core.filters.MarketCreated(id), head - 100000, head);
        if (logs[0]) {
          const blk = await provider.getBlock(logs[0].blockNumber);
          createdAt = blk ? Number(blk.timestamp) : undefined;
        }
      } catch { /* rate limited, fall through */ }
      if (!createdAt) {
        // fallback: openUntil was set as block.timestamp + duration at creation
        // We don't know duration directly. Estimate: if market is still open, createdAt ≈ earliest reasonable time
        // Best fallback: use current timestamp as upper bound
        createdAt = Math.floor(Date.now()/1000) - 3600; // rough estimate
      }
      state.markets[String(id)] = {
        id: String(id), openUntil, question,
        optionCount, spec, status: 'open',
        createdAt,
      };
      log(`picked up market #${id} spec=${JSON.stringify(spec)} created=${createdAt}`);
      if (!spec) tg(`市场 #${id} 无 SPEC，需人工处理: ${question.slice(0,80)}`);
    } catch (e) {
      log(`sync market #${id} err:`, e.message);
    }
  }
  state.lastMarketId = count;
  saveState(state);
}

async function processMarket(m, state) {
  const on = await core.getMarket(m.id);
  const statusNum = Number(on[3]); // 0 Open, 1 Proposed, 2 Cancelled, 3 Resolved
  const openUntil = Number(on[4]);
  const proposedAt = Number(on[5]);
  const disputeWindow = Number(on[6]);
  const now = Math.floor(Date.now()/1000);

  if (statusNum === 2 || statusNum === 3) { m.status = 'done'; return; }

  if (statusNum === 0 && now >= openUntil) {
    if (!m.spec) { return; } // 需人工
    // 找原 duration：我们没存；从 question 的 SPEC 可选或合约 openUntil - created 推不到。
    // 简单做法：假设 duration = openUntil - (openUntil - 3600) 行不通。
    // 解决：用 MarketCreated 事件的 block.timestamp 作为 createdAt，duration = openUntil - createdAt。
    const createdAt = m.createdAt || (openUntil - 3600);
    const duration = openUntil - createdAt;
    try {
      const outcome = await resolveSpec(m.spec, openUntil, duration);
      log(`market #${m.id} resolve -> option ${outcome}`);
      const tx = await core.proposeOutcome(m.id, outcome);
      await tx.wait();
      tg(`市场 #${m.id} proposeOutcome=${outcome} tx=${tx.hash}`);
      m.status = 'proposed';
    } catch (e) {
      log(`resolve fail #${m.id}:`, e.message);
      tg(`市场 #${m.id} 判定失败: ${e.message}`);
    }
    return;
  }

  if (statusNum === 1 && now >= proposedAt + disputeWindow) {
    try {
      const tx = await core.finalize(m.id);
      await tx.wait();
      tg(`市场 #${m.id} finalized tx=${tx.hash}`);
      m.status = 'done';
    } catch (e) {
      log(`finalize fail #${m.id}:`, e.message);
    }
  }
}

async function tick() {
  const state = loadState();
  try { await syncMarkets(state); } catch (e) { log('sync err', e.message); }

  for (const m of Object.values(state.markets)) {
    if (m.status === 'done') continue;
    try { await processMarket(m, state); } catch (e) { log('proc err', m.id, e.message); }
  }

  // Pancake 采样：对所有 SEKI 相关 market 的 pair 采一次
  const pairs = new Set();
  for (const m of Object.values(state.markets)) {
    if (m.status === 'done') continue;
    if (m.spec && m.spec.pair) pairs.add(m.spec.pair);
  }
  for (const p of pairs) {
    try { await samplePair(p); } catch (e) { log('sample err', p, e.message); }
  }

  saveState(state);
}

(async () => {
  log('keeper starting, core=', CORE, 'signer=', wallet.address);
  tg(`keeper 启动 ${wallet.address}`);
  while (true) {
    try { await tick(); } catch (e) { log('tick err', e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
})();
