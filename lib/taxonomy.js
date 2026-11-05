/**
 * Built-in capability taxonomy.
 *
 * A domain is a *capability area* — not a product, not a skill name. It carries
 * the vocabulary that identifies the area (Chinese + English), a short piece of
 * advice, and the first concrete action. Concrete skills are NOT listed here:
 * they are discovered at runtime from the host, so this file stays valid on any
 * machine and open to user overrides (`domains` in the plugin config).
 *
 * `labels`, `hint` and `firstAction` are plain strings in one or two languages.
 * Keeping them generic is deliberate: this catalog must read correctly for a
 * user who has none of the author's plugins installed.
 */

/** @typedef {{ zh?: string, en?: string }} LocaleText */
/** @typedef {{ id: string, label: string, keywords: string[], hint: LocaleText, firstAction: LocaleText }} Domain */

/** @type {Domain[]} */
export const DOMAINS = [
  {
    id: 'documents',
    label: 'Documents & Spreadsheets',
    labels: { zh: '文档与表格' },
    keywords: [
      'excel', 'xlsx', 'xls', 'word', 'docx', 'ppt', 'pptx', 'powerpoint', 'pdf',
      'slides', 'deck', 'spreadsheet', 'worksheet', 'formula', 'pivot',
      '文档', '表格', '幻灯片', '演示文稿', '演示', '工作簿', '报告', '公文', '排版',
      '样式', '页眉', '页脚', '目录', '公式', '透视', '简历', '合同', '标书', '模板'
    ],
    hint: {
      zh: '按文件类型只加载一个子技能；改过公式要重算，交付前渲染看一眼。',
      en: 'Load exactly one subtype skill for the file type; recalculate after formula edits and render before delivery.'
    },
    firstAction: {
      zh: '先确认文件类型（表格 / 文档 / 幻灯片 / PDF），只加载对应的那一个技能，再动手。',
      en: 'Confirm the file type first (sheet / document / slides / PDF), load only the matching skill, then edit.'
    }
  },
  {
    id: 'data',
    label: 'Data Analysis',
    labels: { zh: '数据分析' },
    keywords: [
      'data analysis', 'statistics', 'pandas', 'jupyter', 'csv', 'pivot table',
      'clean data', 'aggregate', 'correlation', 'regression', 'chart', 'plot',
      '数据分析', '统计', '清洗', '汇总', '聚合', '分组', '均值', '中位数', '方差',
      '相关性', '回归', '分布', '可视化', '图表', '柱状图', '折线图', '饼图', '占比',
      '指标', '报表', '数据表', '字段', '去重', '筛选'
    ],
    hint: {
      zh: '先看形状和列名，再决定聚合口径；数字口径要写清楚。',
      en: 'Inspect shape and column names before aggregating; state the metric definition explicitly.'
    },
    firstAction: {
      zh: '先读表头与几行样本（形状、列名、缺失），再决定用哪种分析方式。',
      en: 'Read the header and a few sample rows (shape, columns, missing values) before choosing an analysis.'
    }
  },
  {
    id: 'code',
    label: 'Code & Engineering',
    labels: { zh: '代码工程' },
    keywords: [
      'code', 'source', 'refactor', 'bug', 'error', 'exception', 'stack trace',
      'test', 'unit test', 'git', 'commit', 'branch', 'merge', 'implement', 'fix',
      'performance', 'build', 'dependency', 'npm', 'pnpm', 'yarn', 'api', 'function',
      'class', 'typescript', 'javascript', 'python', 'rust', 'golang', 'java', 'shell',
      'script', 'terminal', 'docker', 'deploy', 'bash', 'command', 'pull request',
      'merge request', 'rebase', 'release notes', 'changelog', 'publish', 'release',
      '代码', '源码', '重构', '报错', '异常', '堆栈', '测试', '单元测试', '提交',
      '分支', '合并', '实现', '修复', '性能', '优化', '编译', '构建', '依赖',
      '接口', '函数', '脚本', '命令行', '终端', '部署', '仓库', '发布', '发版', '变更日志'
    ],
    hint: {
      zh: '先读后改；定位不了就先复现，提交前过一遍审查。',
      en: 'Read before editing; reproduce when the cause is unclear and review before committing.'
    },
    firstAction: {
      zh: '先搜索定位（grep / 列目录）再读文件，不要凭猜测直接改。',
      en: 'Search first (grep / list files), read the file, then edit — never guess.'
    }
  },
  {
    id: 'web',
    label: 'Web & Browser',
    labels: { zh: '网页与浏览器' },
    keywords: [
      'web', 'website', 'url', 'http', 'scrape', 'crawl', 'login', 'browser',
      'navigate', 'click button', 'fill form', 'render page', 'screenshot page',
      '网页', '网站', '链接', '抓取', '爬虫', '爬取', '登录', '浏览器', '导航',
      '点击按钮', '填表', '渲染', '书签', '在线', '下载网页'
    ],
    hint: {
      zh: '静态页面先抓正文；要登录或动态渲染才上真实浏览器。',
      en: 'Fetch static pages as text first; only drive a real browser for login or JS-rendered pages.'
    },
    firstAction: {
      zh: '先抓取一次看能不能拿到正文；拿不到再上浏览器自动化。',
      en: 'Try a plain fetch first; fall back to browser automation only when the body is missing.'
    }
  },
  {
    id: 'image',
    label: 'Image Understanding',
    labels: { zh: '图像理解' },
    keywords: [
      'image', 'picture', 'photo', 'screenshot', 'ocr', 'scan', 'diagram',
      'recognize text', 'design mockup',
      '截图', '图片', '看图', '识图', '图像识别', '文字识别', '识别图中', '扫描件',
      '照片', '设计稿', '像素', '水印', '界面图'
    ],
    hint: {
      zh: '拿图片先做一次结构化识别（文字 + 版面），把识别结果当证据引用。',
      en: 'Run one structured read (text + layout) before describing an image; quote the result as evidence.'
    },
    firstAction: {
      zh: '先调用可用的图像识别工具拿到文字与版面，再回答。',
      en: 'Call the available image-reading tool for text and layout, then answer.'
    }
  },
  {
    id: 'media',
    label: 'Audio & Video',
    labels: { zh: '音视频处理' },
    keywords: [
      'video', 'audio', 'subtitle', 'caption', 'transcript', 'transcribe',
      'storyboard', 'shot', 'timeline', 'frame', 'ffmpeg', 'mp4', 'mov', 'mkv',
      'wav', 'mp3', 'm4a', 'metadata', 'duration', 'speech', 'asr',
      '视频', '音频', '分镜', '字幕', '逐字稿', '口播', '镜头', '音轨', '转写',
      '转录', '语音识别', '剪辑', '时间码', '时间轴', '抽帧', '画面', '配音'
    ],
    hint: {
      zh: '先探测容器 / 时长 / 音轨，再决定分析还是转写；问到“第几分钟”要带时间锚点。',
      en: 'Probe container, duration and audio tracks first; time-anchored questions need explicit timestamps.'
    },
    firstAction: {
      zh: '先用媒体探测工具拿时长与音轨，再选分析 / 转写 / 抽帧。',
      en: 'Probe the file for duration and audio tracks, then choose analyze / transcribe / extract frames.'
    }
  },
  {
    id: 'creative',
    label: 'Generative Media',
    labels: { zh: '图像与视频生成' },
    keywords: [
      'generate image', 'generate video', 'text to image', 'text to video',
      'seedream', 'seedance', 'midjourney', 'stable diffusion', 'poster',
      'illustration', 'cover art', 'avatar', 'animation', 'logo',
      '生成图片', '生成图像', '生成视频', '文生图', '文生视频', '图生视频', '海报',
      '插画', '配图', '封面', '头像', '动画', '特效', '素材', '分镜图', '标志'
    ],
    hint: {
      zh: '静态图与动态视频是两套工具链，先定“要图还是要动”；提示词写清风格与比例。',
      en: 'Static images and video are different toolchains — decide which first, and state style and aspect ratio.'
    },
    firstAction: {
      zh: '先确认要静态图还是要视频，再选对应生成能力；一次只调一条链路。',
      en: 'Confirm still image vs video first, then use the matching generator — one chain at a time.'
    }
  },
  {
    id: 'academic',
    label: 'Academic Writing',
    labels: { zh: '学术写作' },
    keywords: [
      'paper', 'manuscript', 'literature', 'peer review', 'reviewer', 'citation',
      'reference', 'arxiv', 'journal', 'abstract', 'polish', 'revise', 'thesis',
      'proposal', 'conference', 'nature', 'science', 'cell',
      '论文', '文献', '综述', '投稿', '审稿', '评审意见', '引用', '参考文献',
      '期刊', '摘要', '润色', '改写', '翻译论文', '答辩', '开题', '课题', '稿件',
      '投稿信', '基金', '实验设计'
    ],
    hint: {
      zh: '写作 / 润色 / 引用 / 审稿是不同技能，先定做哪一类，别一次叠多个。',
      en: 'Writing, polishing, citation and reviewing are separate skills — pick one before loading anything.'
    },
    firstAction: {
      zh: '先问清或判断是“写 / 评 / 译读 / 查引用”哪一类，只加载对应的一个技能。',
      en: 'Decide whether this is write / review / read / cite, and load only the matching skill.'
    }
  },
  {
    id: 'notes',
    label: 'Notes & Knowledge Base',
    labels: { zh: '笔记与知识库' },
    keywords: [
      'vault', 'wikilink', 'backlink', 'markdown', 'knowledge base',
      'wiki', 'daily note', 'meeting notes', 'note taking', 'zettelkasten', 'obsidian',
      '笔记', '双链', '反向链接', '知识库', '日记', '标签', '卡片', '大纲', 'md 文件'
    ],
    hint: {
      zh: '先搜索定位再写入，避免覆盖已有内容；链接与标签按仓库约定写。',
      en: 'Search before writing to avoid overwriting existing notes; follow the vault link and tag conventions.'
    },
    firstAction: {
      zh: '先用搜索定位相关笔记，再读、再追加或改写。',
      en: 'Search for the related note first, read it, then append or rewrite.'
    }
  },
  {
    id: 'communication',
    label: 'Messaging & Collaboration',
    labels: { zh: '消息与协作' },
    keywords: [
      'message', 'chat', 'group', 'email', 'mail', 'calendar', 'meeting',
      'schedule', 'approval', 'okr', 'slack', 'discord', 'feishu', 'lark',
      '飞书', '消息', '群聊', '群消息', '邮件', '日历', '日程', '会议', '审批',
      '考勤', '多维表格', '云文档', '妙记', '画板', '通知', '邀请', '回复'
    ],
    hint: {
      zh: '先看已有命令 / 接口是否覆盖，认证问题单独处理；发出去之前确认对象与内容。',
      en: 'Check the available command surface first; handle auth separately and confirm recipient and content before sending.'
    },
    firstAction: {
      zh: '先确认要操作的资源类型（消息 / 文档 / 日历 / 任务），再选对应入口。',
      en: 'Identify the resource type (message / doc / calendar / task), then pick the matching entry point.'
    }
  },
  {
    id: 'cli',
    label: 'External CLIs & Agents',
    labels: { zh: '外部 CLI 与 Agent' },
    keywords: [
      'codex', 'claude code', 'kimi', 'grok', 'hermes', 'gemini', 'opencode',
      'cursor', 'trae', 'non-interactive', 'headless', 'subprocess', 'cli',
      '非交互', '命令行调用', '子进程', '外部模型', '外部 agent', '批处理调用'
    ],
    hint: {
      zh: '只问用法就读说明；真要执行先 --help 确认参数，别凭印象拼命令。',
      en: 'Read the docs for usage questions; confirm flags with --help before executing — never guess.'
    },
    firstAction: {
      zh: '先跑 --help 或读说明确认参数，再写执行命令。',
      en: 'Run --help or read the usage first, then compose the command.'
    }
  },
  {
    id: 'desktop',
    label: 'Desktop Control',
    labels: { zh: '桌面控制' },
    keywords: [
      'mouse', 'keyboard', 'window', 'click', 'drag', 'taskbar', 'shortcut',
      'desktop automation', 'gui', 'exe',
      '鼠标', '键盘', '窗口', '点击', '拖拽', '任务栏', '快捷键', '打开软件',
      '桌面', '屏幕', '自动化操作', '右键', '应用窗口'
    ],
    hint: {
      zh: '先截一张图确认当前状态，再决定点哪里；每一步都回看结果。',
      en: 'Take a screenshot to confirm current state before clicking; verify after each step.'
    },
    firstAction: {
      zh: '先截图确认屏幕状态，再执行点击或输入。',
      en: 'Screenshot the current screen, then act.'
    }
  },
  {
    id: 'memory',
    label: 'Memory & Todos',
    labels: { zh: '记忆与待办' },
    keywords: [
      'remember', 'memory', 'todo', 'task list', 'remind me', 'preference',
      'deadline', 'follow up',
      '记住', '记忆', '待办', '任务列表', '提醒我', '定时提醒', '别忘了',
      '长期记忆', '偏好', '截止', '跟进', '整理记忆'
    ],
    hint: {
      zh: '长期事实写记忆，可执行事项写待办，可复用流程写成技能。',
      en: 'Durable facts go to memory, actionable items to todos, reusable procedures to a skill.'
    },
    firstAction: {
      zh: '先判断这是“事实 / 待办 / 流程”，再选对应的写入工具。',
      en: 'Classify as fact / todo / procedure, then use the matching tool.'
    }
  },
  {
    id: 'design',
    label: 'Frontend & UI',
    labels: { zh: '前端与界面' },
    keywords: [
      'frontend', 'react', 'vue', 'component', 'page', 'ui', 'css', 'tailwind',
      'shadcn', 'html page', 'mini program', 'app development', 'artifact',
      'responsive', 'interaction',
      '前端', '组件', '页面', '样式', '小程序', '应用开发', '设计稿还原',
      '交互', '响应式', '布局', '配色', '字体'
    ],
    hint: {
      zh: '改动功能前先对齐需求与状态；只改样式时直接改，不要重做结构。',
      en: 'Align on requirements and states before adding features; for pure styling, edit instead of restructuring.'
    },
    firstAction: {
      zh: '先明确是“加功能”还是“调样式”，再决定要不要先对齐需求。',
      en: 'Decide feature vs styling first; only run a requirements pass for features.'
    }
  },
  {
    id: 'engineering',
    label: 'CAD & Technical Drawing',
    labels: { zh: '工程制图' },
    keywords: [
      'cad', 'autocad', 'dxf', 'dwg', 'technical drawing', 'floor plan',
      'section view', 'dimension', 'layer',
      '图纸', '画图', '制图', '平面图', '三视图', '剖面', '标注', '图层',
      '布置图', '图框', '比例尺', '指北针', '装配图'
    ],
    hint: {
      zh: '先定图层 / 字体 / 比例与图框，再画图元；标注要成链。',
      en: 'Fix layers, fonts, scale and the drawing frame first; dimension chains must be complete.'
    },
    firstAction: {
      zh: '先确认图幅、比例尺和图层规范，再开始画；一次性出完整图，不要零散补。',
      en: 'Confirm sheet size, scale and layer conventions before drawing; produce the full sheet in one pass.'
    }
  },
  {
    id: 'electronics',
    label: 'Electronics & EDA',
    labels: { zh: '电路与 EDA' },
    keywords: [
      'circuit', 'schematic', 'pcb', 'eda', 'kicad', 'easyeda', 'jlcpcb',
      'lcsc', 'bom', 'spice', 'simulation', 'amplifier', 'filter', 'power supply',
      'resistor', 'capacitor', 'footprint',
      '电路', '原理图', '嘉立创', '立创', '仿真', '电源', '滤波', '放大器',
      '打样', '贴片', '选料', '阻容', '封装', '元件', '选型', '网表'
    ],
    hint: {
      zh: '验证电路与选料打样是两条路径，先确认做哪一件；仿真参数要写清。',
      en: 'Validation and sourcing/fabrication are separate paths — pick one first and state simulation parameters.'
    },
    firstAction: {
      zh: '先判断是“仿真验证”还是“选料 / 打样下单”，只走对应的一条链路。',
      en: 'Decide simulation vs sourcing/fabrication, then follow only that path.'
    }
  },
  {
    id: 'system',
    label: 'System & Operations',
    labels: { zh: '系统与运维' },
    keywords: [
      'server', 'process', 'service', 'log', 'port', 'firewall', 'permission',
      'disk', 'backup', 'restore', 'startup', 'registry', 'powershell', 'ssh',
      'network', 'proxy', 'certificate', 'environment variable',
      '服务器', '进程', '服务', '日志', '端口', '防火墙', '权限', '磁盘', '备份',
      '恢复', '开机', '启动项', '注册表', '环境变量', '网络', '代理', '证书',
      '系统设置', '定时任务'
    ],
    hint: {
      zh: '先看现状（进程 / 日志 / 配置），再改；改之前留回滚路径。',
      en: 'Observe first (processes / logs / config), then change — keep a rollback path.'
    },
    firstAction: {
      zh: '先只读检查现状并留证据，再决定是否修改。',
      en: 'Inspect read-only and keep evidence before changing anything.'
    }
  }
]

