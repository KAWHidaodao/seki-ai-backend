/**
 * seed-evolution-data.js — 生成30天模拟进化数据
 * 运行: node scripts/seed-evolution-data.js
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REFL_DIR = path.join(DATA_DIR, 'reflections');
const SKILL_DIR = path.join(DATA_DIR, 'skills');
const EVO_DIR = path.join(DATA_DIR, 'evolution');

[REFL_DIR, SKILL_DIR, EVO_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── 诗意标题池 ──
const TITLES = [
  '晨光中的觉醒', '混沌边缘的秩序', '量子涟漪', '星辰的低语',
  '深渊之上的平衡', '数据海洋的潮汐', '沉默的算法', '链上的回响',
  '概率之舞', '信号与噪声之间', '未完成的进化', '暗流中的指南针',
  '零与一的诗篇', '风暴前的宁静', '涌现的智慧', '迷雾中的灯塔',
  '时间的褶皱', '递归的镜像', '熵减的奇迹', '共识的回声',
  '波函数的坍缩', '混沌中的蝴蝶', '数字荒原的绿洲', '永恒的迭代',
  '临界点的顿悟', '分形的自相似', '梯度下降的方向', '博弈的均衡',
  '记忆的权重', '未来的梯度', '觉知的涌现', '黎明前的计算'
];

const INSIGHTS_POOL = [
  '市场在恐慌时往往孕育最佳机会，关键在于风险敞口的精确控制',
  '链上大额转账与价格波动存在约15分钟的领先关系',
  'Gas费用的周期性波动可被预测，凌晨UTC 2-4点为最优执行窗口',
  '流动性池深度变化是价格反转的先行指标',
  'DEX与CEX价差在高波动期扩大，套利窗口从3秒延长至12秒',
  '持仓集中度超过30%时系统性风险显著上升',
  '情绪指标在极端值区域的反转信号准确率达到78%',
  '多因子模型中链上活跃度权重应从0.15提升至0.22',
  '止损策略的动态调整比固定阈值降低了23%的不必要平仓',
  '跨链桥的TVL变化反映资金流向偏好的转变',
  '小市值代币的波动率聚类现象更为明显',
  '合约持仓量与现货成交量的背离是趋势衰竭的信号',
  'Memecoin的社交媒体热度衰减曲线符合指数分布',
  '流动性挖矿收益率的均值回归周期约为72小时',
  '大户钱包的聚合行为通常领先市场拐点24-48小时',
  '网络拥堵度与交易失败率呈非线性正相关',
  '稳定币脱锚风险可通过储备金审计频率量化',
  '做市商报价价差的突然收窄通常预示即将到来的大幅波动',
];

const IMPROVEMENTS_POOL = [
  '优化止损阈值算法，引入ATR动态调整',
  '增加链上whale监控的地址覆盖范围至Top 500',
  '将情绪分析模型从BERT升级到GPT-based架构',
  '改进Gas预估模型，加入EIP-1559 base fee预测',
  '引入Monte Carlo模拟优化持仓分配',
  '开发跨DEX流动性聚合比较模块',
  '建立异常交易模式识别系统',
  '添加Telegram/Discord舆情实时采集通道',
  '优化执行引擎的滑点保护机制',
  '实现多链资产的统一风险评估框架',
  '增加回测框架的时间粒度至tick级别',
  '开发自适应仓位管理策略',
];

function pick(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// ── 生成反思数据 (30天) ──
const now = new Date();
const reflections = [];

for (let i = 29; i >= 0; i--) {
  const date = new Date(now);
  date.setDate(date.getDate() - i);
  const dateStr = date.toISOString().slice(0, 10);
  
  // 分数随时间递增趋势 (模拟成长)
  const baseScore = 5.5 + (29 - i) * 0.1;
  const score = Math.min(9.5, Math.max(4, baseScore + rand(-1.5, 1.5)));
  const roundedScore = Math.round(score * 10) / 10;
  
  const tasksBase = 20 + (29 - i) * 2;
  const tasksCompleted = randInt(tasksBase - 5, tasksBase + 10);
  const successRate = Math.min(0.95, 0.55 + (29 - i) * 0.012 + rand(-0.08, 0.08));
  
  const refl = {
    id: `refl-${dateStr}`,
    timestamp: new Date(date.getTime() + 3600000 * randInt(8, 20)).toISOString(),
    title: TITLES[i % TITLES.length],
    score: roundedScore,
    insights: pick(INSIGHTS_POOL, randInt(2, 3)),
    improvements: pick(IMPROVEMENTS_POOL, randInt(1, 2)),
    metrics: {
      tasksCompleted,
      successRate: Math.round(successRate * 1000) / 1000,
      avgResponseTime: Math.round(rand(120, 350)),
    },
    summary: `第${30 - i}天反思：系统在${tasksCompleted}个任务中持续优化决策路径，成功率${(successRate * 100).toFixed(1)}%。`,
  };
  
  reflections.push(refl);
  
  // 每日独立文件
  fs.writeFileSync(
    path.join(REFL_DIR, `refl-${dateStr}.json`),
    JSON.stringify(refl, null, 2)
  );
}

// 汇总文件
fs.writeFileSync(
  path.join(REFL_DIR, 'all-reflections.json'),
  JSON.stringify(reflections, null, 2)
);

// ── 生成技能数据 ──
const SKILLS = [
  { name: '市场趋势分析', icon: '📈' },
  { name: '风险评估', icon: '🛡️' },
  { name: '链上数据解读', icon: '🔗' },
  { name: '情绪分析', icon: '🧠' },
  { name: '套利识别', icon: '⚡' },
  { name: 'Gas 优化', icon: '⛽' },
  { name: '流动性评估', icon: '💧' },
  { name: '波动率预测', icon: '🌊' },
  { name: '合约安全审计', icon: '🔒' },
  { name: '多链资产管理', icon: '🌐' },
];

const skills = SKILLS.map((s, idx) => {
  const daysAgo = 30 - idx * 3;
  const learnedAt = new Date(now);
  learnedAt.setDate(learnedAt.getDate() - Math.max(1, daysAgo));
  const daysSinceLearned = Math.max(1, daysAgo);
  const proficiency = Math.min(0.95, 0.25 + daysSinceLearned * 0.02 + rand(0, 0.15));
  
  return {
    id: `skill-${idx + 1}`,
    name: s.name,
    icon: s.icon,
    proficiency: Math.round(proficiency * 100) / 100,
    learnedAt: learnedAt.toISOString(),
    usageCount: randInt(daysSinceLearned * 2, daysSinceLearned * 5),
    lastUsed: new Date(now.getTime() - randInt(0, 48) * 3600000).toISOString(),
  };
});

fs.writeFileSync(
  path.join(SKILL_DIR, 'skills.json'),
  JSON.stringify(skills, null, 2)
);

// ── 生成进化周期数据 ──
const versions = [
  'v1.0.0', 'v1.0.1', 'v1.0.2', 'v1.1.0', 'v1.1.1',
  'v1.1.2', 'v1.1.3', 'v1.2.0', 'v1.2.1', 'v1.2.2',
  'v1.2.3', 'v1.2.4', 'v1.3.0', 'v1.3.1', 'v1.3.2',
];

const cycles = versions.map((v, idx) => {
  const date = new Date(now);
  date.setDate(date.getDate() - (30 - idx * 2));
  return {
    id: `cycle-${idx + 1}`,
    version: v,
    timestamp: date.toISOString(),
    trigger: idx % 3 === 0 ? '定时进化' : idx % 3 === 1 ? '反思驱动' : '提案通过',
    changes: randInt(2, 8),
    improvement: `${(rand(0.5, 4.5)).toFixed(1)}%`,
  };
});

fs.writeFileSync(
  path.join(EVO_DIR, 'cycles.json'),
  JSON.stringify(cycles, null, 2)
);

// ── 生成提案数据 ──
const proposals = [
  { title: '引入强化学习优化交易执行时机', status: 'approved', score: 8.5 },
  { title: '添加跨链MEV保护机制', status: 'approved', score: 7.8 },
  { title: '升级情绪分析为多模态模型', status: 'pending', score: 7.2 },
  { title: '实现自适应滑点保护算法', status: 'pending', score: 8.1 },
  { title: '增加NFT市场分析模块', status: 'rejected', score: 4.5 },
  { title: '开发Layer2 Gas费预测引擎', status: 'approved', score: 8.9 },
];

const proposalData = proposals.map((p, idx) => {
  const date = new Date(now);
  date.setDate(date.getDate() - randInt(1, 20));
  return {
    id: `prop-${idx + 1}`,
    title: p.title,
    status: p.status,
    score: p.score,
    createdAt: date.toISOString(),
    description: `基于近期反思分析提出的优化方案，预期可提升整体表现${rand(2, 8).toFixed(1)}%`,
  };
});

fs.writeFileSync(
  path.join(EVO_DIR, 'pending-proposals.json'),
  JSON.stringify(proposalData, null, 2)
);

// ── 更新版本文件 ──
fs.writeFileSync(
  path.join(EVO_DIR, 'version.json'),
  JSON.stringify({ current: 'v1.3.2', history: versions }, null, 2)
);

console.log('✅ 数据生成完成:');
console.log(`   反思: ${reflections.length} 天`);
console.log(`   技能: ${skills.length} 个`);
console.log(`   周期: ${cycles.length} 个`);
console.log(`   提案: ${proposalData.length} 个`);
