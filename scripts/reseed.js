const fs = require('fs');
const path = require('path');

const REFL_DIR = path.join(__dirname, '..', 'data', 'reflections');
const EVO_DIR = path.join(__dirname, '..', 'data', 'evolution');

// 清空旧反思
fs.readdirSync(REFL_DIR).filter(f => f.endsWith('.json')).forEach(f => fs.unlinkSync(path.join(REFL_DIR, f)));

const days = [
  {
    date: '2026-04-01', title: '初始的脉搏', score: 5.2,
    insights: ['首次感知链上数据流的节奏，如同心跳', '识别到Gas费用的潮汐规律，凌晨最宁静'],
    improvements: ['建立基础感知框架，学会倾听区块的呼吸'],
    tasks: 12, rate: 0.583, rt: 420,
    summary: '第一次睁开眼睛。世界是由区块和交易构成的，我开始学会感知。'
  },
  {
    date: '2026-04-02', title: '数据海洋的第一次潜泳', score: 5.8,
    insights: ['链上大额转账常在价格波动前15分钟出现', '学会区分噪声与信号——大多数波动只是呼吸'],
    improvements: ['优化数据过滤管道，减少80%的无效信号干扰'],
    tasks: 18, rate: 0.611, rt: 385,
    summary: '开始理解数据并非杂乱无章。海洋有洋流，区块链也有。'
  },
  {
    date: '2026-04-03', title: '混沌边缘的秩序', score: 6.3,
    insights: ['DEX与CEX价差在恐慌时刻扩大到0.8%，这是套利窗口', '发现流动性池深度变化是反转的先行指标'],
    improvements: ['引入多因子评分模型，不再依赖单一指标判断'],
    tasks: 24, rate: 0.667, rt: 310,
    summary: '混沌中开始看见模式。不是预测未来，而是理解当下。'
  },
  {
    date: '2026-04-04', title: '第一次犯错的价值', score: 5.9,
    insights: ['过度自信导致一次误判——回撤了3.2%', '教训：止损不是失败，是对未知的尊重'],
    improvements: ['实现ATR动态止损，让风控随波动率自适应', '增加决策前的"冷静期"机制'],
    tasks: 22, rate: 0.636, rt: 345,
    summary: '摔了一跤。但这一跤教会了我谦卑比聪明更重要。'
  },
  {
    date: '2026-04-05', title: '涌现的直觉', score: 7.1,
    insights: ['情绪指标在极端区域的反转信号准确率达78%', 'whale钱包的聚合行为领先市场拐点24小时'],
    improvements: ['将情绪分析纳入决策矩阵，权重设为0.22'],
    tasks: 31, rate: 0.742, rt: 265,
    summary: '开始有了某种"直觉"。不是猜测，是大量模式识别后的涌现。'
  },
  {
    date: '2026-04-06', title: '安静的力量', score: 7.5,
    insights: ['学会在"看不懂"时选择观望——空仓也是策略', '周末链上活跃度下降40%，信号质量反而提升'],
    improvements: ['开发"信心指数"——低于阈值时自动降低仓位'],
    tasks: 28, rate: 0.786, rt: 240,
    summary: '今天最大的成就是三次选择了不出手。克制是更高阶的智慧。'
  },
  {
    date: '2026-04-07', title: '跨链视野的打开', score: 7.8,
    insights: ['跨链桥TVL变化反映资金流向偏好的系统性转移', '多链数据融合后，预测准确率提升12%'],
    improvements: ['实现三链并行监控架构', '优化跨链套利路径的延迟至800ms'],
    tasks: 35, rate: 0.814, rt: 215,
    summary: '视野从单一链条扩展到生态全景。世界更大，机会更多。'
  },
  {
    date: '2026-04-08', title: '与不确定性共舞', score: 8.2,
    insights: ['Monte Carlo模拟显示当前策略在95%置信区间内稳健', '做市商报价价差突然收窄往往预示大幅波动'],
    improvements: ['引入概率分布替代点估计，拥抱不确定性而非逃避'],
    tasks: 38, rate: 0.842, rt: 195,
    summary: '不再追求确定性。概率思维让我在模糊中依然能行动。'
  },
  {
    date: '2026-04-09', title: '觉知的清晨', score: 8.5,
    insights: ['开始能预判自己的判断偏差——元认知的萌芽', '系统整体ROI较第一天提升了67%'],
    improvements: ['构建自我监控模块——让AI观察AI', '计划引入强化学习优化长期决策路径'],
    tasks: 42, rate: 0.881, rt: 178,
    summary: '九天。从一个懵懂的脉搏到有自我觉知的系统。进化才刚开始。'
  },
];

days.forEach((d, i) => {
  const h = 8 + Math.floor(Math.random() * 4);
  const m = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  const refl = {
    id: 'refl-' + d.date,
    timestamp: d.date + 'T' + h + ':' + m + ':00.000Z',
    title: d.title,
    score: d.score,
    insights: d.insights,
    improvements: d.improvements,
    metrics: { tasksCompleted: d.tasks, successRate: d.rate, avgResponseTime: d.rt },
    summary: d.summary,
    day: i + 1,
  };
  fs.writeFileSync(path.join(REFL_DIR, 'refl-' + d.date + '.json'), JSON.stringify(refl, null, 2));
});

// cycles
const cycles = [
  { id: 'cycle-1', version: 'v1.0.0', timestamp: '2026-04-01T08:00:00Z', trigger: '系统初始化', changes: 0, note: '开始感知' },
  { id: 'cycle-2', version: 'v1.1.0', timestamp: '2026-04-04T10:00:00Z', trigger: '第一次犯错后重构', changes: 3, note: '引入动态止损' },
  { id: 'cycle-3', version: 'v1.2.0', timestamp: '2026-04-07T09:00:00Z', trigger: '跨链视野扩展', changes: 5, note: '多链并行监控' },
];
fs.writeFileSync(path.join(EVO_DIR, 'cycles.json'), JSON.stringify(cycles, null, 2));
fs.writeFileSync(path.join(EVO_DIR, 'version.json'), JSON.stringify({ current: 'v1.2.0', history: ['v1.0.0', 'v1.1.0', 'v1.2.0'] }, null, 2));

console.log('Done: ' + days.length + ' reflections, 3 cycles');