/**
 * File-extension signals: a `.xlsx` in the request is strong evidence for one domain.
 * Extensions are matched against the normalized request text (".xlsx").
 */
export const EXTENSION_DOMAINS = {
  xlsx: 'documents', xls: 'documents', docx: 'documents', doc: 'documents',
  pptx: 'documents', ppt: 'documents', pdf: 'documents',
  csv: 'data', tsv: 'data', parquet: 'data',
  js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code',
  py: 'code', rs: 'code', go: 'code', java: 'code', c: 'code', cpp: 'code',
  h: 'code', hpp: 'code', sh: 'code', ps1: 'code', sql: 'code', json: 'code',
  yaml: 'code', yml: 'code', toml: 'code',
  html: 'web', htm: 'web',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  bmp: 'image', tiff: 'image', svg: 'image',
  mp4: 'media', mov: 'media', mkv: 'media', avi: 'media', wav: 'media',
  mp3: 'media', m4a: 'media', flac: 'media',
  md: 'notes', canvas: 'notes',
  tex: 'academic', bib: 'academic',
  dxf: 'engineering', dwg: 'engineering', step: 'engineering', stl: 'engineering',
  kicad_pcb: 'electronics', sch: 'electronics', brd: 'electronics'
}

/**
 * Negative signals: generic wording that otherwise drags a request into the wrong
 * domain. Example: "this spreadsheet throws an error" is a debugging task, not a
 * document-authoring task.
 */
export const NEGATIVE_RULES = [
  {
    keys: ['报错', '异常', '错误信息', '堆栈', 'traceback', 'stack trace', 'error', 'exception', 'bug'],
    against: ['documents', 'academic', 'communication', 'notes', 'media']
  },
  {
    keys: ['pull request', 'merge request', 'commit', 'rebase', 'failing test', 'unit test', 'traceback'],
    against: ['academic', 'documents', 'communication', 'creative', 'media']
  },
  {
    keys: ['不要问', '别问', '直接做', '别废话', 'just do it'],
    against: ['academic', 'documents']
  }
]

/** Default English labels for an unknown/custom domain id. */
export function fallbackLabel(id) {
  return String(id)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
