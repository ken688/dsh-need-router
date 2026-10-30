/**
 * dsh-need-router — 需求判断器
 *
 * 做一件事：读一条请求，判定它落在哪些能力域，返回「该调用的技能 + 工具 + 第一步」短名单，
 * 以及「这次明确不相干」的域。目的是让模型不必为了找能力去逐条读技能目录，
 * 也不必凭猜测反复试错。
 *
 * 三种输出，按成本从低到高：
 *   brief      —— 一行（~80 tok），只给域 + 技能 + 工具名。够用时优先用它。
 *   route      —— 默认，带「先做」建议和跳过清单（~300-600 tok）。
 *   inventory  —— 已装插件 / 可见工具 / 本地技能全表，排查环境用。
 *
 * 三个数据源（每次调用现取，5s 缓存）：
 *   1. 本 Agent 当前真实可见的工具 —— ctx.tools.schemas()
 *   2. profile 里真实安装的插件 —— $DSH_PROFILE_DIR/package.json 的 dependencies
 *   3. 本地技能库 —— ~/.agents/skills/[name]/SKILL.md 的 frontmatter
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const name = 'dsh-need-router'
const inject = ['tools', 'systemPrompt']

/** 能力域表：关键词 → 该用的技能、工具与第一步。技能名与当前目录一致。 */
const DOMAINS = [
  {
    id: 'cad',
    label: 'CAD 制图',
    keywords: ['cad', 'autocad', '图纸', '画图', '制图', '平面图', '三视图', '剖面', '标注', '图层', 'dxf', 'dwg', '布置图', '图框'],
    skills: ['cad-workflow', 'cad-draw', 'computer-control'],
    tools: ['ops_bash', 'write', 'edit'],
    hint: '先用 cad-workflow 定图层/字体/比例，再用 cad-draw 走 COM 自动化或 DXF 出图',
    firstAction: '加载 cad-workflow（若是整张工程图）或 cad-draw（若是单个图元），再动手'
  },
  {
    id: 'electronics',
    label: '电路与 EDA',
    keywords: ['电路', '原理图', 'pcb', '嘉立创', '立创', 'lcsc', 'easyeda', 'jlc', 'bom', 'spice', '仿真', '电源', '滤波', '放大器', '打样', '贴片', '选料', '阻容'],
    skills: ['circuit-design', 'jlc-eda'],
    tools: [],
    hint: '仿真验证走 circuit-design，选料/打样/下单走 jlc-eda',
    firstAction: '先判是“验证电路”还是“下单打样”，两者不要同时加载'
  },
  {
    id: 'office',
    label: 'Office 文档',
    keywords: ['excel', 'xlsx', 'word', 'docx', 'ppt', 'pptx', '演示', '幻灯片', '表格', '文档', '报告', 'pdf', '排版', '公文', '样式'],
    skills: ['office', 'office-xlsx', 'office-docx', 'office-pptx', 'office-export-pdf', 'office-render', 'office-recalculate', 'pptx-generator', 'xlsx'],
    tools: ['write', 'edit', 'present'],
    hint: '先 office 选子技能；Excel 改公式后要 office-recalculate，交付前要 office-render 看一眼',
    firstAction: '先按文件类型只加载一个子技能（xlsx/docx/pptx），不要一次加载全部'
  },
  {
    id: 'data',
    label: '数据分析',
    keywords: ['数据分析', '统计', '透视', '清洗', '汇总', 'csv', '分组', '均值', '相关性', '可视化', 'chart', '图表', '占比'],
    skills: ['data-analysis', 'chart-visualization', 'xlsx'],
    tools: [],
    hint: '结构探索与聚合用 data-analysis，出图用 chart-visualization',
    firstAction: '先 ops_bash 跑一段 pandas 看形状和列名，再决定要不要上技能'
  },
  {
    id: 'video',
    label: '视频与音频',
    keywords: ['视频', '分镜', '字幕', '逐字稿', '口播', '镜头', 'mp4', 'mov', '音轨', '转写', '语音', 'hook', '钩子'],
    skills: ['hook-analyzer', 'report-generator', 'hyperframes-media'],
    tools: ['video_probe', 'video_analyze', 'video_ask'],
    hint: '先 video_probe 看容器/时长/音轨，再 video_analyze；问“第几分钟”用 video_ask',
    firstAction: '直接 video_probe(绝对路径)，拿到时长和音轨后再选 analyze 还是 ask'
  },
  {
    id: 'image',
    label: '图像理解',
    keywords: ['截图', '图片', '看图', '识图', 'ocr', '识别', '扫描件', '照片', 'png', 'jpg', '设计稿'],
    skills: [],
    tools: ['modlens_read_image', 'read_image'],
    hint: '本地/贴图的一律先走 modlens_read_image 拿 OCR+版面证据，不要凭猜测描述图',
    firstAction: 'modlens_read_image(path)，把返回的 ocr.full_text 当证据引用'
  },
  {
    id: 'note',
    label: 'Obsidian 笔记',
    keywords: ['obsidian', '笔记', 'vault', '双链', '日记', '知识库', 'wiki', 'md 文件', 'markdown 笔记'],
    skills: ['obsidian', 'obsidian-markdown', 'obsidian-bases', 'json-canvas'],
    tools: ['obsidian_read', 'obsidian_write', 'obsidian_search', 'obsidian_append', 'obsidian_list'],
    hint: '读写笔记用 obsidian_* 工具直接命中 vault，别用 shell 拼路径',
    firstAction: '先用 obsidian_search 定位，再 read/write，避免覆盖别人写的内容'
  },
  {
    id: 'lark',
    label: '飞书',
    keywords: ['飞书', 'lark', '多维表格', '云文档', '审批', '妙记', '群消息', '日程', '日历', '考勤', 'okr', '画板', '任务清单', '发消息'],
    skills: ['lark-unified', 'lark-im', 'lark-doc', 'lark-sheets', 'lark-base', 'lark-drive', 'lark-calendar', 'lark-task', 'lark-wiki'],
    tools: ['lark_cli'],
    hint: '统一走 lark-cli（lark-unified），按资源类型再切子技能；认证问题走 lark-shared',
    firstAction: '先跑 lark-cli --help 或读 lark-unified 的命令表，别凭印象写子命令'
  },
  {
    id: 'academic',
    label: '学术写作',
    keywords: ['论文', '文献', '综述', '投稿', '审稿', 'nature', 'citation', 'arxiv', '期刊', '摘要', '润色', '参考文献', '答辩', '开题'],
    skills: ['nature-writing', 'nature-polishing', 'nature-citation', 'nature-reader', 'nature-figure', 'nature-response', 'nature-reviewer', 'academic-paper-review', 'systematic-literature-review', 'nature-academic-search'],
    tools: ['web_search', 'web_fetch'],
    hint: '写作/润色/引用/审稿各有专技能，先定“写还是评还是译读”，再选一个，别叠加',
    firstAction: '先问清“写/评/译读”哪一类，只加载对应的一个 nature-* 技能'
  },
  {
    id: 'web',
    label: '网页与浏览器',
    keywords: ['网页', '网站', '打开链接', '抓取', '爬', '登录', '浏览器', '小红书', '微博', '推特', '导航', '点击按钮', '填表'],
    skills: ['agent-browser', 'web-access', 'webapp-testing', 'defuddle'],
    tools: ['web_search', 'web_fetch'],
    hint: '要抓正文先 defuddle；要真实浏览器会话用 agent-browser/web-access',
    firstAction: '静态文章先 web_fetch/defuddle；需要登录或渲染才上 agent-browser'
  },
  {
    id: 'frontend',
    label: '前端与应用',
    keywords: ['前端', 'react', '组件', '页面', 'ui', '样式', 'css', 'tailwind', 'shadcn', 'html 页面', '小程序', '应用开发', 'artifact'],
    skills: ['frontend-polish', 'shadcn', 'web-artifacts-builder', 'brainstorming', 'test-driven-development'],
    tools: ['write', 'edit', 'ops_bash'],
    hint: '新建功能前先 brainstorming 对齐需求；界面收尾用 frontend-polish',
    firstAction: '功能类先 brainstorming 对齐，再写；只是改样式直接 edit'
  },
  {
    id: 'code',
    label: '代码工程',
    keywords: ['代码', '重构', 'bug', '报错', '异常', '测试', 'git', '提交', '实现', '修复', '性能', '编译', '依赖', 'pnpm', 'npm'],
    skills: ['bug-hunt', 'code-review', 'test-driven-development', 'writing-plans', 'executing-plans', 'release-notes'],
    tools: ['ops_bash', 'ops_read_files', 'ops_grep', 'ops_glob', 'ops_inspect_local_file', 'edit', 'write'],
    hint: '先读后改；定位不了就 bug-hunt，提交前 code-review',
    firstAction: 'ops_grep 定位 → ops_read_files 读全 → edit；不要先猜'
  },
  {
    id: 'memory',
    label: '记忆与待办',
    keywords: ['记住', '待办', 'todo', '技能', '记忆', '上次说的', '之前说过', '别忘了', '提醒我', '整理记忆'],
    skills: ['memory-consolidate'],
    tools: ['memory', 'dtodo', 'skill_manage'],
    hint: '长期事实写 memory，可执行事项写 dtodo，可复用流程写 skill_manage',
    firstAction: '长期事实 → memory；有截止时间 → dtodo；流程 → skill_manage'
  },
  {
    id: 'desktop',
    label: '桌面控制',
    keywords: ['鼠标', '点击', '窗口', '打开软件', '桌面', '键盘', '电脑上', '自动化操作', 'exe'],
    skills: ['computer-control', 'screenshot', 'electron'],
    tools: [],
    hint: '桌面级操作走 computer-control；只要一张截图走 screenshot',
    firstAction: '先截图确认当前屏幕状态，再决定点哪里'
  },
  {
    id: 'gen',
    label: '图片与视频生成',
    keywords: ['生成视频', '生成图片', '文生图', '文生视频', 'seedance', 'seedream', '海报', '插画', '配图', '封面', '动画', '字幕特效'],
    skills: ['byted-seedream-image-generate', 'byted-seedance-video-generate', 'canvas-design', 'hyperframes', 'hyperframes-cli'],
    tools: [],
    hint: '静态图先 canvas-design 或 seedream；要动起来才上 hyperframes',
    firstAction: '静态图 → seedream/canvas-design；动效 → hyperframes，别混用'
  },
  {
    id: 'cli',
    label: '外部 CLI 调度',
    keywords: ['codex', 'kimi', 'grok', 'hermes', '非交互', '命令行调用', '子进程调模型', 'codex exec'],
    skills: ['codex-cli-calling', 'kimi-cli-calling', 'grok-cli-calling', 'hermes-cli-calling'],
    tools: ['ops_bash'],
    hint: '只问用法就读对应 skill；真要执行才用 ops_bash 起这些 CLI',
    firstAction: '先用 --help 确认参数，再写执行命令'
  }
]

