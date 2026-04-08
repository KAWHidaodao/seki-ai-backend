const https = require('https');
const http  = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
// 加载 .env
require('/root/.openclaw/workspace/memebounty-v2/backend/node_modules/dotenv').config({
  path: '/root/.openclaw/workspace/memebounty-v2/backend/.env'
});

const BASE = '/root/.openclaw/workspace/memebounty-v2';
const crypto = require('crypto');
function okxWeb3Sign(method, path, body) {
  const key = process.env.OKX_API_KEY||'';
  const sec = process.env.OKX_SECRET_KEY||'';
  const pass = process.env.OKX_PASSPHRASE||'';
  const ts = new Date().toISOString();
  const pre = ts + method + path + (body||'');
  const sign = crypto.createHmac('sha256', sec).update(pre).digest('base64');
  return {'OK-ACCESS-KEY':key,'OK-ACCESS-SIGN':sign,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-PASSPHRASE':pass,'Content-Type':'application/json'};
}

// ── OKX Web3 API 认证 ──────────────────────────────────────
const _okxW3Key  = process.env.OKX_WEB3_API_KEY  || '';
const _okxW3Sec  = process.env.OKX_WEB3_SECRET   || '';
const _okxW3Pass = process.env.OKX_WEB3_PASS     || '';
function okxW3Sign(method, path, body='') {
  const ts = new Date().toISOString();
  const msg = ts + method + path + body;
  const sign = require('crypto').createHmac('sha256', _okxW3Sec).update(msg).digest('base64');
  return {'OK-ACCESS-KEY':_okxW3Key,'OK-ACCESS-SIGN':sign,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-PASSPHRASE':_okxW3Pass,'Content-Type':'application/json'};
}
async function okxW3Post(path, body) {
  const b = JSON.stringify(body);
  const r = await fetch('https://web3.okx.com'+path, {method:'POST', headers:okxW3Sign('POST',path,b), body:b});
  return r.json();
}
// ────────────────────────────────────────────────────────────

// ── 用户数据持久化
const USERS_FILE = path.join(BASE, 'users.json');
let users = {};
try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch {}
function saveUsers() {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch(e) { console.error('saveUsers:', e.message); }
}
function getUser(addr) {
  const key = addr.toLowerCase();
  if (!users[key]) users[key] = { addr: key, createdAt: Date.now(), tokens: [], delegations: [], lastSeen: Date.now() };
  return users[key];
}
function touchUser(addr) {
  const u = getUser(addr);
  u.lastSeen = Date.now();
  saveUsers();
  return u;
}

// ── 签名验证
const { ethers: ethersServer } = require('/root/.openclaw/workspace/memebounty-v2/backend/node_modules/ethers');
const SIGN_MESSAGE = (nonce) => `Seki AI Agent 身份验证\n地址授权操作\nNonce: ${nonce}`;
const signNonces = new Map(); // addr -> { nonce, ts }
function issueNonce(addr) {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  signNonces.set(addr.toLowerCase(), { nonce, ts: Date.now() });
  return nonce;
}
async function verifySignature(addr, sig, nonce) {
  try {
    const key = addr.toLowerCase();
    const stored = signNonces.get(key);
    if (!stored) return false;
    if (stored.nonce !== nonce) return false;
    if (Date.now() - stored.ts > 5 * 60 * 1000) return false; // 5分钟过期
    const msg = SIGN_MESSAGE(nonce);
    const recovered = ethersServer.verifyMessage(msg, sig);
    if (recovered.toLowerCase() !== key) return false;
    signNonces.delete(key); // 用过即删，防重放
    return true;
  } catch { return false; }
}

// 管理员密码（可在 .env 里设置）
const ADMIN_PASS = process.env.ADMIN_PASS || 'seki2024admin';

const META_FILE = path.join(BASE, 'task-meta.json');
const LOG_FILE  = path.join(BASE, 'agent-log.json');

// 发币次数限制，持久化到文件（重启不丢失）
const LAUNCH_LIMIT = 3;

// ── OKX API Helper ────────────────────────────────────────────
const OKX_KEY  = '3fe0f8e7-1ef8-4304-afb0-ca67afe3995d';
const OKX_SEC  = 'A2E6A81E0B8C9BCBE0836AFC8F32DF44';
const OKX_PASS = '110220aA!';
async function okxGet(path) {
  const ts   = new Date().toISOString();
  const sign = require('crypto').createHmac('sha256', OKX_SEC).update(ts + 'GET' + path).digest('base64');
  const r = await fetch('https://www.okx.com' + path, {
    headers: {'OK-ACCESS-KEY':OKX_KEY,'OK-ACCESS-SIGN':sign,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-PASSPHRASE':OKX_PASS}
  });
  return r.json();
}

// GET /api/okx/price?token=0x...
// GET /api/okx/portfolio?wallet=0x...
// GET /api/okx/candles?token=0x...

const LAUNCH_FILE = path.join(BASE, 'launch-count.json');
let launchCount = new Map();
try {
  const raw = fs.readFileSync(LAUNCH_FILE, 'utf8');
  launchCount = new Map(Object.entries(JSON.parse(raw)));
  console.log('[launch-count] loaded', launchCount.size, 'entries');
} catch {}
function saveLaunchCount() {
  const obj = {};
  launchCount.forEach((v,k) => obj[k] = v);
  try { fs.writeFileSync(LAUNCH_FILE, JSON.stringify(obj)); } catch {}
}

// LLM config (OpenAI-compatible)
const LLM_BASE  = 'https://code.newcli.com/codex/v1';
const LLM_KEY   = 'sk-ant-oat01-biFe9ra5JZFx7RWA1_pFNjay2Vr3MOSOJuf9rxtdw5MTxP_-yggQmxZWsYuIgZfjr2vA3qgFBSz2ZmK83ZbAgvAZZR7mHAA';
const LLM_MODEL = 'gpt-5.4';

async function callLLM(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: LLM_MODEL, messages, max_tokens: 1024, stream: true });
    const req = https.request({
      hostname: 'code.newcli.com',
      path: '/codex/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LLM_KEY,
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let full = '';
      res.on('data', chunk => {
        // SSE 流：每行 data: {...}
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') continue;
          try {
            const obj = JSON.parse(raw);
            const delta = obj?.choices?.[0]?.delta?.content;
            if (delta) full += delta;
          } catch {}
        }
      });
      res.on('end', () => resolve({ _text: full }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const tls = require('tls');

// SSL handled by Nginx reverse proxy — Node only listens on HTTP :3000
let _useHttps = false;
let opts = {};

// 加载/初始化元数据
function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE,'utf8')); } catch { return {}; }
}
function saveMeta(data) {
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));
}

