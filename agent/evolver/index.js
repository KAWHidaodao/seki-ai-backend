/**
 * index.js — Seki 自我进化系统入口
 *
 * 整合: Meta-Agent 反思 + 策略进化 + 技能库
 * 提供进化循环调度器 + API 数据接口
 */
const { logCycle, getRecentCycles, getTodayCycles, getStats } = require('./task-logger');
const { runReflection, getEvolutionDashboard, versionString, getRecentReflections, getSkills } = require('./meta-agent');
const { getActiveStrategy, getPendingProposals, approveProposal, rejectProposal, processEvolutionProposals } = require('./strategy-evolver');

let _reflectionTimer = null;
let _cycleCounter = 0;
let _lastReflectionTime = 0;

const REFLECTION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_CYCLES_BEFORE_REFLECT = 3;

/**
 * 在每次 Agent 循环结束后调用
 * 自动判断是否该触发反思
 */
async function onCycleComplete(cycleData) {
  // 记录日志
  logCycle(cycleData);
  _cycleCounter++;

  // 检查是否需要反思
  const elapsed = Date.now() - _lastReflectionTime;
  const strategy = getActiveStrategy();
  const interval = (strategy.reflection_interval_minutes || 30) * 60 * 1000;
  const minCycles = strategy.reflection_min_cycles || MIN_CYCLES_BEFORE_REFLECT;

  if (_cycleCounter >= minCycles && elapsed >= interval) {
    try {
      const result = await runReflection(strategy.reflection_interval_minutes || 30);
      if (result) {
        // 处理进化提案
        const proposals = processEvolutionProposals(result);
        if (proposals.length) {
          console.log(`🧬 [Evolver] ${proposals.length} 个新提案已创建，等待管理员审批`);
        }
      }
      _lastReflectionTime = Date.now();
      _cycleCounter = 0;
    } catch (err) {
      console.error('🧬 [Evolver] 反思流程异常:', err.message);
    }
  }
}

/**
 * 启动定时反思（作为备用，即使没有循环也定期反思）
 */
function startPeriodicReflection(intervalMs) {
  if (_reflectionTimer) clearInterval(_reflectionTimer);

  const ms = intervalMs || REFLECTION_INTERVAL_MS;
  console.log(`🧬 [Evolver] 定时反思已启动，间隔: ${ms / 60000} 分钟`);
  _lastReflectionTime = Date.now();

  _reflectionTimer = setInterval(async () => {
    try {
      const result = await runReflection(ms / 60000);
      if (result) processEvolutionProposals(result);
    } catch (err) {
      console.error('🧬 [Evolver] 定时反思异常:', err.message);
    }
  }, ms);
}

function stopPeriodicReflection() {
  if (_reflectionTimer) {
    clearInterval(_reflectionTimer);
    _reflectionTimer = null;
  }
}

module.exports = {
  // 核心
  onCycleComplete,
  startPeriodicReflection,
  stopPeriodicReflection,

  // 日志
  logCycle,
  getRecentCycles,
  getTodayCycles,
  getStats,

  // 反思
  runReflection,
  getRecentReflections,

  // 策略
  getActiveStrategy,
  getPendingProposals,
  approveProposal,
  rejectProposal,

  // 仪表盘
  getEvolutionDashboard,
  versionString,

  // 技能
  getSkills
};
