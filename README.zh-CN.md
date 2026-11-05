# dsh-need-router（需求判断器）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[English](README.md) · 中文

一条请求进来，它会回答三件事：**这属于哪些能力域**、**本机实际装了哪些技能能干这活**、**本会话里哪些工具真的用得上**；顺带给出「第一步做什么」和「这次可以跳过什么」。

> **v0.2 通用版**：不再内置任何技能名、工具名或个人路径。技能与本机装什么完全无关——它每次都向宿主查询真实注册表，所以同一份代码在装了完全不同技能集的机器上都成立。

## 为什么不是 v0.1 那样

v0.1 把 16 个能力域、每个域的技能名与工具名直接写死在源码里，只扫两个目录（`~/.agents/skills`、`~/.dsh/skills`）。结果是：

- 换一台机器，推荐的技能 **不存在**；
- 用户的技能放在 `.claude/skills`、`.trae-cn/skills` 或插件自带的运行时目录里，它 **看不见**；
- 想加一个自己的能力域，只能改源码。

v0.2 的做法：**分类只描述「能力」，具体技能从现场取**。

| 层次 | 来源 | 说明 |
|---|---|---|
| 能力域 | 内置分类表 + 用户配置 | 中英双语关键词、文件后缀信号、负向信号；只描述领域，不点名技能 |
| 技能 | 宿主的 skills 服务（`ctx.get('skills')`，按 agent 作用域） | 只有**真实可见**的技能才会被推荐；可按来源过滤 |
| 工具 | 宿主的工具注册表（`ctx.get('tools').schemas(scope)`） | 只推荐本会话**可见**的工具 |
| 兜底 | 扫描 `<root>/<skill>/SKILL.md` | 宿主没有 skills 服务时的降级路径 |

推荐工具还有几条硬证据通道：**推荐技能自己的正文里点名的工具**，以及**工具名中的词与命中域的关键词完全一致**（如 `memory` 对应「记忆与待办」）。这比维护一份工具名清单可靠，也不需要假设你装了哪些插件。

## 安装

DSH 插件（host-only，无 UI）：

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

2. 重新安装 profile 依赖（或让插件管理器安装一次）并重启宿主。
3. 会话里会出现 `need_route` 工具，同时注入一句很短的提示词。

本地开发可直接用 `link:` 指向源码目录，改完热重载即可，无需重启。

**卸载**：从 profile `package.json` 去掉依赖与 bundle 项，重跑安装；或在插件管理器里停用。

要求：Node.js ≥ 22.12；宿主提供 `tools` 与 `systemPrompt` 服务（DSH 0.2+）。

## 用法

```text
need_route(request="帮我用飞书发周报，并把 Excel 数据做成图表")
```

| 参数 / 模式 | 作用 | 成本（约） |
|---|---|---|
| `brief=true` | 一行结论：域 + 技能 + 工具 | 80–150 tok |
| 默认（`mode=route`） | 判定、命中词、技能、工具、第一步、可跳过 | 300–600 tok |
| `mode=inventory` | 已装插件 / 技能目录（含来源分布）/ 可见工具 | 视环境 |
| `mode=json` | 同一次判定的机器可读结果，便于脚本化 | 视输出 |

输出语言跟随请求：中文请求回中文，英文请求回英文；可用 `locale` 强制。

纯对话、单轮已知操作（读文件、跑命令、改代码）**不需要**调用它——这也是提示词里明确写的。

## 判定原理

**能力域打分**（按请求原文，大小写与全半角已归一）：

| 信号 | 权重 |
|---|---|
| 关键词命中（≥3 字符 / <3 字符） | +2 / +1.2 |
| 文件后缀命中（`.xlsx`、`.mp4`…） | +3 |
| 负向信号命中（如「报错/堆栈」压掉文档域） | −3 |
| 强 / 中 / 弱 | 总分 ≥6 / ≥3 / >0 |

**技能排序**（只在本机已装技能里排序）：

| 信号 | 权重 |
|---|---|
| 请求里直接写出技能名 | +8 |
| 技能名中的词命中请求 | +3/词（上限 6） |
| 命中域的关键词出现在技能描述里 | +2/词（上限 8） |
| 请求词出现在描述里 | +1/词（上限 4） |
| 中文 n-gram 出现在描述里 | +0.6/个（上限 3） |
| 技能名带命中域 id（`code-review` ↔ `code`） | +2 |
| 入选门槛 | ≥3 分 |