const _serverHandler = async (req, res) => {
  try {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors); res.end(); return;
  }

  // ── bdmeme.xyz → 反代到 meme-sovereign (localhost:4000) ──
  const _bdHost = (req.headers.host || '').replace(/:\d+$/, '');
  if (_bdHost === 'bdmeme.xyz' || _bdHost === 'www.bdmeme.xyz') {
    const proxyReq = require('http').request({
      hostname: '127.0.0.1', port: 4000,
      path: req.url, method: req.method,
      headers: { ...req.headers, host: _bdHost, 'x-forwarded-for': req.socket.remoteAddress, 'x-forwarded-proto': 'https' }
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxyReq.on('error', () => { try { res.writeHead(502); res.end('Bad Gateway'); } catch {} });
    req.pipe(proxyReq, { end: true });
    return;
  }

  // ── API: GET /api/log
  if (req.method === 'GET' && req.url.startsWith('/api/log')) {
    const LOG_FILE = path.join(BASE, 'agent-log.json');
    let logs = [];
    try { logs = JSON.parse(fs.readFileSync(LOG_FILE,'utf8')); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify(logs.slice(-200)));
    return;
  }

  // ── API: POST /api/log (agent写日志)
  if (req.method === 'POST' && req.url === '/api/log') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        const LOG_FILE = path.join(BASE, 'agent-log.json');
        let logs = [];
        try { logs = JSON.parse(fs.readFileSync(LOG_FILE,'utf8')); } catch {}
        logs.push({ ts: Date.now(), ...entry });
        if (logs.length > 500) logs = logs.slice(-500);
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs));
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── API: POST /api/prepare-token  (新) — 后端调 create-api，返回签名数据给前端
  if (req.method === 'POST' && req.url === '/api/prepare-token') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const { name, symbol, desc, label, imageBase64, imageMime, taxRate, webUrl, twitterUrl, tgUrl, preSale, walletAddr } = JSON.parse(body);
        if (!name || !symbol || !desc || !label) throw new Error('missing fields');
        // 钱包限制
        if (!walletAddr) throw new Error('请先连接钱包再发币');
        const addrKey = walletAddr.toLowerCase();
        const used = launchCount.get(addrKey) || 0;
        if (used >= LAUNCH_LIMIT) throw new Error('每个钱包最多发布 '+LAUNCH_LIMIT+' 个代币');

        // 保存图片到临时文件
        let imgArg = '';
        let tmpImgPath = null;
        if (imageBase64) {
          const ext = (imageMime || 'image/png').split('/')[1].replace('jpeg','jpg') || 'png';
          tmpImgPath = `/tmp/token_logo_${Date.now()}.${ext}`;
          const imgBuf = Buffer.from(imageBase64, 'base64');
          fs.writeFileSync(tmpImgPath, imgBuf);
          console.log(`[prepare-token] image: ${tmpImgPath} (${imgBuf.length} bytes)`);
          imgArg = tmpImgPath;
        }

        // 调 create-api（只做 API 调用，不广播交易）
        let cmd = [
          'create-api',
          '--name=' + name,
          '--short-name=' + symbol,
          '--desc=' + desc,
          '--label=' + (label || 'Meme'),
        ];
        if (imgArg)     cmd.push('--image=' + imgArg);
        if (webUrl) {
          const fixedWeb = webUrl.startsWith('http') ? webUrl : 'https://' + webUrl;
          cmd.push('--web-url=' + fixedWeb);
        }
        if (twitterUrl) {
          const fixedTw = twitterUrl.startsWith('http') ? twitterUrl : 'https://' + twitterUrl;
          cmd.push('--twitter-url=' + fixedTw);
        }
        if (tgUrl) {
          const fixedTg = tgUrl.startsWith('http') ? tgUrl : 'https://' + tgUrl;
          cmd.push('--telegram-url=' + fixedTg);
        }
        // preSale disabled (platform wallet would be buying own token)
        if (taxRate) {
          cmd.push('--tax-token');
          cmd.push('--tax-fee-rate=' + taxRate);
          cmd.push('--tax-burn-rate=0');
          cmd.push('--tax-divide-rate=0');
          cmd.push('--tax-liquidity-rate=0');
          cmd.push('--tax-recipient-rate=100');
          cmd.push('--tax-recipient-address=0x8c98f9821299e531353dd004b722851cf1b4c8a2');
          cmd.push('--tax-min-sharing=100000');
        }

        const spawnEnv = { ...process.env, PRIVATE_KEY: process.env.PRIVATE_KEY };
        const result = await new Promise((resolve, reject) => {
          execFile('fourmeme', cmd, {
            cwd: BASE + '/backend',
            env: spawnEnv,
            timeout: 60000,
          }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout);
          });
        });

        if (tmpImgPath) try { fs.unlinkSync(tmpImgPath); } catch {}

        // create-api 返回多行 JSON，提取 {...} 块
        let payload = null;
        try {
          const match = result.match(/\{[\s\S]*\}/);
          if (match) payload = JSON.parse(match[0]);
        } catch {}
        if (!payload || !payload.createArg) {
          // 检查是否是限频错误
          try {
            const errMatch = result.match(/\{[\s\S]*\}/);
            if (errMatch) {
              const errObj = JSON.parse(errMatch[0]);
              if (errObj.code === -1115 || (errObj.msg && errObj.msg.includes('Too many'))) {
                throw new Error('发币频率限制，请等待1-2分钟后重试');
              }
            }
          } catch(fe) { if (fe.message.includes('频率')) throw fe; }
          throw new Error('fourmeme create-api 未返回 createArg: ' + result.slice(0,200));
        }

        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({
          ok: true,
          createArg: payload.createArg,
          signature: payload.signature,
          creationFeeWei: payload.creationFeeWei || '0',
          fourMemeContract: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
        }));
      } catch(e) {
        res.writeHead(500, cors);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── API: POST /api/create-token (保留兼容，内部用 prepare-token 逻辑，服务器广播)
  if (req.method === 'POST' && req.url === '/api/create-token') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const { name, symbol, desc, label, imageBase64, imageMime, taxRate, webUrl, twitterUrl, tgUrl, walletAddr, sig, nonce } = JSON.parse(body);
        if (!name || !symbol || !desc || !label) throw new Error('missing fields');
        if (!walletAddr) throw new Error('请先连接钱包再发币');
        // 验证签名
        if (!sig || !nonce) throw new Error('请签名后再发币');
        const sigOk = await verifySignature(walletAddr, sig, nonce);
        if (!sigOk) throw new Error('签名验证失败，请重新签名');
        const addrKeyCheck = walletAddr.toLowerCase();

        const usedCheck = launchCount.get(addrKeyCheck) || 0;
        if (usedCheck >= LAUNCH_LIMIT) throw new Error('每个钱包最多发布 '+LAUNCH_LIMIT+' 个代币');

        // 保存上传图片到临时文件
        let imgArg = '';
        let tmpImgPath = null;
        if (imageBase64) {
          const ext = (imageMime || 'image/png').split('/')[1].replace('jpeg','jpg') || 'png';
          tmpImgPath = `/tmp/token_logo_${Date.now()}.${ext}`;
          const imgBuf = Buffer.from(imageBase64, 'base64');
          fs.writeFileSync(tmpImgPath, imgBuf);
          console.log(`[create-token] image saved: ${tmpImgPath} (${imgBuf.length} bytes, type=${imageMime})`);
          imgArg = tmpImgPath;
        } else {
          // 没有图片时用默认头像
          imgArg = '/root/.openclaw/workspace/memebounty-v2/seki-avatar.jpg';
          console.log('[create-token] no image, using default avatar');
        }
        let cmd = [
          'create-instant',
          '--name=' + name,
          '--short-name=' + symbol,
          '--desc=' + desc,
          '--label=' + (label || 'Meme'),
        ];
        if (imgArg) cmd.push('--image=' + imgArg);

        // 社交链接（不为空才传，fourmeme 要求 omit if empty）
        if (webUrl) {
          const fixedWeb = webUrl.startsWith('http') ? webUrl : 'https://' + webUrl;
          cmd.push('--web-url=' + fixedWeb);
        }
        if (twitterUrl) {
          const fixedTw = twitterUrl.startsWith('http') ? twitterUrl : 'https://' + twitterUrl;
          cmd.push('--twitter-url=' + fixedTw);
        }
        if (tgUrl)      cmd.push('--telegram-url=' + tgUrl);

        // 预购
        // preSale disabled (platform wallet would be buying own token)

        if (taxRate) {
          // Tax token: feeRate + 全部税收进 agentWallet
          cmd.push('--tax-token');
          cmd.push('--tax-fee-rate=' + taxRate);
          cmd.push('--tax-burn-rate=0');
          cmd.push('--tax-divide-rate=0');
          cmd.push('--tax-liquidity-rate=0');
          cmd.push('--tax-recipient-rate=100');
          cmd.push('--tax-recipient-address=0x8c98f9821299e531353dd004b722851cf1b4c8a2');
          cmd.push('--tax-min-sharing=100000');
        }

        // 校验通过，记录用户活跃
        touchUser(walletAddr);
        // 校验通过后立即扣次数（广播前），防止重复发币
        const addrKey2 = addrKeyCheck;
        launchCount.set(addrKey2, (launchCount.get(addrKey2)||0) + 1);
        saveLaunchCount();
        console.log(`[create-token] wallet ${addrKey2} used ${launchCount.get(addrKey2)}/${LAUNCH_LIMIT}`);

        const spawnEnv = { ...process.env, PRIVATE_KEY: process.env.PRIVATE_KEY };

        console.log('[create-token] running fourmeme cmd:', cmd[0], cmd.slice(1).join(' ').slice(0,100));
        const result = await new Promise((resolve, reject) => {
          execFile('fourmeme', cmd, {
            cwd: BASE + '/backend',
            env: spawnEnv,
            timeout: 120000,
            maxBuffer: 1024 * 1024,
          }, (err, stdout, stderr) => {
            if (err) {
              console.error('[create-token] execFile error:', err.message, stderr?.slice(0,200));
              reject(new Error(stderr || err.message));
            } else {
              console.log('[create-token] fourmeme stdout:', stdout.slice(0,300));
              resolve(stdout);
            }
          });
        });
        console.log('[create-token] execFile done, result len:', result.length);

        // 解析输出，找 token 地址
        let tokenAddress = null;
        let txHash = null;
        try {
          // 先尝试整体解析（多行JSON合并）
          const fullStr = result.trim();
          const jsonMatch = fullStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const obj = JSON.parse(jsonMatch[0]);
            if (obj.tokenAddress) tokenAddress = obj.tokenAddress;
            if (obj.address)      tokenAddress = obj.address;
            if (obj.txHash)       txHash = obj.txHash;
          }
          // 再逐行解析补漏
          if (!txHash || !tokenAddress) {
            for (const line of fullStr.split('\n')) {
              try {
                const obj = JSON.parse(line.trim());
                if (!tokenAddress && (obj.tokenAddress||obj.address)) tokenAddress = obj.tokenAddress||obj.address;
                if (!txHash && obj.txHash) txHash = obj.txHash;
              } catch {}
            }
          }
        } catch {}

        // 查 receipt 获取代币地址（最多等30秒，用 ethers provider）
        if (!tokenAddress && txHash) {
          try {
            const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
            const rpcProv = new ethersServer.JsonRpcProvider(rpcUrl);
            for (let i = 0; i < 30; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const receipt = await rpcProv.getTransactionReceipt(txHash).catch(()=>null);
              if (receipt && receipt.logs && receipt.logs.length > 0) {
                tokenAddress = receipt.logs[0].address;
                console.log('[create-token] tokenAddress from receipt:', tokenAddress);
                break;
              }
            }
          } catch(rpcErr) { console.error('[create-token] rpc poll err:', rpcErr.message); }
        }
        console.log('[create-token] final tokenAddress:', tokenAddress, 'txHash:', txHash);

        // 清理临时图片
        if (tmpImgPath) try { fs.unlinkSync(tmpImgPath); } catch {}

        // 无论是否拿到 tokenAddress 都返回成功，前端可用 txHash 补全
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        // 持久化到用户记录
        try {
          const u = getUser(walletAddr);
          if (!u.tokens) u.tokens = [];
          u.tokens.unshift({ addr: tokenAddress||null, name, symbol, txHash, ts: Date.now(), label, pending: !tokenAddress });
          u.tokens = u.tokens.slice(0, 50);
          u.lastSeen = Date.now();
          saveUsers();
        } catch(ue) { console.error('saveUser token:', ue.message); }

        res.end(JSON.stringify({
          ok: true,
          tokenAddress: tokenAddress || null,
          txHash,
          pending: !tokenAddress && !!txHash, // 上链中，代币地址待查
          bscscan: txHash ? 'https://bscscan.com/tx/' + txHash : null,
          tokenScan: tokenAddress ? 'https://bscscan.com/token/' + tokenAddress : null,
          fourMeme: tokenAddress ? 'https://four.meme/token/' + tokenAddress : null,
        }));
      } catch(e) {
        res.writeHead(500, cors);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── API: POST /api/generate-task
  if (req.method === 'POST' && req.url === '/api/generate-task') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { intent, tokenSymbol, budget } = JSON.parse(body);
        if (!intent) throw new Error('missing intent');

        const systemPrompt = `你是 MemeBounty 平台的 AI 任务生成器。用户描述他们想要的激励效果，你将生成一个链上可验证的任务参数。

任务类型说明：
- 0 HOLD：用户需持有代币超过指定时长，链上用区块时间戳验证
- 1 BUY：用户需单次买入超过指定 BNB 金额，链上交易事件验证
- 2 EARLYBIRD：前N名持有代币的地址直接领奖，先到先得
- 3 REFERRAL：用户推荐N个新钱包买入该代币
- 4 TOURNAMENT：截止时按持仓量排名，前N名瓜分奖池

规则：
1. 只能选择上述5种类型之一，必须链上可验证
2. rewardPerWinner 单位 BNB，不超过 budget 的 20%
3. maxWinners 建议 10-200
4. 返回纯 JSON，不要解释文字

返回格式：
{
  "taskType": 0,
  "title": "任务标题（10字内，吸引人）",
  "description": "任务描述（50字内，说清楚做什么、能得到什么）",
  "rewardPerWinner": 0.01,
  "maxWinners": 100,
  "deadlineHours": 24,
  "minTokenAmount": 1000,
  "minHoldHours": 24,
  "minBuyBNB": 0,
  "minReferrals": 0,
  "reasoning": "为什么选这个方案（20字）"
}`;

        const res2 = await callLLM([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `代币符号：${tokenSymbol || '未知'}\n预算（BNB）：${budget || '0.5'}\n用户意图：${intent}` }
        ]);

        // 兼容流式和非流式返回
        let text = '';
        if (res2._text) text = res2._text;
        else if (res2.content && res2.content[0]) text = res2.content[0].text;
        else if (res2.choices) text = res2.choices[0].message.content;

        // 提取 JSON（兼容裸JSON、markdown代码块、字符串包裹）
        let jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) text = jsonMatch[1].trim();
        // 若整体是被引号包裹的字符串，先解包
        if (typeof text === 'string' && text.trim().startsWith('"')) {
          try { text = JSON.parse(text.trim()); } catch {}
        }
        // 若已经是 object 则直接用
        const task = typeof text === 'object' && text !== null ? text : JSON.parse((text.match(/\{[\s\S]*\}/) || [])[0] || 'null');
        if (!task) throw new Error('LLM did not return JSON');

        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true, task }));
      } catch(e) {
        res.writeHead(500, cors);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }


  // ── API: GET /api/nonce?addr=0x...
  if (req.method === 'GET' && req.url.startsWith('/api/nonce')) {
    const addr = new URL('http://x' + req.url).searchParams.get('addr') || '';
    if (!addr) { res.writeHead(400, cors); res.end(JSON.stringify({ error: 'missing addr' })); return; }
    const nonce = issueNonce(addr);
    const msg = SIGN_MESSAGE(nonce);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ nonce, message: msg }));
    return;
  }


  // ── API: GET /api/user?addr=0x...
  if (req.method === 'GET' && req.url.startsWith('/api/user')) {
    const addr = new URL('http://x' + req.url).searchParams.get('addr') || '';
    if (!addr) { res.writeHead(400, cors); res.end(JSON.stringify({ error: 'missing addr' })); return; }
    const u = getUser(addr);
    const launchUsed = launchCount.get(addr.toLowerCase()) || 0;
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ ...u, launchUsed, launchLimit: LAUNCH_LIMIT, launchRemaining: Math.max(0, LAUNCH_LIMIT - launchUsed) }));
    return;
  }


  // ── 合约源码下载 ─────────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/contracts/')) {
    const files = {
      'MemeBountyV5.sol':   BASE+'/MemeBountyV5.sol',
      'AgentRegistry.sol':  BASE+'/AgentRegistry.sol',
      'SekiRegistry.sol':   BASE+'/SekiRegistry.sol'
    };
    const fname = req.url.replace('/contracts/','').split('?')[0];
    const fpath = files[fname];
    if (!fpath || !require('fs').existsSync(fpath)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const content = require('fs').readFileSync(fpath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="'+fname+'"',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
    return;
  }

  // ── OKX 代理路由 ──────────────────────────────────────────────
  const okxJ = (code, obj) => { res.writeHead(code, {'Content-Type':'application/json',...cors}); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET' && req.url.startsWith('/api/okx/price')) {
    const token = new URL(req.url,'http://x').searchParams.get('token');
    if (!token) return okxJ(400,{ok:false,error:'missing token'});
    try {
      const d = await okxGet('/api/v6/dex/aggregator/quote?chainIndex=56&fromTokenAddress='+token+'&toTokenAddress=0x55d398326f99059fF775485246999027B3197955&amount=1000000000000000000');
      const row = d.data && d.data[0];
      okxJ(200,{ok:true,price:row&&row.fromToken?row.fromToken.tokenUnitPrice:null,symbol:row&&row.fromToken?row.fromToken.tokenSymbol:null});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/okx/portfolio')) {
    const wallet = new URL(req.url,'http://x').searchParams.get('wallet');
    if (!wallet) return okxJ(400,{ok:false,error:'missing wallet'});
    try {
      const d = await okxGet('/api/v6/wallet/asset/all-token-balances-by-address?address='+wallet+'&chains=56');
      okxJ(200,{ok:true,data:d.data||[]});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/okx/candles')) {
    const token = new URL(req.url,'http://x').searchParams.get('token');
    if (!token) return okxJ(400,{ok:false,error:'missing token'});
    try {
      const d = await okxGet('/api/v6/dex/market/candles?chainIndex=56&tokenContractAddress='+token+'&bar=1m&limit=30');
      okxJ(200,{ok:true,data:d.data||[]});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }


  // ── OKX DEX Swap Quote


  // ── OKX 行情数据（价格 + 热门代币）────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/okx/market')) {
    try {
      const BINANCE_KEY = 'cLE6XGijU3aHv9jlUQOlxRfMKXjbpLgZ22ZL11oLgkDrSBrsbr5rUlngIBMuWSIS';
      const syms = ['BNBUSDT','BTCUSDT','ETHUSDT'];
      const results = [];
      for (const sym of syms) {
        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`, {headers:{'X-MBX-APIKEY':BINANCE_KEY}});
        const d = await r.json();
        results.push({symbol:sym.replace('USDT','-USDT'),price:parseFloat(d.lastPrice).toFixed(2),change24h:parseFloat(d.priceChangePercent).toFixed(2)});
      }
      okxJ(200,{ok:true,prices:results});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }

  // ── BSC 热门代币（DexScreener）────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/okx/hot-tokens')) {
    try {
      // OKX V5 tickers 按成交额排序，过滤稳定币
      const r = await okxGet('/api/v5/market/tickers?instType=SPOT');
      const stable = ['USDC','USDT','BUSD','DAI','FDUSD','USD1','TUSD','USDP'];
      const tickers = (r.data || [])
        .filter(t => t.instId.endsWith('-USDT') && !stable.some(s => t.instId.startsWith(s+'-')))
        .map(t => {
          const sym = t.instId.replace('-USDT','');
          const price = parseFloat(t.last||0);
          const open = parseFloat(t.open24h||price);
          const change24h = open ? ((price-open)/open*100).toFixed(2) : '0.00';
          const volume = parseFloat(t.volCcy24h||0) * price;
          return {symbol:sym, price, change24h, volume};
        })
        .sort((a,b)=>b.volume-a.volume)
        .slice(0,8);
      okxJ(200, {ok:true, tokens:tickers});
    } catch(e) { okxJ(500, {ok:false, error:e.message}); }
    return;
  }

  // ── 链上信号：OKX 聪明钱/KOL/巨鲸 ──────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/bsc/smart-money')) {
    try {
      // 三类信号并发请求（聪明钱1 / KOL2 / 巨鲸3），使用全局 okxWeb3Sign
      const b1=JSON.stringify({chainIndex:'56',walletType:1,limit:6});
      const b2=JSON.stringify({chainIndex:'56',walletType:2,limit:6});
      const b3=JSON.stringify({chainIndex:'56',walletType:3,limit:6});
      const SIG_PATH='/api/v6/dex/market/signal/list';
      const [sm, kol, whale, hotTokens] = await Promise.all([
        fetch('https://web3.okx.com'+SIG_PATH, {method:'POST', headers:okxWeb3Sign('POST',SIG_PATH,b1), body:b1}).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('https://web3.okx.com'+SIG_PATH, {method:'POST', headers:okxWeb3Sign('POST',SIG_PATH,b2), body:b2}).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('https://web3.okx.com'+SIG_PATH, {method:'POST', headers:okxWeb3Sign('POST',SIG_PATH,b3), body:b3}).then(r=>r.json()).catch(()=>({data:[]})),
        fetch('https://api.geckoterminal.com/api/v2/networks/bsc/trending_pools?page=1', {headers:{'Accept':'application/json;version=20230302'}}).then(r=>r.json()).catch(()=>({data:[]}))
      ]);

      // 信号格式化
      function fmtSignal(list, label) {
        return (Array.isArray(list) ? list : []).slice(0,5).map(s => {
          const t = s.token || {};
          const chg = parseFloat(s.soldRatioPercent||0);
          return {
            label, symbol: t.symbol||'?', name: t.tokenName||'',
            price: parseFloat(s.price||0),
            amountUsd: parseFloat(s.amountUsd||0),
            soldRatio: parseFloat(s.soldRatioPercent||0),
            address: t.tokenContractAddress||'',
            url: t.tokenContractAddress ? 'https://www.okx.com/web3/dex-swap#inputChain=56&inputCurrency='+t.tokenContractAddress : ''
          };
        });
      }

      // 趋势池（新盘）
      const trendPools = ((hotTokens.data||[]).slice(0,5)).map(p => {
        const a = p.attributes||{};
        const sym = (a.name||'?').split(' / ')[0].slice(0,10);
        return {label:'新盘', symbol:sym, price:parseFloat(a.base_token_price_usd||0),
          change24h:parseFloat((a.price_change_percentage||{}).h24||0),
          volume24h:parseFloat((a.volume_usd||{}).h24||0),
          url:'https://www.geckoterminal.com/bsc/pools/'+(p.id||'').split('_')[1]};
      });

      // KOL/巨鲸 권한 없으면 신규풀 데이터로 대체
      let kolData = fmtSignal(kol.data, 'KOL');
      let whaleData = fmtSignal(whale.data, '巨鲸');
      if(!kolData.length || !whaleData.length) {
        const newPools = await fetch('https://api.geckoterminal.com/api/v2/networks/bsc/new_pools?page=1',
          {headers:{'Accept':'application/json;version=20230302'}}).then(r=>r.json()).catch(()=>({data:[]}));
        const fmtPool = (p,label) => {
          const a=p.attributes||{};
          const sym=(a.name||'?').split(' / ')[0].slice(0,10);
          return {label, symbol:sym, price:parseFloat(a.base_token_price_usd||0),
            change24h:parseFloat((a.price_change_percentage||{}).h24||0),
            amountUsd:parseFloat((a.volume_usd||{}).h24||0), soldRatio:0,
            url:'https://www.geckoterminal.com/bsc/pools/'+(p.id||'').split('_')[1]};
        };
        const validNew = (newPools.data||[]).filter(p=>parseFloat(((p.attributes||{}).volume_usd||{}).h24||0)>200);
        if(!kolData.length) kolData = validNew.slice(0,5).map(p=>fmtPool(p,'新盘'));
        if(!whaleData.length) whaleData = trendPools.slice(0,5).map(p=>({...p, label:'趋势'}));
      }
      res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
      res.end(JSON.stringify({
        ok:true,
        smartMoney: fmtSignal(sm.data, '聪明钱'),
        kol: kolData,
        whale: whaleData,
        trend: trendPools
      }));
    } catch(e) {
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:false,smartMoney:[],kol:[],whale:[],trend:[]}));
    }
    return;
  }

  // ── BSC 热门 Meme  // ── BSC 热门 Meme (DexScreener) ─────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/bsc/hot-meme')) {
    const mockTokens = [
      {symbol:'BABYDOGE',name:'Baby Doge Coin',price:0.0000000024,change24h:5.2,volume24h:2500000,marketCap:850000000},
      {symbol:'SAFEMOON',name:'SafeMoon',price:0.00015,change24h:-2.1,volume24h:1800000,marketCap:95000000},
      {symbol:'FLOKI',name:'Floki Inu',price:0.000028,change24h:3.8,volume24h:3200000,marketCap:280000000},
      {symbol:'SHIB',name:'Shiba Inu',price:0.000011,change24h:1.5,volume24h:5000000,marketCap:6500000000},
      {symbol:'PEPE',name:'Pepe',price:0.0000085,change24h:-0.8,volume24h:4200000,marketCap:3500000000}
    ];
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify({ok:true,tokens:mockTokens}));
    return;
  }


  // ── 大户信号（OKX DEX V6 实时数据）────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/okx/signal')) {
    try {
      const OKX_KEY = '3fe0f8e7-1ef8-4304-afb0-ca67afe3995d';
      const OKX_SECRET = 'A2E6A81E0B8C9BCBE0836AFC8F32DF44';
      const OKX_PASS = '110220aA!';
      const crypto = require('crypto');
      const u = new URL('https://x'+req.url);
      const chainIndex = u.searchParams.get('chain') || '56';
      const walletType = u.searchParams.get('type') || '1,2,3';
      const limit = u.searchParams.get('limit') || '10';
      const body = JSON.stringify({chainIndex, walletType, limit});
      const ts = new Date().toISOString();
      const path = '/api/v6/dex/market/signal/list';
      const sig = crypto.createHmac('sha256', OKX_SECRET).update(ts+'POST'+path+body).digest('base64');
      const r = await new Promise((resolve, reject) => {
        const ro = require('https').request({
          hostname:'www.okx.com', path, method:'POST',
          headers:{'OK-ACCESS-KEY':OKX_KEY,'OK-ACCESS-SIGN':sig,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-PASSPHRASE':OKX_PASS,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
        }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
        ro.on('error', reject); ro.write(body); ro.end();
      });
      if(r.code === '0' && r.data) {
        const signals = r.data.map(s => ({
          time: parseInt(s.timestamp),
          type: s.walletType || 'SMART_MONEY',
          symbol: s.token?.symbol || '?',
          name: s.token?.name || '',
          address: s.token?.tokenAddress || '',
          logo: s.token?.logo || '',
          action: 'BUY',
          amount_usd: parseFloat(s.amountUsd),
          price: parseFloat(s.price),
          wallets: parseInt(s.triggerWalletCount || '1'),
          sold_ratio: parseFloat(s.soldRatioPercent || '0'),
          chain: chainIndex
        }));
        okxJ(200, {ok:true, signals});
      } else {
        okxJ(200, {ok:false, code:r.code, msg:r.msg});
      }
    } catch(e) { okxJ(500, {ok:false, error:e.message}); }
    return;
  }


  // ── BNB 市场情绪指数（资金费率+买卖盘+BNB涨跌+鲸鱼）
  if (req.method === 'GET' && req.url.startsWith('/api/market/sentiment')) {
    try {
      const [ticker, fr, ob, trades] = await Promise.all([
        okxGet('/api/v5/market/ticker?instId=BNB-USDT'),
        okxGet('/api/v5/public/funding-rate?instId=BNB-USDT-SWAP'),
        okxGet('/api/v5/market/books?instId=BNB-USDT&sz=20'),
        okxGet('/api/v5/market/trades?instId=BNB-USDT&limit=100'),
      ]);
      const t = ticker.data?.[0] || {};
      const f = fr.data?.[0] || {};
      const b = ob.data?.[0] || {};
      const last = parseFloat(t.last||0);
      const open24h = parseFloat(t.open24h||last);
      const bnb24h = open24h ? ((last-open24h)/open24h*100).toFixed(2) : '0.00';
      const fundingRate = f.fundingRate ? (parseFloat(f.fundingRate)*100).toFixed(4) : '0.0000';
      const bidVol = (b.bids||[]).reduce((s,r)=>s+parseFloat(r[1]),0);
      const askVol = (b.asks||[]).reduce((s,r)=>s+parseFloat(r[1]),0);
      const obRatio = askVol>0 ? (bidVol/askVol).toFixed(2) : '1.00';
      const whaleBuys = (trades.data||[]).filter(tr=>parseFloat(tr.sz)>=50&&tr.side==='buy').length;
      const whaleSells = (trades.data||[]).filter(tr=>parseFloat(tr.sz)>=50&&tr.side==='sell').length;
      let fgi = 50 + parseFloat(bnb24h)*3;
      fgi = Math.min(100, Math.max(0, fgi));
      const fgiScore = Math.round(fgi);
      const sentiment = fgiScore>=75?'极度贪婪':fgiScore>=55?'贪婪':fgiScore>=45?'中性':fgiScore>=25?'恐慌':'极度恐慌';
      okxJ(200, {ok:true, score:fgiScore, sentiment, bnbChg:bnb24h, fundRate:fundingRate, obRatio, bnb24h, whaleBuys, whaleSells, whaleCount:whaleBuys+whaleSells, fgi:fgiScore, source:'okx-v5'});
    } catch(e) { okxJ(500, {ok:false, error:e.message}); }
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/okx/swap-quote')) {
    const u = new URL(req.url,'http://x');
    const token = u.searchParams.get('token');
    const amount = u.searchParams.get('amount') || '10000000000000000'; // 0.01 BNB
    const BNB = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    if (!token) return okxJ(400,{ok:false,error:'missing token'});
    try {
      const d = await okxGet(`/api/v6/dex/aggregator/quote?chainIndex=56&amount=${amount}&fromTokenAddress=${BNB}&toTokenAddress=${token}`);
      if (!d.data?.[0]) return okxJ(400,{ok:false,error:'no quote',msg:d.msg});
      const q = d.data[0];
      okxJ(200,{ok:true,toTokenAmount:q.toTokenAmount,toToken:q.toTokenAddress,estimatedGas:q.estimatedGas,router:q.dexRouterList?.[0]?.dexProtocol?.[0]?.dexName});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }

  // ── OKX DEX Swap TX (用户钱包地址 + 金额，返回待签交易)
  if (req.method === 'GET' && req.url.startsWith('/api/okx/swap-tx')) {
    const u = new URL(req.url,'http://x');
    const token = u.searchParams.get('token');
    const amount = u.searchParams.get('amount');
    const wallet = u.searchParams.get('wallet');
    const slippage = u.searchParams.get('slippage') || '1';
    const BNB = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    if (!token || !amount || !wallet) return okxJ(400,{ok:false,error:'missing params'});
    try {
      const d = await okxGet(`/api/v6/dex/aggregator/swap?chainIndex=56&amount=${amount}&fromTokenAddress=${BNB}&toTokenAddress=${token}&userWalletAddress=${wallet}&slippagePercent=${slippage}`);
      if (!d.data?.[0]?.tx) return okxJ(400,{ok:false,error:'no tx',msg:d.msg});
      const tx = d.data[0].tx;
      okxJ(200,{ok:true,tx:{to:tx.to,value:tx.value,data:tx.data,gas:tx.gas,gasPrice:tx.gasPrice}});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/okx/discover')) {
    try {
      // DexScreener BSC four.meme 热门 meme（按24h成交量）
      const r = await fetch('https://api.dexscreener.com/latest/dex/search/?q=fourmeme&chainIds=bsc', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      const d = await r.json();
      const pairs = (d.pairs || [])
        .filter(p => p.chainId === 'bsc' && p.baseToken?.address)
        .sort((a, b) => parseFloat(b.volume?.h24 || 0) - parseFloat(a.volume?.h24 || 0));
      const seen = new Set();
      const tokens = [];
      for (const p of pairs) {
        const addr = p.baseToken.address.toLowerCase();
        if (seen.has(addr)) continue;
        seen.add(addr);
        tokens.push({
          addr: p.baseToken.address,
          name: p.baseToken.name,
          symbol: p.baseToken.symbol,
          price: parseFloat(p.priceUsd || 0),
          change24h: parseFloat(p.priceChange?.h24 || 0),
          volume: parseFloat(p.volume?.h24 || 0),
          liquidity: parseFloat(p.liquidity?.usd || 0),
          image: p.info?.imageUrl || '',
          pairUrl: p.url || '',
          ts: Math.floor(Date.now() / 1000)
        });
        if (tokens.length >= 40) break;
      }
      okxJ(200, { ok: true, tokens });
    } catch(e) { okxJ(500,{ok:false,error:e.message}); }
    return;
  }

  // ── 持有人分布（通过 BSCScan Transfer 事件推算前10持有人）
  if (req.method === 'GET' && req.url.startsWith('/api/okx/holders')) {
    const token = new URL(req.url,'http://x').searchParams.get('token');
    if (!token) return okxJ(400,{ok:false,error:'missing token'});
    try {
      const r = await fetch(`https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${token}&page=1&offset=100&sort=desc&apikey=7FAQMWNY16DVSQNCD7TNUD3J1Q8B77Q8IZ`);
      const d = await r.json();
      const balMap = {};
      for (const tx of (d.result||[])) {
        if (tx.from!=='0x0000000000000000000000000000000000000000') balMap[tx.from]=(balMap[tx.from]||0)-parseFloat(tx.value);
        balMap[tx.to]=(balMap[tx.to]||0)+parseFloat(tx.value);
      }
      const holders = Object.entries(balMap).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,10)
        .map(([addr,bal])=>({addr,bal:bal.toString()}));
      okxJ(200,{ok:true,holders});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }

  // ── LLM 聊天代理
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { messages } = JSON.parse(body);
        const systemPrompt = {
          role: 'system',
          content: `你是 Seki AI Agent 助手，一个部署在 BSC 链上的智能激励平台的私人 AI 助手。

你的能力：
1. 通用对话：回答任何话题
2. Seki 平台专家：熟悉平台机制、ERC-8183、任务系统、taxPool
3. 策略顾问：帮用户分析和配置 Personal Agent 执行策略
4. 链上操作引导：指导用户如何完成任务、委托 Agent

Personal Agent 策略解析：当用户描述执行策略时（如"帮我自动完成所有持仓任务"），你需要理解用户意图，输出推荐的策略配置，并用友好语言解释。
策略JSON示例：{"autoExecute":true,"taskTypes":[0],"minReward":"0.005","maxPerDay":10,"tokenWhitelist":[]}
任务类型：0=持仓, 1=交互, 2=流动性

回答风格：简洁、友好、专业。中文回答（除非用户用英文）。如果涉及策略配置，在回答末尾附上策略JSON块（用代码块包裹）。`
        };
        const payload = {
          model: 'gpt-5.4',
          messages: [systemPrompt, ...messages],
          stream: true,
          max_tokens: 1000
        };
        const https2 = require('https');
        const apiUrl = new URL('https://code.newcli.com/codex/v1/chat/completions');
        const options = {
          hostname: apiUrl.hostname,
          path: apiUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sk-ant-oat01-biFe9ra5JZFx7RWA1_pFNjay2Vr3MOSOJuf9rxtdw5MTxP_-yggQmxZWsYuIgZfjr2vA3qgFBSz2ZmK83ZbAgvAZZR7mHAA'
          }
        };
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        const apiReq = https2.request(options, apiRes => {
          apiRes.on('data', chunk => res.write(chunk));
          apiRes.on('end', () => res.end());
        });
        apiReq.on('error', e => { res.write(`data: {"error":"${e.message}"}\n\n`); res.end(); });
        apiReq.write(JSON.stringify(payload));
        apiReq.end();
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // ── Agent 运营报告
  if (req.method === 'GET' && req.url === '/api/agent-status') {
    try {
      const sharedFile = path.join(__dirname, 'agent-shared.json');
      const shared = JSON.parse(await fs.promises.readFile(sharedFile,'utf8').catch(()=>'{}'));
      const now = Date.now();
      const alive = (ts) => ts && (now - ts) < 10 * 60 * 1000; // 10min
      okxJ(200, {
        ok: true,
        agents: {
          observer:  { alive: alive(shared.lastObserve),  lastRun: shared.lastObserve || 0,  role: 'ObserverAgent',  desc: '链上信号采集' },
          decision:  { alive: alive(shared.decisionAgent?.lastRun), lastRun: shared.decisionAgent?.lastRun || 0, role: 'DecisionAgent', desc: 'AI 推理决策' },
          executor:  { alive: alive(shared.executorAgent?.lastRun), lastRun: shared.executorAgent?.lastRun || 0, role: 'ExecutorAgent', desc: '自主支付执行' },
        },
        lastDecision: shared.decision || null,
        bsc: { bnbChg: shared.bsc?.bnbChg || 0, tokens: Object.keys(shared.bsc?.tokens||{}).length },
        xlayer: { taskCount: shared.xlayer?.taskCount || 0, activeTasks: shared.xlayer?.activeTasks || 0 },
      });
    } catch(e) { okxJ(500,{ok:false,error:e.message}); }
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/agent/report')) {
    try {
      const meta = JSON.parse(await fs.promises.readFile(path.join(__dirname,'agent','agent-meta.json'),'utf8').catch(()=>'{}'));
      const logsRaw = await fs.promises.readFile(path.join(__dirname,'agent-logs.json'),'utf8').catch(()=>'[]');
      const logs = JSON.parse(logsRaw);
      const now = Date.now();
      const day = 24*60*60*1000;
      const days = {};
      for (const l of logs) {
        const d = new Date(l.ts).toLocaleDateString('zh-CN');
        if (!days[d]) days[d]={tasks:0,claimed:0,reward:0};
        if (l.tag==='CREATE') days[d].tasks++;
      }
      okxJ(200,{ok:true,days,total:{tasks:logs.filter(l=>l.tag==='CREATE').length,logs:logs.length}});
    } catch(e){okxJ(500,{ok:false,error:e.message});}
    return;
  }

  // ── SSE: 任务实时推送
  if (req.method === 'GET' && req.url === '/api/sse') {
    res.writeHead(200,{...cors,'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write('data: {"type":"connected"}\n\n');
    const iv = setInterval(async()=>{
      try {
        const logsRaw = await fs.promises.readFile(path.join(__dirname,'agent-logs.json'),'utf8').catch(()=>'[]');
        const logs = JSON.parse(logsRaw);
        const last = logs[logs.length-1];
        if (last) res.write('data: '+JSON.stringify({type:'log',...last})+'\n\n');
      } catch {}
    },5000);
    req.on('close',()=>clearInterval(iv));
    return;
  }

  // ── ADMIN: GET /admin
  if (req.method === 'GET' && req.url.startsWith('/admin')) {
    const url = new URL('http://x' + req.url);
    const pass = url.searchParams.get('pass') || '';
    if (pass !== ADMIN_PASS) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seki Admin</title>
<style>body{background:#0d0d1a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:40px;text-align:center;min-width:320px}
input{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#fff;padding:10px 16px;border-radius:8px;font-size:15px;width:100%;box-sizing:border-box;margin:16px 0}
button{background:linear-gradient(135deg,#7c3aed,#3b82f6);border:none;color:#fff;padding:12px 32px;border-radius:8px;font-size:15px;cursor:pointer;width:100%}
</style></head><body><div class="box"><h2>🔐 Seki Admin</h2>
<form onsubmit="event.preventDefault();location.href='/admin?pass='+document.getElementById('p').value">
<input id="p" type="password" placeholder="管理员密码">
<button type="submit">进入后台</button></form></div></body></html>`);
      return;
    }
    // 管理页面内容
    const allUsers = Object.values(users).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    const totalTokens = allUsers.reduce((s, u) => s + (u.tokens ? u.tokens.length : 0), 0);
    const userRows = allUsers.map(u => {
      const used = launchCount.get(u.addr) || 0;
      const lastSeen = u.lastSeen ? new Date(u.lastSeen).toLocaleString('zh-CN') : '—';
      const created = u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '—';
      const tokenList = (u.tokens || []).map(t =>
        `<div style="font-size:11px;font-family:monospace;color:#a78bfa;margin:2px 0">
          ${t.symbol||'?'} · ${t.addr ? '<a href="https://bscscan.com/token/'+t.addr+'" target="_blank" style="color:#60a5fa">'+t.addr.slice(0,12)+'...</a>' : '上链中'}
          · ${new Date(t.ts).toLocaleString('zh-CN')}
        </div>`).join('');
      return `<tr>
        <td style="font-family:monospace;font-size:12px;color:#a78bfa">${u.addr.slice(0,10)}...</td>
        <td style="text-align:center">${used} / ${LAUNCH_LIMIT}</td>
        <td style="text-align:center"><a href="/admin/reset-launches?pass=${ADMIN_PASS}&addr=${u.addr}" style="color:#f87171;font-size:11px">重置</a></td>
        <td>${lastSeen}</td>
        <td style="max-width:300px">${tokenList || '<span style="color:#6b7280">暂无</span>'}</td>
      </tr>`;
    }).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seki Admin</title>
<style>
*{box-sizing:border-box}body{background:#0d0d1a;color:#e5e7eb;font-family:sans-serif;margin:0;padding:20px}
h1{background:linear-gradient(135deg,#7c3aed,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 24px}
.stats{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px 24px;min-width:140px}
.stat-n{font-size:28px;font-weight:700;color:#a78bfa}.stat-l{font-size:12px;color:#9ca3af;margin-top:4px}
table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.03);border-radius:12px;overflow:hidden}
th{background:rgba(255,255,255,.08);padding:12px 16px;text-align:left;font-size:12px;font-weight:700;letter-spacing:1px;color:#9ca3af}
td{padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);vertical-align:top}
tr:hover td{background:rgba(255,255,255,.03)}
a{color:#60a5fa;text-decoration:none}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
</style></head><body>
<h1>🏯 Seki Admin</h1>
<div class="stats">
  <div class="stat"><div class="stat-n">${allUsers.length}</div><div class="stat-l">注册用户</div></div>
  <div class="stat"><div class="stat-n">${totalTokens}</div><div class="stat-l">发币总数</div></div>
  <div class="stat"><div class="stat-n">${Object.values(users).filter(u=>(launchCount.get(u.addr)||0)>0).length}</div><div class="stat-l">活跃钱包</div></div>
</div>
<table>
<thead><tr><th>钱包地址</th><th>发币次数</th><th>操作</th><th>最后活跃</th><th>发币记录</th></tr></thead>
<tbody>${userRows || '<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:32px">暂无用户</td></tr>'}</tbody>
</table>
<p style="margin-top:16px;font-size:11px;color:#6b7280">刷新页面获取最新数据 · <a href="/admin?pass=${ADMIN_PASS}">刷新</a></p>
</body></html>`);
    return;
  }

  // ── ADMIN: 重置发币次数
  if (req.method === 'GET' && req.url.startsWith('/admin/reset-launches')) {
    const url = new URL('http://x' + req.url);
    const pass = url.searchParams.get('pass') || '';
    const addr = url.searchParams.get('addr') || '';
    if (pass !== ADMIN_PASS || !addr) { res.writeHead(403, cors); res.end('Forbidden'); return; }
    launchCount.set(addr.toLowerCase(), 0);
    saveLaunchCount();
    res.writeHead(302, { Location: '/admin?pass=' + ADMIN_PASS });
    res.end();
    return;
  }

  // ── API: GET /api/meta?id=N 或 GET /api/meta (全部)
  if (req.method === 'GET' && req.url.startsWith('/api/meta')) {
    const u = new URL(req.url, 'https://bdmeme.xyz');
    const id = u.searchParams.get('id');
    const data = loadMeta();
    const result = id ? (data[id] || {}) : data;
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify(result));
    return;
  }

  // ── API: POST /api/meta  body: {id, title, desc}
  // ── GET /api/launch-count?addr=0x...
  if (req.method === 'GET' && req.url.startsWith('/api/launch-count')) {
    const u = new URL(req.url, 'https://x');
    const a = (u.searchParams.get('addr')||'').toLowerCase();
    const used = a ? (launchCount.get(a)||0) : 0;
    res.writeHead(200, {'Content-Type':'application/json',...cors});
    res.end(JSON.stringify({ used, limit: LAUNCH_LIMIT, remaining: Math.max(0, LAUNCH_LIMIT - used) }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/meta') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { id, title, desc } = JSON.parse(body);
        if (id === undefined) throw new Error('missing id');
        const data = loadMeta();
        data[String(id)] = {
          title: (title || '').slice(0, 100),
          desc:  (desc  || '').slice(0, 500),
          ts: Date.now(),
        };
        saveMeta(data);
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true, id }));
      } catch(e) {
        res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }


  // ── API: POST /api/set-budget  (Agent 帮用户调 setBudget)
  if (req.method === 'POST' && req.url === '/api/set-budget') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { jobId, budget } = JSON.parse(body);
        if (jobId === undefined || !budget) throw new Error('missing jobId or budget');
        const { ethers } = require('/root/.openclaw/workspace/memebounty-v2/backend/node_modules/ethers');
        const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const REGISTRY_ADDR = process.env.REGISTRY_ADDRESS || '0xABBB59fC5Ca85DC4b15B2f8698a0395A72F932bf';
        const regAbi = ['function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external'];
        const regCon = new ethers.Contract(REGISTRY_ADDR, regAbi, agentWallet);
        const budgetWei = ethers.parseEther(String(budget));
        const tx = await regCon.setBudget(jobId, budgetWei, '0x');
        await tx.wait();
        console.log('[set-budget] job #'+jobId+' budget set to '+budget+' BNB, tx:', tx.hash);
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true, txHash: tx.hash }));
      } catch(e) {
        console.error('[set-budget] error:', e.message);
        res.writeHead(400, cors);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }


  // ── API: POST /api/jobs/cancel
  if (req.method === 'POST' && req.url === '/api/jobs/cancel') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { jobId } = JSON.parse(body);
        const JOBS_FILE = path.join(BASE, 'agent-jobs.json');
        let jobs = [];
        try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE,'utf8')); } catch {}
        jobs = jobs.map(j => Number(j.jobId) === Number(jobId) ? { ...j, active: false, cancelledAt: Date.now() } : j);
        fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
        console.log('[jobs/cancel] job #'+jobId+' deactivated');
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }


  // ── API: POST /api/update-token (补全代币地址)
  if (req.method === 'POST' && req.url === '/api/update-token') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { wallet, txHash, addr: tokenAddr } = JSON.parse(body);
        if (!wallet || !txHash || !tokenAddr) throw new Error('missing params');
        const u = getUser(wallet.toLowerCase());
        if (u.tokens) {
          const t = u.tokens.find(t => t.txHash === txHash);
          if (t) { t.addr = tokenAddr; t.pending = false; saveUsers(); }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }


  // ── API: POST /api/record-launch (用户自己广播后通知服务器记录)
  if (req.method === 'POST' && req.url === '/api/record-launch') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { walletAddr, name, symbol, txHash, tokenAddress, label } = JSON.parse(body);
        if (!walletAddr || !txHash) throw new Error('missing params');
        const addrKey = walletAddr.toLowerCase();
        launchCount.set(addrKey, (launchCount.get(addrKey)||0) + 1);
        saveLaunchCount();
        const u = getUser(addrKey);
        if (!u.tokens) u.tokens = [];
        u.tokens.unshift({ addr: tokenAddress||null, name, symbol, txHash, ts: Date.now(), label: label||'Meme', pending: !tokenAddress });
        u.tokens = u.tokens.slice(0, 50);
        u.lastSeen = Date.now();
        saveUsers();
        console.log('[record-launch] wallet:', addrKey, 'token:', name, txHash);
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // ── API: GET /api/jobs
  if (req.method === 'GET' && req.url === '/api/jobs') {
    const JOBS_FILE = path.join(BASE, 'agent-jobs.json');
    let jobs = [];
    try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE,'utf8')); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify(jobs));
    return;
  }

  // ── API: POST /api/jobs  body: {token, agentType, budget, hours, tg, jobId}
  if (req.method === 'POST' && req.url === '/api/jobs') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        const JOBS_FILE = path.join(BASE, 'agent-jobs.json');
        let jobs = [];
        try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE,'utf8')); } catch {}
        // deactivate same token's existing jobs
        jobs = jobs.map(j => j.token && j.token.toLowerCase() === entry.token?.toLowerCase() ? { ...j, active: false } : j);
        jobs.push({ ...entry, active: true, createdAt: Date.now() });
        fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── API: GET /api/jobs/rank — 按完成任务数排行
  if (req.method === 'GET' && req.url.startsWith('/api/jobs/rank')) {
    const JOBS_FILE = path.join(BASE, 'agent-jobs.json');
    let jobs = [];
    try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE,'utf8')); } catch {}
    const u = new URL('http://x' + req.url);
    const limit = Math.min(parseInt(u.searchParams.get('limit')||'20'), 100);
    // 按 agentType 统计完成数
    const map = {};
    for (const j of jobs) {
      const key = (j.agentType || 'unknown').toLowerCase();
      if (!map[key]) map[key] = { agentType: key, total: 0, completed: 0, totalBudget: 0 };
      map[key].total++;
      if (j.status === 'done' || j.settled) map[key].completed++;
      map[key].totalBudget += Number(j.budget) || 0;
    }
    const rank = Object.values(map).sort((a,b) => b.completed - a.completed).slice(0, limit);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({ ok: true, rank }));
    return;
  }

  // ── API: POST /api/jobs/settle — 结算任务
  if (req.method === 'POST' && req.url === '/api/jobs/settle') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { jobId, result, txHash } = JSON.parse(body);
        if (!jobId) throw new Error('missing jobId');
        const JOBS_FILE = path.join(BASE, 'agent-jobs.json');
        let jobs = [];
        try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE,'utf8')); } catch {}
        let found = false;
        jobs = jobs.map(j => {
          if (Number(j.jobId) === Number(jobId)) {
            found = true;
            return { ...j, status: 'done', settled: true, result: result||'', settleTx: txHash||'', settledAt: Date.now() };
          }
          return j;
        });
        if (!found) throw new Error('job not found: ' + jobId);
        fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
        console.log('[jobs/settle] job #'+jobId+' settled');
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, cors); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── /api/tasks/mock → 已迁移为真实任务数据
  if (req.url === '/api/tasks/mock' && req.method === 'GET') {
    const JOBS_FILE = path.join(BASE, 'agent-jobs.json');
    let jobs = [];
    try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); } catch {}
    const active = jobs.filter(j => j.active);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify(active));
    return;
  }

  // ── Evolution Hall API endpoints ──────────────────────
  if (req.url === '/api/evolution/dashboard' && req.method === 'GET') {
    try {
      const evolver = require('./agent/evolver');
      const dashboard = evolver.getEvolutionDashboard();
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(dashboard));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/evolution/reflections' && req.method === 'GET') {
    try {
      const reflDir = path.join(BASE, 'data', 'reflections');
      if (!fs.existsSync(reflDir)) { res.writeHead(200, { ...cors }); res.end('[]'); return; }
      const files = fs.readdirSync(reflDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30);
      const reflections = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(reflDir, f), 'utf8')); } catch { return null; }
      }).filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(reflections));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/evolution/skills' && req.method === 'GET') {
    try {
      const skillDir = path.join(BASE, 'data', 'skills');
      if (!fs.existsSync(skillDir)) { res.writeHead(200, { ...cors }); res.end('[]'); return; }
      const files = fs.readdirSync(skillDir).filter(f => f.endsWith('.json'));
      const skills = files.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(skillDir, f), 'utf8')); } catch { return null; }
      }).filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(skills));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/evolution/proposals' && req.method === 'GET') {
    try {
      const evolver = require('./agent/evolver');
      const proposals = evolver.getPendingProposals();
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(proposals));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/evolution/status' && req.method === 'GET') {
    try {
      const evolver = require('./agent/evolver');
      const reflections = evolver.getRecentReflections ? evolver.getRecentReflections(100) : [];
      const todayCycles = evolver.getTodayCycles ? evolver.getTodayCycles() : [];
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({
        version: evolver.versionString(),
        totalCycles: todayCycles.length,
        totalReflections: reflections.length,
        lastReflection: reflections.length ? reflections[0].timestamp : null,
        running: true
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ version: 'v1.0.0', totalCycles: 0, totalReflections: 0, lastReflection: null, running: false }));
    }
    return;
  }

  if (req.url === '/api/evolution/cycles' && req.method === 'GET') {
    try {
      const taskLogger = require('./agent/evolver/task-logger');
      const stats = taskLogger.getStats();
      const recent = taskLogger.getRecentCycles(50);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ stats, recent }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── 静态文件
  let p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (p === '/xlayer' || p === '/xlayer/') p = '/xlayer.html';
  if (p === '/chat' || p === '/chat/') p = '/chat.html';
  if (p === '/evolution' || p === '/evolution/') p = '/evolution.html';
  if (p === '/docs' || p === '/docs/') p = '/docs/index.html';
  if (p === '/contract') p = '/MemeBountyV2.sol';
  if (p === '/registry') p = '/AgentRegistry.sol';
  const full = path.join(BASE, p);
  if (!full.startsWith(BASE)) { res.writeHead(403); res.end(); return; }
  try {
    const data = fs.readFileSync(full);
    const ct = p.endsWith('.html') ? 'text/html;charset=utf-8'
             : p.endsWith('.sol')  ? 'text/plain;charset=utf-8'
             : p.endsWith('.json') ? 'application/json'
             : p.endsWith('.jpg') || p.endsWith('.jpeg') ? 'image/jpeg'
             : p.endsWith('.png')  ? 'image/png'
             : p.endsWith('.webp') ? 'image/webp'
             : p.endsWith('.ico')  ? 'image/x-icon'
             : p.endsWith('.js')   ? 'application/javascript'
             : p.endsWith('.css')  ? 'text/css;charset=utf-8'
             : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct, ...cors });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
  } catch(e) { console.error('[server] unhandled:', e.message); try { res.writeHead(500); res.end(JSON.stringify({ok:false,error:e.message})); } catch {} }
};

let _mainServer;
if (_useHttps) {
  _mainServer = https.createServer(opts, _serverHandler);
  _mainServer.listen(443, () => console.log('HTTPS ok on :443'));

  // ── bdmeme.xyz WebSocket 升级代理 ──
  _mainServer.on('upgrade', (req, socket, head) => {
    const h = (req.headers.host || '').replace(/:\d+$/, '');
    if (h === 'bdmeme.xyz' || h === 'www.bdmeme.xyz') {
      const net = require('net');
      const upstream = net.connect(4000, '127.0.0.1', () => {
        upstream.write(
          `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
          '\r\n\r\n'
        );
        if (head && head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
    }
  });

  // HTTP → HTTPS 重定向
  require('http').createServer((req, res) => {
    const host = req.headers.host || 'seki-ai.com';
    res.writeHead(301, { Location: 'https://' + host + req.url });
    res.end();
  }).listen(80, () => console.log('HTTP redirect ok on :80'));
} else {
  // No SSL — plain HTTP
  const HTTP_PORT = process.env.PORT || 3000;
  _mainServer = http.createServer(_serverHandler);
  _mainServer.listen(HTTP_PORT, () => console.log(`HTTP ok on :${HTTP_PORT}`));
}
