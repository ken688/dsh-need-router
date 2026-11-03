# dsh-need-router（需求判断器）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

按「一条请求」判断它落在哪些能力域，给出**该调用的技能与工具短名单 + 第一步做什么**，并列出**本次可以跳过**的域。

## 装了什么

- 工具 `need_route`：
  - `brief=true` → 一行结论（约 80–150 tok），只给域 / 技能名 / 工具名。够用时优先用。
  - 默认 → 带「先做」建议、命中关键词、跳过清单（约 300–600 tok）。
  - `mode=inventory` → 列出已装插件 / 可见工具 / 本地技能，排查环境用。
- 一段很短的系统提示词：仅在跨领域或不确定时提示先问一次路由，纯对话不打扰。

## 判定规则

命中打分：中文关键词 2 分（单字 1.2）、英文关键词 2 分、技能名直出 5 分、工具名直出 4 分、文件后缀命中 3 分；
**负向信号扣 3 分**（例如同时出现「报错/异常/栈」时，Office、学术、飞书域会被压下去，避免“表格里的报错”被当成 Office 任务）。
四档取整后排序，`≥8 强 / ≥4 中 / 其余弱`；最强者 <4 时会附一句「信心偏弱，先直接试一次工具，别急着加载技能」。

Office 家族按文件类型收窄（Excel / Word / PPT / PDF 各自只推荐对应的子技能），避免给 Excel 任务推 PPT 技能。

同一请求 5 分钟内重复判定走缓存，不重复扫描。

## 数据源（每次现取，5 秒缓存）

| 来源 | 用途 |
|---|---|
| `ctx.tools.schemas()` | 本 Agent 当前**真实可见**的工具，避免推荐不存在的工具 |
| `$DSH_PROFILE_DIR/package.json` | profile 里**真实安装**的插件 |
| `~/.agents/skills`、`~/.dsh/skills` | 本地技能的 `name` / `description` frontmatter |

## 配置

| 键 | 默认 | 说明 |
|---|---|---|
| `maxDomains` | 3 | 一次最多返回几个能力域 |
| `injectPrompt` | true | 是否注入系统提示词说明 |
| `promptOrder` | 30 | 提示词片段排序值 |

## 能力域（16 个）

CAD 制图、电路与 EDA、Office 文档、数据分析、视频与音频、图像理解、Obsidian 笔记、飞书、学术写作、网页与浏览器、前端与应用、代码工程、记忆与待办、桌面控制、图片与视频生成、外部 CLI 调度。

每个域都带 `skills`（该加载哪些技能）、`tools`（该用哪些工具）、`hint`（注意事项）、`firstAction`（第一步具体做什么）。

## 成本

- 常驻：工具 schema ≈300 tok + 提示词 ≈230 tok。
- 单次调用：`brief` ≈80–150 tok，默认 ≈300–600 tok。
- 盈亏平衡点：一次调用只要让你**少读半篇 SKILL.md**（一篇 2–6k tok）就赚回来。

## 卸载

删除 profile `package.json` 里 `dsh-need-router` 依赖并重跑 `dsh plugin --profile desktop install`，
或直接从插件市场停用。

## 许可证

[MIT](LICENSE) © 2026 ken688

可自由使用、修改、分发与商用，仅需保留版权与许可声明。
