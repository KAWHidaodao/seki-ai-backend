/**
 * seed-mock-data-v2.js — 按照实际文件格式注入模拟数据
 */
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const EVOLUTION = path.join(BASE, 'data/evolution');
const REFLECTIONS = path.join(BASE, 'data/reflections');
const SKILLS = path.join(BASE, 'data/skills');

[EVOLUTION, REFLECTIONS, SKILLS].forEach(d => fs.mkdirSync(d, { recursive: true }));

const now = Date.now();
const h = 3600000;
const m = 60000;

// ── 1. Cycles: data/evolution/cycles-YYYY-MM-DD.json ──
const today = new Date().toISOString().slice(0,10);
const cycles = [];
for (let i = 0; i < 25; i++) {
  const ts = now - (25 - i) * 30 * m;
  const success = Math.random() > 0.3;
  cycles.push({
    timestamp: new Date(ts).toISOString(),
    cycleNumber: i + 1,
    persona: ['hunter', 'strategist', 'herald'][i % 3],
    decision: ['buy', 'sell', 'hold', 'boost'][Math.floor(Math.random() * 4)],
    token: ['PEPE', 'DOGE', 'SHIB', 'FLOKI', 'WIF'][Math.floor(Math.random() * 5)],
    success,
    priceInBNB: (Math.random() * 0.001).toFixed(8),
    liquidity: +(Math.random() * 50).toFixed(2),
    agentBNB: +(1.5 + Math.random() * 3).toFixed(4),
    taxPoolBNB: +(0.1 + Math.random() * 0.5).toFixed(4),
    sellPressure: +(Math.random() * 100).toFixed(1),
    signal: ['bullish', 'bearish', 'neutral'][Math.floor(Math.random() * 3)],
    sentiment: +Math.floor(Math.random() * 100),
    gasCost: +(0.001 + Math.random() * 0.01).toFixed(5),
    profit: success ? +(Math.random() * 0.05).toFixed(5) : -(Math.random() * 0.02).toFixed(5),
  });
}
fs.writeFileSync(path.join(EVOLUTION, `cycles-${today}.json`), JSON.stringify(cycles, null, 2));
console.log(`✓ ${cycles.length} cycles → cycles-${today}.json`);

// ── 2. Reflections: data/reflections/reflection-TIMESTAMP.json ──
const reflTexts = [
  {
    summary: '在过去6个周期中，Hunter人格的买入决策命中率偏低(40%)。主要原因是对高波动代币的入场时机把握不准，sellPressure超过70时仍然执行买入。',
    strengths: ['Strategist人格的hold决策准确率达到85%', 'Gas费用控制良好，平均0.005 BNB', '对PEPE的趋势判断持续准确'],
    weaknesses: ['Hunter买入时机过于激进', '未充分利用sentiment指标', 'Herald的boost操作ROI偏低'],
    suggestions: ['将sellPressure买入阈值从70降至60', '增加sentiment权重至决策模型', '限制Herald在低流动性时段的操作频率'],
  },
  {
    summary: '资金效率有显著提升，从上轮的62%提升至71%。Strategist主导的保守策略在震荡行情中表现优异。Herald的gas消耗需要优化batch策略。',
    strengths: ['资金效率提升9个百分点', '任务完成率稳定在78%', 'BNB余额保持健康水平(2.3 BNB)'],
    weaknesses: ['Herald gas消耗占总消耗的45%', '对FLOKI的判断连续3次失误', '夜间(UTC 0-6)决策质量明显下降'],
    suggestions: ['Herald操作改为batch模式', '将FLOKI加入观察名单暂停交易', '夜间切换为Strategist-only模式'],
  },
  {
    summary: '发现关键模式：当liquidity低于10 BNB且sentiment高于80时，大概率出现pump后dump。Agent在此模式下的3次买入全部亏损。已提取为新技能。',
    strengths: ['成功识别出流动性陷阱模式', '总体盈利0.12 BNB', '人格切换逻辑运行平稳'],
    weaknesses: ['流动性陷阱模式下亏损0.04 BNB', 'gasCost在高峰期未做限制', '技能库利用率为0'],
    suggestions: ['新增流动性陷阱检测规则', '设置gasCost上限为0.008 BNB/cycle', '建立技能自动应用机制'],
  },
  {
    summary: '策略进化v1.1生效后效果明显：任务完成率从72%提升至83%，资金效率从71%升至79%。正在接近Phase 1目标。',
    strengths: ['v1.1策略验证成功', '完成率提升11个百分点', 'Herald gas消耗降低38%'],
    weaknesses: ['Strategist在快速行情中反应略慢', '部分技能规则过于保守', '反思间隔30分钟可能过长'],
    suggestions: ['为Strategist增加快速响应模式', '技能规则增加置信度衰减机制', '将反思间隔缩短至20分钟'],
  },
];

