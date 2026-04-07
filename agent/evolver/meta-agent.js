/**
 * meta-agent.js — Meta-Agent 反思与进化引擎
 *
 * 每30分钟（或每10个任务批次）自动触发，
 * 调用 LLM 生成结构化反思报告 + 进化提案。
 */
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const { getRecentCycles, getStats } = require('./task-logger');

const REFLECT_DIR  = path.join(__dirname, '..', '..', 'data', 'reflections');
const SKILL_DIR    = path.join(__dirname, '..', '..', 'data', 'skills');
const VERSION_FILE = path.join(__dirname, '..', '..', 'data', 'evolution', 'version.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ── 当前版本管理 ── */
function getVersion() {
  try { return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); }
  catch { return { major: 2, minor: 0, patch: 0, history: [] }; }
}

function bumpVersion(type, reason) {
  const v = getVersion();
  if (type === 'major') { v.major++; v.minor = 0; v.patch = 0; }
  else if (type === 'minor') { v.minor++; v.patch = 0; }
  else { v.patch++; }

  v.history.push({
    version: `v${v.major}.${v.minor}.${v.patch}`,
    reason,
    timestamp: new Date().toISOString()
  });

  // 只保留最近 100 条历史
  if (v.history.length > 100) v.history = v.history.slice(-100);

  ensureDir(path.dirname(VERSION_FILE));
  fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2));
  return `v${v.major}.${v.minor}.${v.patch}`;
}

function versionString() {
  const v = getVersion();
  return `v${v.major}.${v.minor}.${v.patch}`;
}

/* ── Meta-Agent 反思 Prompt ── */
function buildReflectionPrompt(cycles, stats) {
  return `你现在是 Seki 的 Meta-Agent（自我反思与进化引擎）。
你的唯一目标是：从过去执行周期的数据中进行深刻反思，并输出结构化进化建议。

【当前 Agent 版本】${versionString()}

【输入数据】
- 周期数量: ${cycles.length}
- 人格分布: ${JSON.stringify(stats.persona_distribution)}
- 总任务数: ${stats.total_tasks}
- 完成任务数: ${stats.completed_tasks}
- 总完成率: ${stats.completion_rate}
- 总奖励(BNB): ${stats.total_reward_bnb}
- 总Gas(BNB): ${stats.total_gas_bnb}
- 资金效率(奖励/Gas): ${stats.efficiency}
- BNB均价: $${stats.avg_bnb_price?.toFixed(2) || 'N/A'}

【最近5个周期详情】
${JSON.stringify(cycles.slice(-5), null, 2)}

【输出要求】严格输出以下JSON结构，不要任何多余文字：
{
  "reflection_summary": "一句话总结本次周期表现",
  "key_insights": ["洞察1", "洞察2"],
  "success_patterns": ["可复用成功模式"],
  "failure_reasons": ["失败原因"],
  "evolution_proposals": [
    {
      "type": "rule|persona|skill|prompt",
      "description": "具体优化建议",
      "new_value_example": "示例",
      "expected_impact": "预计效果",
      "confidence": 75
    }
  ],
  "new_skill_template": null,
  "version_bump": "patch|minor|major"
}

请基于数据给出客观、量化、可执行的进化建议。如果数据不足，也要给出基于有限信息的初步判断。`;
}

/* ── 调用 LLM 执行反思 ── */
async function callMetaAgent(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.META_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';

  const resp = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [
      { role: 'system', content: 'You are a meta-analysis AI. Output only valid JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 2000
  }, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 60000
  });

  const text = resp.data.choices[0].message.content.trim();
  // 提取 JSON（可能被 ```json 包裹）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Meta-Agent 未返回有效JSON: ' + text.slice(0, 200));
  return JSON.parse(jsonMatch[0]);
}

