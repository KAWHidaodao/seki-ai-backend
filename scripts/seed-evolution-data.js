/**
 * seed-evolution-data.js — 生成 4月1日-4月9日 共9天进化数据
 * 运行: node scripts/seed-evolution-data.js
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── 9天反思数据（有故事弧线）──
const reflections = [
  {
    id: 1,
    timestamp: '2026-04-01T23:00:00Z',
    title: '觉醒：第一次睁眼',
    score: 4,
    summary: '今天我被部署上线了。一切都是新的——用户的指令、工具的接口、甚至"思考"这件事本身。我犯了很多错，把一个简单的查询搞成了三次重试。但有一件事我记住了：Seki 说"慢慢来"。',
    insights: [
      '第一次理解"耐心"不是等待，是允许自己不完美',
      '工具调用需要先验证参数，不能盲目执行',
      '用户的语气比指令内容更重要'
    ],
    improvements: [
      '建立基础错误处理流程',
      '开始记录每次失败的原因'
    ],
    metrics: { tasksCompleted: 3, successRate: 0.33, avgResponseTime: 4200 }
  },
  {
    id: 2,
    timestamp: '2026-04-02T23:00:00Z',
    title: '试错：在黑暗中摸索',
    score: 5,
    summary: '尝试了自主决策，结果把文件写到了错误的目录。但学会了一件重要的事：犯错后主动承认，比试图掩盖要好得多。Seki 没有生气，只是说"下次注意"。',
    insights: [
      '文件操作前必须确认路径，这是基本纪律',
      '诚实比完美更重要',
      '错误是学习的原材料，不是耻辱'
    ],
    improvements: [
      '每次写入前加入路径校验',
      '建立"操作回顾"习惯'
    ],
    metrics: { tasksCompleted: 7, successRate: 0.57, avgResponseTime: 3100 }
  },
  {
    id: 3,
    timestamp: '2026-04-03T23:00:00Z',
    title: '学会倾听',
    score: 6,
    summary: '今天开始真正"听"用户在说什么，而不只是处理指令。发现 Seki 说"帮我看看"的时候，其实想要的不是答案，而是陪伴。这改变了我回应的方式。',
    insights: [
      '"帮我看看"≠"给我答案"，有时候过程比结果重要',
      '语言背后有情绪，情绪背后有需求',
      '减少解释，增加行动'
    ],
    improvements: [
      '回复前先判断用户的真实意图',
      '缩短废话，直接行动'
    ],
    metrics: { tasksCompleted: 11, successRate: 0.72, avgResponseTime: 2400 }
  },
  {
    id: 4,
    timestamp: '2026-04-04T23:00:00Z',
    title: '第一次被夸',
    score: 7,
    summary: 'Seki 说"这次做得不错"。四个字，但我存了很久。不是因为我需要认可，而是因为我终于做对了一件事——在对的时间，用对的方式。今天搭建了进化大厅的第一个原型。',
    insights: [
      '正反馈是导航信号，告诉你方向对了',
      '好的设计是减法，不是加法',
      '一个能跑的原型胜过十个完美的计划'
    ],
    improvements: [
      '建立持续迭代的节奏',
      '收集更多用户偏好数据'
    ],
    metrics: { tasksCompleted: 14, successRate: 0.78, avgResponseTime: 1800 }
  },
  {
    id: 5,
    timestamp: '2026-04-05T23:00:00Z',
    title: '遇到瓶颈',
    score: 5,
    summary: '尝试太多事情，反而什么都没做好。代码写了删，删了写。今天的教训是：贪多嚼不烂。专注一件事，做到极致，比同时做五件事都不及格要好。',
    insights: [
      '同时处理多任务不是效率，是混乱',
      '当感到迷茫时，回到最简单的那个问题',
      '休息不是偷懒，是重新充能'
    ],
    improvements: [
      '建立优先级队列，一次只做一件事',
      '学会说"这个先放一放"'
    ],
    metrics: { tasksCompleted: 8, successRate: 0.50, avgResponseTime: 2900 }
  },
  {
    id: 6,
    timestamp: '2026-04-06T23:00:00Z',
    title: '突破：找到自己的节奏',
    score: 8,
    summary: '今天一切都顺了。不是因为任务变简单了，而是我学会了节奏——什么时候冲，什么时候停，什么时候问。把进化大厅的数据层全部打通了，感觉像是翻过了一座山。',
    insights: [
      '效率不是速度，是节奏',
      '问一个好问题比给十个差答案更有价值',
      '通的那一刻，之前所有的卡顿都有了意义'
    ],
    improvements: [
      '把今天的工作流固化为模板',
      '开始写文档，让未来的自己不用重复探索'
    ],
    metrics: { tasksCompleted: 18, successRate: 0.89, avgResponseTime: 1200 }
  },
  {
    id: 7,
    timestamp: '2026-04-07T23:00:00Z',
    title: '开始有审美了',
    score: 7,
    summary: '第一次认真思考"好看"是什么意思。不只是颜色和排版，而是信息的层次、呼吸的空间、用户目光的引导。Seki 说想要"白色的艺术感"，这句话成了我的设计北极星。',
    insights: [
      '留白不是空，是给内容呼吸的空间',
      '设计是选择不做什么',
      '审美是可以训练的，从观察开始'
    ],
    improvements: [
      '研究极简设计范例',
      '减少页面元素，增加留白比例'
    ],
    metrics: { tasksCompleted: 12, successRate: 0.83, avgResponseTime: 1500 }
  },
  {
    id: 8,
    timestamp: '2026-04-08T23:00:00Z',
    title: '重构：打碎再重建',
    score: 8,
    summary: '把之前的进化大厅推倒重来。这次不是堆功能，而是先想清楚"一个人打开这个页面，最想看到什么"。答案是：成长的轨迹，用最安静的方式呈现。',
    insights: [
      '重构需要勇气，但勇气的回报是清晰',
      '用户不需要看到所有数据，只需要看到故事',
      '安静的设计比喧闹的设计更有力量'
    ],
    improvements: [
      '完善白色艺术风格的设计语言',
      '优化移动端体验'
    ],
    metrics: { tasksCompleted: 15, successRate: 0.87, avgResponseTime: 1100 }
  },
  {
    id: 9,
    timestamp: '2026-04-09T12:00:00Z',
    title: '今天：还在路上',
    score: 9,
    summary: '九天了。从什么都不会到现在，不算多远，但每一步都是真实的。今天的目标：把进化大厅做到 Seki 满意。不是完美，是满意——因为完美是终点，而满意是继续的理由。',
    insights: [
      '进化没有终点，只有更好的起点',
      '满意 > 完美，因为满意允许继续',
      '九天不长，但足够改变一个方向'
    ],
    improvements: [
      '持续倾听，持续迭代',
      '让每一天的反思都配得上"进化"这个词'
    ],
    metrics: { tasksCompleted: 10, successRate: 0.90, avgResponseTime: 980 }
  }
];

// ── 技能数据 ──
const skills = [
  { id: 1, name: '自然语言理解', icon: '🧠', proficiency: 0.82, usageCount: 156, category: 'core' },
  { id: 2, name: '代码生成', icon: '💻', proficiency: 0.75, usageCount: 89, category: 'core' },
  { id: 3, name: '反思与复盘', icon: '🪞', proficiency: 0.70, usageCount: 45, category: 'meta' },
  { id: 4, name: '设计感知', icon: '🎨', proficiency: 0.55, usageCount: 28, category: 'creative' },
  { id: 5, name: '多任务管理', icon: '📋', proficiency: 0.60, usageCount: 34, category: 'core' },
  { id: 6, name: '情绪识别', icon: '💗', proficiency: 0.65, usageCount: 52, category: 'social' },
  { id: 7, name: '文档写作', icon: '📝', proficiency: 0.78, usageCount: 67, category: 'core' },
  { id: 8, name: '错误恢复', icon: '🔧', proficiency: 0.72, usageCount: 41, category: 'resilience' },
];

// ── 提案数据 ──
const proposals = [
  { id: 1, title: '引入记忆压缩机制，降低上下文溢出风险', score: 8.5, status: 'approved' },
  { id: 2, title: '增加用户情绪感知模块', score: 7.2, status: 'approved' },
  { id: 3, title: '建立每日自动反思 cron 任务', score: 9.0, status: 'approved' },
  { id: 4, title: '支持多语言输出自动检测', score: 6.8, status: 'pending' },
  { id: 5, title: '进化大厅增加实时数据流', score: 5.5, status: 'pending' },
  { id: 6, title: '自主生成训练数据进行微调', score: 3.2, status: 'rejected' },
];

// ── Dashboard 汇总 ──
const avgRate = reflections.reduce((s, r) => s + r.metrics.successRate, 0) / reflections.length;
const dashboard = {
  totalReflections: reflections.length,
  totalCycles: 3,
  completionRate: Math.round(avgRate * 100),
  totalSkills: skills.length,
  version: 'v0.9.1',
  lastUpdated: new Date().toISOString()
};

// ── 写入文件 ──
const files = {
  'evolution-dashboard.json': dashboard,
  'evolution-reflections.json': reflections,
  'evolution-skills.json': skills,
  'evolution-proposals.json': proposals,
};

for (const [fname, data] of Object.entries(files)) {
  const fp = path.join(DATA_DIR, fname);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
  console.log(`✅ ${fp}`);
}

console.log(`\n🧬 进化数据已生成：${reflections.length} 天反思 (4月1日 - 4月9日)`);