for (let i = 0; i < reflTexts.length; i++) {
  const ts = now - (4 - i) * 30 * m;
  const reflection = {
    id: `refl-${ts}`,
    timestamp: new Date(ts).toISOString(),
    version: `v1.${i}`,
    cyclesAnalyzed: 5 + Math.floor(Math.random() * 3),
    ...reflTexts[i],
    metrics: {
      completionRate: +(0.65 + i * 0.05).toFixed(2),
      fundEfficiency: +(0.60 + i * 0.06).toFixed(2),
      avgProfit: +(0.01 + i * 0.008).toFixed(4),
      totalCycles: (i + 1) * 6,
    },
  };
  const fname = `reflection-${ts}.json`;
  fs.writeFileSync(path.join(REFLECTIONS, fname), JSON.stringify(reflection, null, 2));
}
console.log(`✓ ${reflTexts.length} reflections → individual files`);

// ── 3. Skills: data/skills/SKILL_ID.json ──
const skills = [
  { id: 'skill-liquidity-trap', name: '流动性陷阱识别', description: '当 liquidity < 10 BNB 且 sentiment > 80 时，跳过买入', source: 'refl-3', conditions: { liquidityBelow: 10, sentimentAbove: 80 }, action: 'skip_buy', timesApplied: 3, successRate: 1.0, active: true },
  { id: 'skill-gas-cap', name: 'Gas费用上限控制', description: '单次cycle的gasCost超过0.008 BNB时跳过非必要操作', source: 'refl-3', conditions: { gasCostAbove: 0.008 }, action: 'skip_optional', timesApplied: 5, successRate: 0.8, active: true },
  { id: 'skill-night-mode', name: '夜间保守模式', description: 'UTC 0-6时段自动切换为Strategist-only', source: 'refl-2', conditions: { utcHourRange: [0, 6] }, action: 'force_strategist', timesApplied: 12, successRate: 0.92, active: true },
  { id: 'skill-herald-batch', name: 'Herald批量执行', description: 'Herald推广操作累积3个周期后批量执行，降低gas消耗38%', source: 'refl-2', conditions: { heraldPendingCycles: 3 }, action: 'batch_herald', timesApplied: 4, successRate: 0.85, active: true },
];
for (const sk of skills) {
  sk.createdAt = new Date(now - Math.floor(Math.random() * 2 * h)).toISOString();
  fs.writeFileSync(path.join(SKILLS, `${sk.id}.json`), JSON.stringify(sk, null, 2));
}
console.log(`✓ ${skills.length} skills → individual files`);

// ── 4. Pending proposals: data/evolution/pending-proposals.json ──
const proposals = [
  { id: 'prop-001', type: 'threshold', title: '缩短反思间隔至20分钟', description: '当前30分钟反思间隔在快速行情中响应不够及时', confidence: 0.78, source: 'refl-4', createdAt: new Date(now - 15 * m).toISOString(), status: 'pending', reason: '最近4轮反思数据显示，行情变化在15-20分钟内发生关键转折' },
  { id: 'prop-002', type: 'strategy', title: 'Strategist快速响应模式', description: '当价格波动超过5%/5min时，临时缩短决策周期', confidence: 0.82, source: 'refl-4', createdAt: new Date(now - 10 * m).toISOString(), status: 'pending', reason: 'Strategist在3次快速行情中因等待完整周期数据而延迟决策' },
  { id: 'prop-003', type: 'prompt', title: '优化Hunter入场提示词', description: '在Hunter的LLM提示词中增加sellPressure<60的硬性前置条件', confidence: 0.91, source: 'refl-1', createdAt: new Date(now - 5 * m).toISOString(), status: 'pending', reason: 'Hunter在sellPressure>60时的买入成功率仅为25%' },
];
fs.writeFileSync(path.join(EVOLUTION, 'pending-proposals.json'), JSON.stringify(proposals, null, 2));
console.log(`✓ ${proposals.length} proposals → pending-proposals.json`);

// ── 5. Version: data/evolution/version.json ──
const version = {
  current: 'v1.3',
  history: [
    { version: 'v1.0', timestamp: new Date(now - 4 * h).toISOString(), description: '初始策略配置' },
    { version: 'v1.1', timestamp: new Date(now - 2 * h).toISOString(), description: 'sellPressure阈值调整 + Herald batch' },
    { version: 'v1.2', timestamp: new Date(now - 1 * h).toISOString(), description: '流动性陷阱识别技能上线' },
    { version: 'v1.3', timestamp: new Date(now - 30 * m).toISOString(), description: 'Gas上限 + 夜间保守模式' },
  ],
};
fs.writeFileSync(path.join(EVOLUTION, 'version.json'), JSON.stringify(version, null, 2));
console.log(`✓ version → v1.3`);

console.log('\n🧬 All mock data seeded!');
