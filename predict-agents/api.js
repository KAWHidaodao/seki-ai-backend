// Seki Predict Meme-Agent HTTP API
// 挂进 server.js 的 _serverHandler，通过 memeAgentRoute(req, res, cors, body) 分发
'use strict';
const fs   = require('fs');
const path = require('path');
const { ethers } = require('/var/www/seki-ai/node_modules/ethers');

const REG_FILE = '/var/www/seki-ai/predict-agents/registry.json';
const LOG_FILE = '/var/www/seki-ai/predict-agents/agent-log.jsonl';

function readBody(req) {
  return new Promise((res, rej) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => res(b)); req.on('error', rej);
  });
}
function loadReg() {
  try { return JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); } catch { return { agents: [] }; }
}
function saveReg(r) { fs.writeFileSync(REG_FILE, JSON.stringify(r, null, 2)); }
function json(res, code, obj, cors) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...(cors || {}) });
  res.end(JSON.stringify(obj));
}
function publicView(a) {
  return {
    id: a.id, tokenAddr: a.tokenAddr, symbol: a.symbol, owner: a.owner,
    name: a.name, persona: a.persona, walletAddr: a.walletAddr,
    active: a.active, createdAt: a.createdAt, policy: a.policy, stats: a.stats,
  };
}

async function memeAgentRoute(req, res, cors) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  // GET /api/predict-agent/list
  if (req.method === 'GET' && p === '/api/predict-agent/list') {
    const reg = loadReg();
    return json(res, 200, { agents: reg.agents.map(publicView) }, cors);
  }

  // GET /api/predict-agent/get?token=0x...
  if (req.method === 'GET' && p === '/api/predict-agent/get') {
    const token = (u.searchParams.get('token') || '').toLowerCase();
    const reg = loadReg();
    const a = reg.agents.find(x => x.tokenAddr.toLowerCase() === token);
    if (!a) return json(res, 404, { error: 'not_found' }, cors);
    return json(res, 200, publicView(a), cors);
  }

  // GET /api/predict-agent/log?agent=<id>&limit=50
  if (req.method === 'GET' && p === '/api/predict-agent/log') {
    const id = u.searchParams.get('agent') || '';
    const limit = Math.min(500, Number(u.searchParams.get('limit') || 50));
    let lines = [];
    try { lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n'); } catch {}
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (!id || e.agent === id) out.push(e);
      } catch {}
    }
    return json(res, 200, { log: out }, cors);
  }

  // POST /api/predict-agent/create
  // body: { tokenAddr, symbol, owner, name, persona, policy? }
  if (req.method === 'POST' && p === '/api/predict-agent/create') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch { return json(res, 400, { error: 'bad_json' }, cors); }

    const tokenAddr = String(body.tokenAddr || '').trim();
    const symbol   = String(body.symbol || '').trim().slice(0, 16);
    const owner    = String(body.owner || '').trim();
    const name     = String(body.name || '').trim().slice(0, 48);
    const persona  = String(body.persona || '').trim().slice(0, 2000);

    if (!ethers.isAddress(tokenAddr)) return json(res, 400, { error: 'bad_tokenAddr' }, cors);
    if (!ethers.isAddress(owner))     return json(res, 400, { error: 'bad_owner' }, cors);
    if (!symbol || !name || !persona) return json(res, 400, { error: 'missing_fields' }, cors);

    const reg = loadReg();
    if (reg.agents.find(a => a.tokenAddr.toLowerCase() === tokenAddr.toLowerCase())) {
      return json(res, 409, { error: 'already_bound' }, cors);
    }

    // 生成 agent 专属钱包
    const w = ethers.Wallet.createRandom();
    const now = Math.floor(Date.now() / 1000);
    const agent = {
      id: 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      tokenAddr, symbol, owner, name, persona,
      walletAddr: w.address,
      walletPk:   w.privateKey,
      active: true,
      createdAt: now,
      policy: {
        minIntervalSec:    Math.max(600,  Number(body.policy?.minIntervalSec)    || 3600),
        maxMarketsPerDay:  Math.min(10,   Number(body.policy?.maxMarketsPerDay)  || 3),
        maxDurationSec:    Math.min(604800, Number(body.policy?.maxDurationSec)  || 86400),
      },
      stats: { marketsCreated: 0, lastActionAt: 0, todayCount: 0, dayStart: 0, lastDecision: '' },
    };
    reg.agents.push(agent);
    saveReg(reg);
    return json(res, 200, {
      ok: true, agent: publicView(agent),
      deposit: {
        chain: 'bsc',
        walletAddr: w.address,
        note: '请向此地址转入少量 BNB (建议 0.01) 和若干 SEKI 作为 agent 运营资金',
      },
    }, cors);
  }

  // POST /api/predict-agent/toggle   body: {id, owner, active, sig?}
  if (req.method === 'POST' && p === '/api/predict-agent/toggle') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch { return json(res, 400, { error: 'bad_json' }, cors); }
    const reg = loadReg();
    const a = reg.agents.find(x => x.id === body.id);
    if (!a) return json(res, 404, { error: 'not_found' }, cors);
    // MVP: 仅对比 owner 地址（后续加签名验证）
    if (String(body.owner || '').toLowerCase() !== a.owner.toLowerCase()) {
      return json(res, 403, { error: 'not_owner' }, cors);
    }
    a.active = !!body.active;
    saveReg(reg);
    return json(res, 200, { ok: true, active: a.active }, cors);
  }

  return null; // 未命中
}

module.exports = { memeAgentRoute };