**工具排序**（只在本会话可见工具里排序）：请求点名 +6；工具名词命中请求 +3/词（上限 6）；工具名的某个词与命中域的关键词完全一致（如 `memory` ↔ 记忆与待办）+3；推荐技能正文点名 +3×权重；描述词重叠 +0.4（上限 1.5，不足以单独入选）；门槛 ≥3。

同一请求 5 分钟内复用判定结果；技能目录缓存 5 秒；技能正文缓存 5 分钟。

## 配置

写在 profile 的 patch 里（`cordis.patch.yml`），例如：

```yaml
- id: need-router
  name: dsh-need-router
  config:
    maxDomains: 3
    locale: auto
    domains:
      - id: finance
        label: Finance
        labels: { zh: 财务, en: Finance }
        keywords: [invoice, 发票, 报销, 对账, 凭证]
        hint:
          zh: 先核对口径与期间，再动数。
          en: Confirm the scope and period before touching numbers.
        firstAction:
          zh: 先要原始凭证与口径，再决定要不要加载技能。
          en: Get the source documents and definitions first, then decide whether a skill is needed.
    extraKeywords:
      data: [留存率, 转化率]
```

| 键 | 默认 | 说明 |
|---|---|---|
| `maxDomains` | 3 | 每次最多返回几个能力域（1–8） |
| `injectPrompt` | true | 是否注入那句很短的提示词 |
| `promptOrder` | 30 | 提示词片段排序 |
| `locale` | auto | `auto` 跟随请求，或强制 `zh` / `en` |
| `matchSkills` | true | 是否在已装技能里排序 |
| `matchTools` | true | 是否在可见工具里排序 |
| `showSkillSource` | true | 技能后标注来源（用户 / 项目 / 内置…） |
| `skillLimit` / `toolLimit` | 6 / 6 | 单次最多返回条数 |
| `inventorySkillLimit` | 80 | inventory 模式最多列多少技能 |
| `skillSources` / `excludeSources` | [] | 按来源前缀白名单 / 黑名单 |
| `excludeTools` | `['need_route']` | 永不推荐的工具 |
| `skillRoots` | [] | 无 skills 服务时额外扫描的目录 |
| `projectDir` | '' | 项目级技能发现目录 |
| `domains` | [] | 自定义能力域：新 id 新增，已有 id 覆盖并追加关键词 |
| `extraKeywords` | {} | 按域补关键词 |
| `disableDomains` | [] | 关掉内置域 |
| `cacheTtlMs` / `contentTtlMs` / `routeCacheTtlMs` | 5000 / 300000 / 300000 | 各级缓存 |

## 已知边界

- **跨语言匹配是词面匹配，不是语义匹配。** 能力域的关键词是中英双语的，所以英文技能库上中文请求也能判对域；但技能名 / 描述按各自语言匹配——如果本机技能只有英文描述，中文请求可能只给到能力域、给不出具体技能。它不会编造名字；给技能补上中文描述或中文关键词即可恢复召回。
- **它会判错。** 判定基于关键词，措辞奇特时可能落到相邻域；所以 `firstAction` 是建议，不是闸门。

## 数据与隐私

- 只读：不写文件、不发网络请求、不改配置。
- 读取范围：宿主已合并的技能注册表、本会话可见的工具 schema、profile 的 `package.json` 依赖名；降级时才扫描技能目录。
- 不写任何个人路径或技能名进代码；输出里出现的名字都来自你本机的注册表。

## 成本

- 常驻：工具 schema + 一句提示词（约 40–60 tok）。
- 单次：`brief` 约 80–150 tok，默认约 300–600 tok。
- 一次调用只要让你**少读半篇 SKILL.md** 就回本。

## 开发与测试

```bash
npm test        # node --test，纯模块测试，不需要安装任何依赖
```

```
lib/text.js      文本与关键词匹配（中英双轨、CJK n-gram、停用词）
lib/taxonomy.js  内置能力域（双语标签 / 关键词 / 后缀 / 负向规则）
lib/discover.js  现场清单：skills 服务、tools 注册表、profile 插件、文件兜底
lib/match.js     打分与组合（域 → 技能 → 工具证据）
lib/render.js    四种输出的中英渲染与截断
lib/index.js     插件装配：defineTool、配置、缓存、系统提示词
```

## 许可证

[MIT](LICENSE) © 2026 ken688。可自由使用、修改、分发与商用，仅需保留版权与许可声明。