/* ── 保存反思结果 ── */
function saveReflection(reflection) {
  ensureDir(REFLECT_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(REFLECT_DIR, `reflection-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(reflection, null, 2));
  return file;
}

/* ── 获取最近N条反思 ── */
function getRecentReflections(count = 10) {
  ensureDir(REFLECT_DIR);
  const files = fs.readdirSync(REFLECT_DIR)
    .filter(f => f.startsWith('reflection-') && f.endsWith('.json'))
    .sort()
    .slice(-count);
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(REFLECT_DIR, f), 'utf8')); }
    catch { return null; }
  }).filter(Boolean);
}

/* ── 技能库管理 ── */
function saveSkill(skill) {
  ensureDir(SKILL_DIR);
  const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const file = path.join(SKILL_DIR, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ id, ...skill, created: new Date().toISOString() }, null, 2));
  return id;
}

function getSkills() {
  ensureDir(SKILL_DIR);
  return fs.readdirSync(SKILL_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SKILL_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
}

/* ── 主反思流程 ── */
async function runReflection(minutesBack = 30) {
  console.log(`\n🧠 [Meta-Agent] 启动反思循环 (最近 ${minutesBack} 分钟)...`);

  const cycles = getRecentCycles(minutesBack);
  if (cycles.length < 2) {
    console.log('🧠 [Meta-Agent] 数据不足（< 2 个周期），跳过反思');
    return null;
  }

  const stats = getStats(cycles);
  const prompt = buildReflectionPrompt(cycles, stats);

  let reflection;
  try {
    reflection = await callMetaAgent(prompt);
  } catch (err) {
    console.error('🧠 [Meta-Agent] LLM调用失败:', err.message);
    return null;
  }

  // 附加元数据
  reflection._meta = {
    version: versionString(),
    cycles_analyzed: cycles.length,
    stats,
    timestamp: new Date().toISOString()
  };

  // 保存反思
  const file = saveReflection(reflection);
  console.log(`🧠 [Meta-Agent] 反思完成，已保存: ${path.basename(file)}`);

  // 处理版本升级
  if (reflection.version_bump) {
    const bumpType = reflection.version_bump; // patch/minor/major
    const newVer = bumpVersion(bumpType, reflection.reflection_summary);
    console.log(`🧠 [Meta-Agent] 版本升级: ${reflection._meta.version} → ${newVer}`);
    reflection._meta.new_version = newVer;
  }

  // 提取新技能
  if (reflection.new_skill_template) {
    const skillId = saveSkill(reflection.new_skill_template);
    console.log(`🧠 [Meta-Agent] 新技能已入库: ${skillId}`);
  }

  // 处理进化提案
  if (reflection.evolution_proposals?.length) {
    console.log(`🧠 [Meta-Agent] 进化提案 (${reflection.evolution_proposals.length}条):`);
    for (const p of reflection.evolution_proposals) {
      console.log(`   → [${p.type}] ${p.description} (置信度: ${p.confidence}%)`);
    }
  }

  console.log(`🧠 [Meta-Agent] 反思摘要: ${reflection.reflection_summary}`);
  return reflection;
}

/* ── 进化大厅数据 API ── */
function getEvolutionDashboard() {
  const version = getVersion();
  const reflections = getRecentReflections(20);
  const skills = getSkills();
  const todayCycles = require('./task-logger').getTodayCycles();
  const stats = getStats(todayCycles);

  // 计算 KPI 趋势（对比前24h vs 当前）
  const allCycles24h = getRecentCycles(1440); // 24h
  const firstHalf = allCycles24h.slice(0, Math.floor(allCycles24h.length / 2));
  const secondHalf = allCycles24h.slice(Math.floor(allCycles24h.length / 2));
  const statsFirst = getStats(firstHalf);
  const statsSecond = getStats(secondHalf);

  let completionTrend = null;
  if (statsFirst && statsSecond) {
    const r1 = parseFloat(statsFirst.completion_rate) || 0;
    const r2 = parseFloat(statsSecond.completion_rate) || 0;
    completionTrend = (r2 - r1).toFixed(1);
  }

  return {
    version: `v${version.major}.${version.minor}.${version.patch}`,
    version_history: (version.history || []).slice(-10),
    current_stats: stats,
    completion_trend: completionTrend,
    recent_reflections: reflections.slice(-5).map(r => ({
      summary: r.reflection_summary,
      insights: r.key_insights,
      proposals: r.evolution_proposals?.length || 0,
      timestamp: r._meta?.timestamp
    })),
    total_skills: skills.length,
    skills: skills.slice(-10),
    evolution_log: reflections.map(r => ({
      version: r._meta?.new_version || r._meta?.version,
      summary: r.reflection_summary,
      proposals_count: r.evolution_proposals?.length || 0,
      timestamp: r._meta?.timestamp
    })).slice(-20)
  };
}

module.exports = {
  runReflection,
  getEvolutionDashboard,
  getVersion,
  versionString,
  bumpVersion,
  getRecentReflections,
  getSkills,
  saveSkill
};
