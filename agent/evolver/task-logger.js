/**
 * task-logger.js — 任务执行日志收集器
 *
 * 每次 Agent 循环执行后，记录结构化任务数据，
 * 供 Meta-Agent 反思时使用。
 */
const fs   = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'evolution');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 记录一次循环的执行数据
 * @param {Object} entry
 *   - cycle_id:     循环序号
 *   - timestamp:    ISO 时间
 *   - persona:      当前人格 (hunter/strategist/herald)
 *   - market:       { bnbPrice, bnb24hChange, volumeSurge, whaleDetected, fundingRate }
 *   - tasks:        [{ type, token, reward, window, completed, participants, gasCost }]
 *   - taxPool:      当前 taxPool 余额(BNB)
 *   - totalReward:  本次发放总奖励
 *   - errors:       [string] 本次循环中的错误
 */
function logCycle(entry) {
  ensureDir(LOG_DIR);

  const today = new Date().toISOString().slice(0, 10);
  const logFile = path.join(LOG_DIR, `cycles-${today}.json`);

  let cycles = [];
  try { cycles = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}

  cycles.push({
    ...entry,
    logged_at: new Date().toISOString()
  });

  fs.writeFileSync(logFile, JSON.stringify(cycles, null, 2));
}

/**
 * 获取最近N分钟的循环日志
 */
function getRecentCycles(minutes = 30) {
  ensureDir(LOG_DIR);

  const cutoff = Date.now() - minutes * 60 * 1000;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let allCycles = [];
  for (const day of [yesterday, today]) {
    const f = path.join(LOG_DIR, `cycles-${day}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      allCycles = allCycles.concat(data);
    } catch {}
  }

  return allCycles.filter(c => new Date(c.timestamp).getTime() >= cutoff);
}

/**
 * 获取今日所有循环日志
 */
function getTodayCycles() {
  ensureDir(LOG_DIR);
  const today = new Date().toISOString().slice(0, 10);
  const f = path.join(LOG_DIR, `cycles-${today}.json`);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; }
}

/**
 * 获取汇总统计
 */
function getStats(cycles) {
  if (!cycles.length) return null;

  const personaCounts = {};
  let totalTasks = 0, completedTasks = 0, totalReward = 0, totalGas = 0;

  for (const c of cycles) {
    const p = c.persona || 'unknown';
    personaCounts[p] = (personaCounts[p] || 0) + 1;

    if (c.tasks) {
      for (const t of c.tasks) {
        totalTasks++;
        if (t.completed) completedTasks++;
        totalReward += (t.reward || 0);
        totalGas += (t.gasCost || 0);
      }
    }
  }

  return {
    cycles: cycles.length,
    persona_distribution: personaCounts,
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    completion_rate: totalTasks ? (completedTasks / totalTasks * 100).toFixed(1) + '%' : '0%',
    total_reward_bnb: totalReward.toFixed(6),
    total_gas_bnb: totalGas.toFixed(6),
    efficiency: totalGas > 0 ? (totalReward / totalGas).toFixed(2) : 'N/A',
    avg_bnb_price: cycles.filter(c => c.market?.bnbPrice).reduce((s, c) => s + c.market.bnbPrice, 0) / (cycles.filter(c => c.market?.bnbPrice).length || 1)
  };
}

module.exports = { logCycle, getRecentCycles, getTodayCycles, getStats };
