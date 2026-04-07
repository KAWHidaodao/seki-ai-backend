/**
 * strategy-evolver.js — 策略进化器
 *
 * 根据 Meta-Agent 反思结果，自动调整人格切换阈值、
 * 触发规则和奖励倍率。变更需要管理员确认才生效。
 */
const fs   = require('fs');
const path = require('path');

const STRATEGY_FILE = path.join(__dirname, '..', '..', 'data', 'evolution', 'active-strategy.json');
const PENDING_FILE  = path.join(__dirname, '..', '..', 'data', 'evolution', 'pending-proposals.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ── 默认策略（与 loop.js 当前硬编码值对应）── */
const DEFAULT_STRATEGY = {
  version: 'v2.0.0',
  updated: new Date().toISOString(),

  // 人格触发条件
  persona_rules: {
    hunter: {
      trigger: 'bnb24hChange < -5 || volumeSurge > 3',
      description: '市场恐慌/成交量暴增时激活猎人',
      reward_multiplier: 2.0
    },
    strategist: {
      trigger: 'Math.abs(bnb24hChange) < 3 && !whaleDetected',
      description: '市场平静时激活策略师',
      reward_multiplier: 1.0
    },
    herald: {
      trigger: 'bnb24hChange > 5 || whaleDetected',
      description: '市场上涨/鲸鱼出现时激活传令官',
      reward_multiplier: 1.5
    }
  },

  // 任务参数
  task_params: {
    earlybird_window_seconds: 300,
    earlybird_reward_multiplier: 1.5,
    max_reward_per_task_bnb: 0.05,
    min_taxpool_bnb: 0.01
  },

  // 反思触发条件
  reflection_interval_minutes: 30,
  reflection_min_cycles: 3
};

/* ── 获取当前生效策略 ── */
function getActiveStrategy() {
  ensureDir(path.dirname(STRATEGY_FILE));
  try { return JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf8')); }
  catch { return { ...DEFAULT_STRATEGY }; }
}

/* ── 保存生效策略 ── */
function saveActiveStrategy(strategy) {
  ensureDir(path.dirname(STRATEGY_FILE));
  strategy.updated = new Date().toISOString();
  fs.writeFileSync(STRATEGY_FILE, JSON.stringify(strategy, null, 2));
}

/* ── 待审批提案管理 ── */
function getPendingProposals() {
  ensureDir(path.dirname(PENDING_FILE));
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); }
  catch { return []; }
}

function addProposal(proposal) {
  const proposals = getPendingProposals();
  const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  proposals.push({
    id,
    ...proposal,
    status: 'pending',
    created: new Date().toISOString()
  });
  ensureDir(path.dirname(PENDING_FILE));
  fs.writeFileSync(PENDING_FILE, JSON.stringify(proposals, null, 2));
  return id;
}

function approveProposal(proposalId) {
  const proposals = getPendingProposals();
  const idx = proposals.findIndex(p => p.id === proposalId);
  if (idx === -1) return null;

  proposals[idx].status = 'approved';
  proposals[idx].approved_at = new Date().toISOString();
  fs.writeFileSync(PENDING_FILE, JSON.stringify(proposals, null, 2));

  // 应用到生效策略
  const strategy = getActiveStrategy();
  const p = proposals[idx];

  if (p.type === 'rule' && p.target_persona && p.new_trigger) {
    if (strategy.persona_rules[p.target_persona]) {
      strategy.persona_rules[p.target_persona].trigger = p.new_trigger;
    }
  } else if (p.type === 'persona' && p.target_persona && p.new_multiplier) {
    if (strategy.persona_rules[p.target_persona]) {
      strategy.persona_rules[p.target_persona].reward_multiplier = p.new_multiplier;
    }
  } else if (p.type === 'param' && p.param_key && p.new_value !== undefined) {
    strategy.task_params[p.param_key] = p.new_value;
  }

  saveActiveStrategy(strategy);
  return proposals[idx];
}

function rejectProposal(proposalId) {
  const proposals = getPendingProposals();
  const idx = proposals.findIndex(p => p.id === proposalId);
  if (idx === -1) return null;
  proposals[idx].status = 'rejected';
  proposals[idx].rejected_at = new Date().toISOString();
  fs.writeFileSync(PENDING_FILE, JSON.stringify(proposals, null, 2));
  return proposals[idx];
}

/**
 * 从反思结果中提取并创建提案
 */
function processEvolutionProposals(reflection) {
  if (!reflection?.evolution_proposals?.length) return [];

  const created = [];
  for (const ep of reflection.evolution_proposals) {
    if (ep.confidence < 50) continue; // 低置信度跳过

    const id = addProposal({
      type: ep.type,
      description: ep.description,
      new_value_example: ep.new_value_example,
      expected_impact: ep.expected_impact,
      confidence: ep.confidence,
      source_reflection: reflection._meta?.timestamp
    });
    created.push(id);
  }
  return created;
}

module.exports = {
  DEFAULT_STRATEGY,
  getActiveStrategy,
  saveActiveStrategy,
  getPendingProposals,
  addProposal,
  approveProposal,
  rejectProposal,
  processEvolutionProposals
};