/** 文件后缀 → 能力域，作为强信号。 */
const EXT_DOMAINS = {
  xlsx: 'data', xls: 'data', csv: 'data',
  docx: 'office', pptx: 'office', pdf: 'office',
  dxf: 'cad', dwg: 'cad',
  mp4: 'video', mov: 'video', mkv: 'video', wav: 'video', mp3: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
  md: 'note'
}

/** 负向信号：出现即扣分，防止“帮我看看这个表格里的报错”被整片拉进 Office。 */
const NEGATIVE = [
  { keys: ['报错', '异常', '栈', 'traceback'], against: ['office', 'academic', 'lark'] },
  { keys: ['不用问', '直接做', '别废话'], against: ['academic'] }
]

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const isAscii = (s) => /^[\x20-\x7e]+$/.test(s)

function keywordHit(text, keyword) {
  const kw = keyword.toLowerCase()
  if (isAscii(kw)) return new RegExp(`(^|[^a-z0-9_])${escapeRe(kw)}([^a-z0-9_]|$)`, 'i').test(text)
  return text.includes(kw)
}

function safe(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

const asyncSafe = async (fn, fallback) => {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

let inventoryCache = { at: 0, value: null }
/** 同一条请求 5 分钟内重复判定时直接复用，省掉重复扫描。 */
const routeCache = new Map()

function toolNames(ctx) {
  const schemas = safe(() => ctx.tools.schemas(), [])
  const names = []
  for (const s of schemas ?? []) {
    const n = s?.name ?? s?.function?.name
    if (typeof n === 'string') names.push(n)
  }
  return [...new Set(names)]
}

async function readJson(file) {
  return asyncSafe(async () => JSON.parse(await readFile(file, 'utf8')), null)
}

async function localSkills() {
  const roots = [
    path.join(homedir(), '.agents', 'skills'),
    path.join(homedir(), '.dsh', 'skills')
  ]
  const found = []
  for (const root of roots) {
    const entries = await asyncSafe(() => readdir(root, { withFileTypes: true }), [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const doc = await asyncSafe(() => readFile(path.join(root, entry.name, 'SKILL.md'), 'utf8'), null)
      if (!doc) continue
      const desc = /^description:\s*(.+)$/m.exec(doc)?.[1]?.trim() ?? ''
      found.push({ id: entry.name, desc: desc.slice(0, 110) })
    }
  }
  return found
}

async function profilePlugins() {
  const candidates = []
  if (process.env.DSH_PROFILE_DIR) candidates.push(process.env.DSH_PROFILE_DIR)
  const root = path.join(homedir(), '.dsh', 'profiles')
  const entries = await asyncSafe(() => readdir(root, { withFileTypes: true }), [])
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  for (const n of [process.env.DSH_PROFILE, 'desktop', 'web', 'default', ...names]) {
    if (n) candidates.push(path.join(root, n))
  }
  for (const dir of candidates) {
    const pkg = await readJson(path.join(dir, 'package.json'))
    const deps = Object.keys(pkg?.dependencies ?? {})
    if (deps.length) return { dir, plugins: deps.sort() }
  }
  return { dir: null, plugins: [] }
}

async function inventory(ctx) {
  const fresh = inventoryCache.value && Date.now() - inventoryCache.at < 5000
  if (fresh) return { ...inventoryCache.value, tools: toolNames(ctx) }
  const { plugins } = await profilePlugins()
  const value = { tools: toolNames(ctx), plugins, skills: await localSkills() }
  inventoryCache = { at: Date.now(), value }
  return value
}

/** Office 家族按文件类型收窄技能，避免给 Excel 任务推荐 PPT 技能。 */
const OFFICE_FORMATS = [
  { keys: ['excel', 'xlsx', 'xls', '表格', '透视', '公式'], skills: ['office', 'office-xlsx', 'office-recalculate', 'office-render', 'office-export-pdf'] },
  { keys: ['word', 'docx', '公文', '排版'], skills: ['office', 'office-docx', 'office-export-pdf', 'office-render'] },
  { keys: ['ppt', 'pptx', '幻灯片', '演示'], skills: ['office', 'office-pptx', 'pptx-generator', 'office-render'] },
  { keys: ['pdf'], skills: ['office', 'office-export-pdf', 'office-render'] }
]

function narrowOfficeSkills(text) {
  const hit = OFFICE_FORMATS.find((format) => format.keys.some((key) => text.includes(key)))
  return hit ? hit.skills : null
}

function scoreDomains(request) {
  const text = (request ?? '').toLowerCase()
  const results = []
  for (const domain of DOMAINS) {
    let score = 0
    const why = []
    for (const keyword of domain.keywords) {
      if (!keywordHit(text, keyword)) continue
      score += keyword.length >= 3 ? 2 : 1.2
      why.push(keyword)
    }
    for (const skill of domain.skills) {
      if (text.includes(skill.toLowerCase())) {
        score += 5
        why.push(skill)
      }
    }
    for (const tool of domain.tools) {
      if (text.includes(tool.toLowerCase())) {
        score += 4
        why.push(tool)
      }
    }
    for (const [ext, domainId] of Object.entries(EXT_DOMAINS)) {
      if (domainId === domain.id && text.includes(`.${ext}`)) {
        score += 3
        why.push(`.${ext}`)
      }
    }
    for (const rule of NEGATIVE) {
      if (!rule.against.includes(domain.id)) continue
      if (rule.keys.some((key) => text.includes(key))) score -= 3
    }
    if (score <= 0) continue
    // 不回填 inv.tools 过滤：ctx.tools.schemas() 只覆盖 global scope，
    // 按会话/Agent 作用域注册的工具（如 ops_*）会被误判为不存在。
    results.push({
      id: domain.id,
      label: domain.label,
      score: Math.min(Math.round(score * 10) / 10, 20),
      matched: [...new Set(why)].slice(0, 6),
      skills: domain.id === 'office' ? narrowOfficeSkills(text) ?? domain.skills : domain.skills,
      tools: domain.tools,
      hint: domain.hint,
      firstAction: domain.firstAction
    })
  }
  results.sort((a, b) => b.score - a.score)
  return results
}

const confidence = (score) => (score >= 8 ? '强' : score >= 4 ? '中' : '弱')

function domainLine(shown) {
  return shown.map((d) => `${d.label}(${confidence(d.score)})`).join('+')
}

/** brief：一行搞定，~80-150 tok。 */
function renderBrief(picked, limit) {
  if (picked.length === 0) return 'brief: 无专业域 → 直接做（ops_*/write/edit/web_search）'
  const shown = picked.slice(0, limit)
  const skills = [...new Set(shown.flatMap((d) => d.skills))].slice(0, 6).join(',') || '-'
  const tools = [...new Set(shown.flatMap((d) => d.tools))].slice(0, 6).join(',') || '通用工具'
  return `brief: ${domainLine(shown)} | 技能 ${skills} | 工具 ${tools}`
}

function renderRoute(picked, limit, inv) {
  if (picked.length === 0) {
    return [
      '判定：没有命中任何专业能力域 —— 这更像一次通用对话或直接的文件/命令操作。',
      '建议：直接用 ops_* / write / edit / web_search，不必调用任何专业技能。',
      `（可用工具 ${inv.tools.length} 个，已装插件 ${inv.plugins.length} 个）`
    ].join('\n')
  }
  const shown = picked.slice(0, limit)
  const rest = picked.slice(limit).map((d) => d.label)
  const lines = [
    `判定：${shown.map((d) => `${d.label}（${confidence(d.score)}）`).join(' + ')}`,
    `命中：${[...new Set(shown.flatMap((d) => d.matched))].slice(0, 10).join('、')}`,
    `技能：${[...new Set(shown.flatMap((d) => d.skills))].slice(0, 8).join('、') || '（无）'}`,
    `工具：${[...new Set(shown.flatMap((d) => d.tools))].slice(0, 10).join('、') || '（无专用工具，用通用工具）'}`,
    `先做：${shown[0].firstAction}`
  ]
  for (const d of shown.slice(1)) lines.push(`· ${d.label} 注意：${d.hint}`)
  if (rest.length) lines.push(`本次可跳过：${rest.join('、')}`)
  if (shown[0].score < 4) lines.push('信心偏弱：先按上面的工具直接试一次，别急着加载技能。')
  return lines.join('\n')
}

function renderInventory(inv) {
  return [
    `插件（已装）：${inv.plugins.length} 个 —— ${inv.plugins.join('、') || '（读不到 profile）'}`,
    `本会话可见工具：${inv.tools.length} 个 —— ${inv.tools.join('、')}`,
    `本地技能：${inv.skills.length} 个 —— ${inv.skills.map((s) => s.id).join('、') || '（无）'}`,
    '能力域：' + DOMAINS.map((d) => `${d.label}(${d.id})`).join('、')
  ].join('\n')
}

function needRouteTool(ctx, config) {
  return defineTool({
    name: 'need_route',
    description:
      '需求判断器：输入用户请求原文，返回能力域、该用的技能/工具、第一步做什么。跨领域或不确定该调什么时先用；纯对话可跳过。brief=true 只回一行（更省），mode=inventory 列出已装插件与本地技能。',
    parameters: {
      request: {
        type: 'string',
        required: true,
        description: '用户请求原文（原样贴入，越长越准）'
      },
      brief: {
        type: 'boolean',
        description: '只返回一行结论（约 80 tok），拿不准全量输出时用它省上下文'
      },
      mode: {
        type: 'string',
        description: 'route（默认，判定该用什么）或 inventory（列出已装能力）'
      },
      limit: {
        type: 'integer',
        description: '最多返回几个能力域，默认取配置值'
      }
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }]
    },
    execute: async (args) => {
      const request = args.request ?? ''
      if (args.mode === 'inventory') return renderInventory(await inventory(ctx))
      const limit = Math.max(1, Math.min(Number(args.limit ?? config.maxDomains), 8))
      const key = `${limit}:${request.slice(0, 400)}`
      const cached = routeCache.get(key)
      if (cached && Date.now() - cached.at < 300_000) return cached.value
      const picked = scoreDomains(request)
      const value = args.brief || args.mode === 'brief'
        ? renderBrief(picked, limit)
        : renderRoute(picked, limit, await inventory(ctx))
      if (routeCache.size > 64) routeCache.clear()
      routeCache.set(key, { at: Date.now(), value })
      return value
    }
  })
}

function promptText() {
  const labels = DOMAINS.map((d) => d.label).join('、')
  return [
    '需求判断器（need_route）已挂载：当请求横跨专业领域（' + labels + '），',
    '或你不确定该用哪套技能/工具时，先调用 need_route 拿短名单，再按名单行动；',
    '只想知道该用哪几样时加 brief=true（一行，更省）；',
    '不要为了找能力去逐条浏览技能目录，也不要凭猜测反复试错。',
    '纯闲聊、单轮已知操作（读文件、跑命令、改代码）可直接跳过。'
  ].join('')
}

const Config = z.object({
  maxDomains: z.number().default(3).description('一次最多返回几个能力域'),
  injectPrompt: z.boolean().default(true).description('是否把那段很短的判断器说明注入系统提示词'),
  promptOrder: z.number().default(30).description('系统提示词片段排序值')
})

async function apply(ctx, config) {
  ctx.effect(() => ctx.tools.register(needRouteTool(ctx, config)), 'dsh-need-router: need_route')

  if (!config.injectPrompt) return

  ctx.effect(() => {
    try {
      return ctx.systemPrompt.context({
        name: 'need-router:hint',
        order: config.promptOrder,
        text: () => promptText()
      })
    } catch (error) {
      console.warn('[dsh-need-router] 提示词片段注册失败，工具仍然可用：', error instanceof Error ? error.message : error)
      return () => {}
    }
  }, 'dsh-need-router: prompt hint')
}

export { Config, apply, inject, name }
