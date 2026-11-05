# dsh-need-router（需求判断器）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.12-3c873a)](https://nodejs.org/)
[![DSH plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4b6bfb)](https://github.com/deepseek-ai)

[English](README.md) · 中文

> **DeepSeek Harness（DSH）的能力路由插件。** 一条请求进来，它会回答：这属于哪些**能力域**、本机实际装了哪些**技能**能干这活、本会话里哪些**工具**真的用得上；顺带给出「第一步做什么」和「这次可以跳过什么」。

它只给路由**提示**，不替模型执行：不加载技能、不调用工具、不联网。所有候选都来自它所在机器的**实时注册表**——所以同一份代码，在装了完全不同技能集的机器上都成立。

---

## 目录

- [一句话看懂](#一句话看懂)
- [为什么需要它](#为什么需要它)
- [它回答什么](#它回答什么)
- [实际输出示例](#实际输出示例)
- [工作原理](#工作原理)
- [安装](#安装)
- [用法](#用法)
- [输出模式](#输出模式)
- [配置](#配置)
- [自定义能力域](#自定义能力域)
- [内置的 17 个能力域](#内置的-17-个能力域)
- [成本](#成本)
- [兼容性与要求](#兼容性与要求)
- [安全与隐私](#安全与隐私)
- [设计保证](#设计保证)
- [已知边界](#已知边界)
- [排错指南](#排错指南)
- [常见问题](#常见问题)
- [开发与测试](#开发与测试)
- [项目结构](#项目结构)
- [路线图](#路线图)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 一句话看懂

- **是什么**：一个 DSH 插件，加一个 `need_route` 工具 + 一句系统提示词。
- **要多少**：常驻约 300 tok 的工具 schema；真正调用一次约 80–600 tok。
- **不做什么**：不加载技能、不执行工具、不调模型、不写文件。答完就停。
- **为什么通用**：v0.2.0 每次调用都向宿主实时查询技能与工具，源码里没有技能名、工具名或个人路径。

## 为什么需要它

技能目录一大，Agent 还没开始干活就先遇到「路由问题」。仅作者本机就有 100 多个技能散在五个来源（`~/.agents`、`~/.dsh`、`~/.claude`、`~/.trae-cn` 和项目内目录）。靠读技能描述来决定加载哪个，每次都得花几千 tok；靠猜，则可能加载错 `SKILL.md` 再重来。

一次确定性的预判就能先回答几个便宜的问题：

- 这条请求涉及哪些能力域？
- 本机哪些已装技能真的能服务它？
- 当前会话可见的工具里哪些相关？
- 第一步该干什么，什么可以跳过？

只要它让你少读半篇 `SKILL.md`，这次调用就回本；而纯对话、单轮已知操作，直接不调用即可。

## 它回答什么

| 问题 | 示例答案 |
|---|---|
| 涉及哪些能力域？ | `Code & Engineering(strong)`、`Data Analysis(medium)` |
| 本机哪些技能？ | `code-review(user)`、`test-driven-development(user)` —— 绝不推荐没装的技能 |
| 哪些可见工具？ | `ops_bash`、`ops_grep` —— 绝不推荐本会话调不到的工具 |
| 先做什么、跳过什么？ | 「先搜（grep / 列文件），读文件再改，不要猜」/ 跳过 `Documents & Spreadsheets` |

## 实际输出示例

请求 `Build a chart from this Excel pivot table`，样例注册表里有两个用户技能和一个工具（名字仅用于示例，插件实际读取的是你本机的注册表）：

```text
verdict: Data Analysis(medium) + Documents & Spreadsheets(medium)
matched: pivot table, chart, excel, pivot
skills: excel-tools(user), chart-maker(user)
tools: no dedicated tool matched; follow the commands in the skill
first step: Read the header and a few sample rows (shape, columns, missing values) before choosing an analysis.
· Documents & Spreadsheets note: Load exactly one subtype skill for the file type; recalculate after formula edits and render before delivery.
skip this time: Code & Engineering
```

只想看短名单时用 `brief` 模式：

```text
brief: Data Analysis(medium) + Documents & Spreadsheets(medium) | skills excel-tools,chart-maker | tools -
```

## 工作原理

```text
请求原文
   │  NFKC 归一 · 转小写 · 过滤停用词
   ▼
能力域打分 ── 关键词 · 文件后缀 · 负向规则
   │
   ├──► 技能   ← 宿主技能注册表（按调用方 agent 作用域）
   │        └──► 从推荐技能的正文里提取工具证据
   └──► 工具   ← 本会话可见的工具 schema
   ▼
渲染：brief · route · inventory · json —— 语言跟随请求
```

除短 TTL 缓存（判定 5 分钟、清单 5 秒、技能正文 5 分钟）外，不跨插件生命周期保留任何状态。同一请求 + 同一注册表，永远得到同一排序。

## 安装

DSH 插件，**host-only**（注册工具 + 注入提示词，无 UI）。

1. 在 profile 的 `package.json` 里加依赖与 bundle：

```json
{
  "dependencies": {
    "dsh-need-router": "github:ken688/dsh-need-router"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-need-router"]
    }
  }
}
```

2. 重新安装 profile 依赖（或让插件管理器安装一次），然后重启宿主。
3. 会话里会出现 `need_route` 工具，同时注入一句很短的提示词。

本地开发可直接用 `link:` 指向源码目录，改完热重载即可，无需重启。

**卸载**：从 profile `package.json` 去掉依赖与 bundle 项，重跑安装并重启；或在插件管理器里停用。

## 用法

`need_route` 有四个参数：

| 参数 | 类型 | 作用 |
|---|---|---|
| `request` | string（必填） | 用户请求原文。写得越长，路由越准。 |
| `brief` | boolean | 只返回一行结论，不返回完整路由。 |
| `mode` | string | `route`（默认）· `brief` · `inventory` · `json` |
| `limit` | integer | 最多返回几个能力域（1–8），默认取 `maxDomains`。 |

```text
need_route(request="帮我用飞书发周报，并把 Excel 数据做成图表")
```

```text
need_route(request="...", brief=true)
```

```text
need_route(request="...", mode="json")
```

输出语言跟随请求：中文请求回中文，英文请求回英文，中英混合按中文处理；可用 `locale` 强制。

纯对话、单轮已知操作（读文件、跑命令、改代码）**不需要**调用——提示词里也是这么写的。

## 输出模式

| 模式 | 内容 | 成本（约） |
|---|---|---|
| `brief`（或 `brief=true`） | 一行：域 + 置信度 + 技能名 + 工具名 | 80–150 tok |
| `route`（默认） | 判定、命中词、技能、工具、第一步、次要域提示、可跳过项 | 300–600 tok |
| `inventory` | 已装插件、技能目录（含来源分布）、本会话可见工具 | 视环境 |
| `json` | 同一次判定的机器可读结果，便于脚本化 | 视输出 |

`inventory` 同时是诊断模式：路由不对时，它直接告诉你插件到底看见了哪些技能、来自哪个来源。

## 配置

写在 profile 的 patch 里（`cordis.patch.yml` 的 `config:` 块）：

| 键 | 默认 | 说明 |
|---|---|---|
| `maxDomains` | `3` | 每次最多返回几个能力域（1–8） |
| `injectPrompt` | `true` | 是否注入那句很短的提示词 |
| `promptOrder` | `30` | 注入片段的排序 |
| `locale` | `auto` | `auto` 跟随请求，或强制 `zh` / `en` |
| `matchSkills` | `true` | 是否在已装技能里排序 |
| `matchTools` | `true` | 是否在可见工具里排序 |
| `showSkillSource` | `true` | 技能后标注来源（`user` / `project` / `bundled`…） |
| `skillLimit` | `6` | 单次最多返回几条技能（1–20） |
| `toolLimit` | `6` | 单次最多返回几个工具（1–20） |
| `inventorySkillLimit` | `80` | inventory 模式最多列多少技能 |
| `skillSources` | `[]` | 只推荐来源前缀匹配的技能（空 = 全部） |
| `excludeSources` | `[]` | 永不推荐来源前缀匹配的技能 |
| `excludeTools` | `["need_route"]` | 永不推荐的工具名 |
| `skillRoots` | `[]` | 无 skills 服务时额外扫描的技能目录 |
| `projectDir` | `""` | 项目级技能发现目录（默认沿用宿主解析） |
| `skillScanLimit` | `500` | 文件兜底最多读取多少个技能 |
| `domains` | `[]` | 自定义能力域：新 `id` 新增，已有 `id` 扩展或覆盖内置域 |
| `extraKeywords` | `{}` | 按域 id 追加关键词 |
| `disableDomains` | `[]` | 按 id 关闭内置域 |
| `cacheTtlMs` | `5000` | 清单缓存 TTL |
| `contentTtlMs` | `300000` | 技能正文缓存 TTL（用于工具证据） |
| `routeCacheTtlMs` | `300000` | 相同请求的判定缓存 TTL |

## 自定义能力域

`hint` 与 `firstAction` 既可以写字符串，也可以写 `{ zh, en }` 对象；字符串会归入默认提示语言（`locale: en` 时为英文，否则中文）。关键词是**追加**，不会替换内置关键词。

```yaml
- id: need-router
  name: dsh-need-router
  config:
    maxDomains: 3
    locale: auto
    domains:
      - id: finance
        label: Finance
        keywords: [invoice, 发票, 报销, 对账, 凭证]
        hint:
          zh: 先核对口径与期间，再动数。
          en: Confirm the period and the metric definition before touching numbers.
        firstAction:
          zh: 先要原始凭证与口径，再决定要不要加载技能。
          en: Get the source documents and the accounting period first, then decide whether to load a skill.
        extensions: [ledger]
    extraKeywords:
      data: [留存率, 转化率]
```

`id` 若与内置域重名（例如 `data`），会保留内置关键词并叠加你的；在这类条目上加 `disabled: true` 则会移除该内置域。

## 内置的 17 个能力域

它们只描述能力领域，不含任何技能名或工具名。

| Id | 标签 | 通常覆盖 |
|---|---|---|
| `documents` | 文档与表格 | Word / Excel / PowerPoint / PDF 撰写、公式、排版 |
| `data` | 数据分析 | 统计、聚合、连接、图表、指标口径 |
| `code` | 代码与工程 | 源码修改、缺陷、测试、git、构建、依赖、部署 |
| `web` | 网页与浏览器 | 页面、抓取、登录、动态渲染、浏览器自动化 |
| `image` | 图像理解 | 截图、OCR、图表、照片、设计稿 |
| `media` | 音视频 | 探针、转写、字幕、分镜、按时间点提问 |
| `creative` | 生成式媒体 | 文生图 / 文生视频、海报、封面、头像 |
| `academic` | 学术写作 | 论文、文献、引用、审稿、润色、投稿 |
| `notes` | 笔记与知识库 | Markdown、日志、双链、反链、仓库约定 |
| `communication` | 沟通与协作 | 聊天、邮件、日历、会议、审批、OKR |
| `cli` | 外部 CLI 与 Agent | 非交互驱动其他 CLI / Agent |
| `desktop` | 桌面控制 | 鼠标 / 键盘 / 窗口 / 快捷键 / GUI 应用 |
| `memory` | 记忆与待办 | 长期事实、待办、提醒、偏好 |
| `design` | 前端与界面 | 组件、页面、样式、响应式、交互 |
| `engineering` | CAD 与工程制图 | 图纸、图层、标注、平面图、DXF/DWG |
| `electronics` | 电子与 EDA | 原理图、PCB、BOM、选料、SPICE 仿真 |
| `system` | 系统与运维 | 进程、服务、日志、端口、权限、环境、网络 |

文件后缀是独立的信号表（`.xlsx` → `documents`、`.csv` → `data`、`.ts` → `code`、`.dxf` → `engineering`、`.kicad_pcb` → `electronics`…），自定义域可用 `extensions` 追加。负向规则会压掉被通用措辞带进来的域——「这个表格报错了」是代码任务，不是文档撰写任务。

## 成本

常驻（每个请求都有）：

- `need_route` 工具 schema：约 300 tok；
- 注入的提示词（`locale: auto` 时中英各一句）：约 40–60 tok。

单次调用：

- `brief` ≈ 80–150 tok；
- `route` ≈ 300–600 tok；
- `inventory` / `json` 视环境。

这笔账：一次调用只要让你**少读半篇 SKILL.md**（2–6k tok）再读对的那篇，就赚回来了。纯对话或显而易见的单步操作，跳过即可。

## 兼容性与要求

- 宿主提供 `tools` 与 `systemPrompt` 服务的 DSH。
- 有 `skills` 服务时优先使用（`ctx.get('skills')`，按调用方 agent 作用域）；没有则降级扫描 `SKILL.md` 文件。
- Node.js **≥ 22.12**；仅 ESM；peer 依赖 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`。
- 不联网、不需要 API key、不调模型：判定是确定性的关键词打分。

## 安全与隐私

- **只读**：不写文件、不发网络请求、不改配置。
- **读什么**：宿主已合并的技能注册表（若存在）、本会话可见的工具 schema、profile `package.json` 的依赖名；只有降级路径才扫描技能目录：项目的 `.agents/skills` 与 `.claude/skills`，然后是 `~/.agents/skills`、`~/.dsh/skills`、`~/.claude/skills`、`~/.codex/skills`、其他 `~/.<dir>/skills`，以及 `skillRoots`。
- **不发送什么**：请求原文、技能名、工具名都不离开进程，没有遥测。
- **输出只包含已存在的名字**：不会拼造、不会补全一个不存在的技能 id。

## 设计保证

这些由代码保证，不是口头约定：

- **绝不推荐当前作用域里没装的技能**，也**绝不推荐本会话不可见的工具**。候选全部来自实时清单，不凭空合成。
- 可用 `skillSources` / `excludeSources` 过滤来源，例如只保留 `user` 技能参与排序。
- 工具推荐基于**证据**：请求里点名、工具名的词命中请求、工具名的某个词与命中域关键词完全一致、或推荐技能正文里点名了它。没有工具名清单。
- 内置分类表只描述**能力领域**；扩展走配置（`domains`、`extraKeywords`、`disableDomains`），不改源码。
- 判定**确定性、本地化**：同一请求 + 同一清单，结果永远一致。
- **失败不致命**：`request` 为空返回用法提示；内部异常返回 `need_route failed: …`，且 `mode=inventory` 仍可用于诊断。

## 已知边界

- **跨语言匹配是词面匹配，不是语义匹配。** 能力域关键词是中英双语的，所以英文技能库上中文请求也能判对域；但技能名 / 描述按各自语言匹配——如果本机技能只有英文描述，中文请求可能只给到能力域、给不出具体技能。它不会编造名字；给技能补上中文描述或中文关键词即可恢复召回。
- **它会判错。** 判定基于关键词，措辞奇特时可能落到相邻域；所以 `firstAction` 是建议，不是闸门。
- **它会只给建议、不执行。** 不加载技能、不调工具、不按模型偏好重排；除缓存外不保留历史。
- **工具推荐可能有噪声。** 名字里带域关键词的通用工具（例如叫 `build_*` 的开发工具）可能出现在不相关的域里。用 `excludeTools` 排除，或 `matchTools: false` 收紧。

## 排错指南

| 现象 | 检查 |
|---|---|
| 工具列表里没有 `need_route` | `dsh-need-router` 是否在 `dsh.profile.bundles` 里？安装后是否重启过宿主？ |
| 推荐了不想要的技能 | 用 `skillSources` / `excludeSources` 过滤；`excludeTools` 隐藏工具；`disableDomains` 关掉整个域。 |
| 只给域、不给技能 | 跑 `mode=inventory` 看来源分布；文件兜底时确认技能目录；英文描述的技能补中文关键词/描述。 |
| 某个域从不出现 | 用 `extraKeywords` 补词，或自定义能力域；检查是否被负向规则压掉。 |
| 输出语言不对 | 把 `locale` 设成 `zh` 或 `en`，别用 `auto`。 |
| 返回了错误 | `need_route failed: …` 不致命；`mode=inventory` 仍可用，通常能看出原因。 |

## 常见问题

**会调用大模型吗？** 不会。域、技能、工具打分都是确定性代码，不调模型、不联网、不需要 key。

**会加载或执行它推荐的技能吗？** 不会。它只给名字，是否加载由模型决定。

**为什么不让模型自己判断？** 可以，但 100+ 技能的目录让这个判断既贵又不稳定。一次便宜的确定性预判收窄候选集，最终决定权仍在模型。

**能适配我的技能集吗？** 能。排序在调用时基于你的注册表计算；当前作用域没装的技能不可能被推荐。

**能在 DSH 之外用吗？** 打分内核（`lib/text.js`、`lib/taxonomy.js`、`lib/match.js`、`lib/render.js`）是零依赖 ESM，其他宿主可以包装引用；但本包面向 DSH 服务（`tools`、`systemPrompt`，可选 `skills`），目前没有其他宿主适配层。

**为什么是 17 个域？** 它们覆盖通用 Agent 会遇到的主要能力面。列表是数据不是代码：可用配置新增、扩展或关闭。

**请求会被发到哪里吗？** 不会。全部在进程内完成，没有遥测。

## 开发与测试

```bash
npm test   # node --test，纯模块测试，不需要安装任何依赖
```

测试零依赖，覆盖文本匹配、分类表、打分、渲染与发现兜底。测试规则、如何新增能力域与 PR 检查清单见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目结构

```text
lib/text.js        归一化、关键词匹配、CJK n-gram、停用词、语言判定
lib/taxonomy.js    内置能力域、后缀信号、负向规则
lib/discover.js    现场清单：skills 服务、tools 注册表、profile 插件、文件兜底
lib/match.js       打分与组合（域 → 技能 → 工具证据）
lib/render.js      brief / route / inventory 四种渲染与截断，中英双语
lib/index.js       插件装配：defineTool、配置 schema、缓存、系统提示词
test/              各模块的 node --test 用例
```

## 路线图

以下是候选想法，不是承诺——欢迎 issue / PR 反馈：

- 可选的语义（embedding）兜底，改善跨语言技能召回，默认关闭。
- 为内置分类表提供更多语言包（结构本身已是双语）。
- 针对公开技能目录的本地基准测试。
- 更丰富的 `json` 输出，便于外部路由器和 UI 直接消费。

## 参与贡献

欢迎 issue 与 PR。请保持核心约束：`lib/taxonomy.js` 里不写技能名、工具名或个人路径；推荐必须基于证据；测试必须在不安装任何依赖的情况下通过。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE) © 2026 ken688。可自由使用、修改、分发与商用，仅需保留版权与许可声明。
