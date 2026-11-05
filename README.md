# dsh-need-router

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
English · [中文](README.zh-CN.md)

A capability router plugin for **DeepSeek Harness (DSH)**. Given one request, it answers three questions cheaply:

- which **capability domains** does this touch?
- which of the **skills installed on this machine** can serve it?
- which **tools visible in this session** are actually useful?

It also names the first concrete step and what can be skipped. It does not load, call, or dispatch anything — it is a routing hint for the model.

The point of 0.2.0 is that it is **generic**. Nothing about the author's machine is baked in: skills and tools are read from the live host registry on every call, so the same package behaves correctly on a machine with a completely different skill set.

## What v0.2.0 changed

v0.1 hardcoded a fixed list of capability domains together with the author's own skill and tool names, and only scanned `~/.agents/skills` and `~/.dsh/skills`. It therefore only worked on the author's machine: on any other box it recommended skills that were not installed, missed skills that lived elsewhere, and could not be extended without editing source.

| Layer | v0.1 | v0.2.0 |
|---|---|---|
| Capability domains | Hardcoded, with skill names per domain | Built-in taxonomy of capability areas only — bilingual, no skill names, no personal paths; extended through config |
| Skills | Hardcoded per domain; two scanned directories | Live host skill registry (`ctx.get('skills')`), scoped listing; filesystem `SKILL.md` scan only as a fallback |
| Tools | Hardcoded per domain | Live tool registry (`ctx.get('tools').schemas(scope)`); recommendations rest on evidence, not a name list |
| Output language | Chinese | Follows the request (`locale: auto\|zh\|en`) |

Hard guarantees, enforced by the code rather than by convention:

- It **never recommends a skill that is not installed** in the current scope, or a **tool that is not visible** to the session. Candidates come from the live inventory; nothing is synthesised.
- Skill sources can be filtered with `skillSources` / `excludeSources`, so you can keep, say, only `user` skills out of the ranking.
- Tool recommendations are **evidence-based**: an explicit mention in the request, a match between a token of the tool name and the request, or the tool being named inside the body of a recommended skill. There is no hardcoded tool list.
- The built-in taxonomy describes **capability areas only**. You extend it through config (`domains`, `extraKeywords`, `disableDomains`) instead of patching source.

## Install

DSH plugin, **host-only** (it registers a tool and a system-prompt hint; there is no UI).

1. Add the dependency and the bundle to your profile's `package.json`:

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

2. Install profile dependencies again (or let the plugin manager install it once), then restart the host.
3. The session gains a `need_route` tool plus a one-sentence system-prompt hint.

For local development, depend on the checkout with a `link:` specifier instead of the GitHub specifier — edits then need only a plugin reload, not a restart.

## Usage

`need_route` takes four parameters:

| Parameter | Type | Purpose |
|---|---|---|
| `request` | string (required) | The user request verbatim. Longer input routes more accurately. |
| `brief` | boolean | Return a single compact line instead of the full route. |
| `mode` | string | `route` (default) \| `brief` \| `inventory` \| `json` |
| `limit` | integer | Maximum capability domains to return (clamped to 1–8). Defaults to `maxDomains`. |

Output modes:

| Mode | Content | Cost (approx.) |
|---|---|---|
| `brief` (or `brief=true`) | One line: domains with confidence, then skill and tool names | 80–150 tokens |
| `route` (default) | Verdict, matched keywords, skills, tools, first step, notes for secondary domains, what to skip | 300–600 tokens |
| `inventory` | Installed plugins, skill catalogue with its source breakdown, tools visible to the session | depends on environment |
| `json` | The same routing result as machine-readable JSON, for scripts | depends on output |

```text
need_route(request="Audit the Excel budget workbook, fix the broken pivot formula, then post the summary to the team chat")
```

```text
need_route(request="...", brief=true)
```

Example output for `Build a chart from this Excel pivot table`, against a sample registry of two user skills and one tool (the names below exist only in this example — the plugin would read whatever your machine actually has):

```text
brief: Data Analysis(medium) + Documents & Spreadsheets(medium) | skills excel-tools,chart-maker | tools -
```

```text
verdict: Data Analysis(medium) + Documents & Spreadsheets(medium)
matched: pivot table, chart, excel, pivot
skills: excel-tools(user), chart-maker(user)
tools: no dedicated tool matched; follow the commands in the skill
first step: Read the header and a few sample rows (shape, columns, missing values) before choosing an analysis.
· Documents & Spreadsheets note: Load exactly one subtype skill for the file type; recalculate after formula edits and render before delivery.
skip this time: Code & Engineering
```

The `(user)` suffix is the skill's source tag — `bundled`, `runtime`, `project`, `custom`, `user`, or a provider id when none of those match. Hide it with `showSkillSource: false`.

Output language follows the request: a Chinese request gets a Chinese answer, an English request an English one, and mixed requests count as Chinese. Set `locale` to force one language.

Plain conversation and single-step work you already know how to do (read a file, run a command, edit code) do **not** need a call — the injected prompt hint says exactly that.

## How it decides

Input is NFKC-normalised and lowercased. Latin keywords match on word boundaries (with optional plural `s`/`es` for keywords of three or more characters, so `go` does not match `good`); CJK keywords match as substrings.

**Capability domains** — scored over the request text:

| Signal | Weight |
|---|---|
| Keyword hit (keyword ≥ 3 chars / < 3 chars) | +2 / +1.2 |
| File-extension hit (`.xlsx`, `.mp4`, …) | +3 |
| Negative rule hit (e.g. "error / stack trace" suppresses the document and academic domains) | −3 |
| Confidence bucket | strong ≥ 6, medium ≥ 3, weak > 0 |

**Skills** — ranked only among what the machine actually has:

| Signal | Weight |
|---|---|
| Skill name written in the request (names ≥ 4 chars) | +8 |
| A token of the skill name appears in the request | +3 per token (cap 6; +1.5 when it only matches a domain keyword) |
| A matched domain keyword appears in the skill's description / when-to-use | +2 per keyword (cap 8) |
| Request word appears in the description | +1 per word (cap 4) |
| CJK n-gram appears in the description | +0.6 per gram (cap 3) |
| Skill name carries the id of a top-3 domain (`code-review` ↔ `code`) | +2 |
| Inclusion threshold | ≥ 3 points |

**Tools** — ranked only among what the session can currently call:

| Signal | Weight |
|---|---|
| Tool name written in the request (names ≥ 5 chars) | +6 |
| A token of the tool name appears in the request | +3 per token (cap 6) |
| Named inside the body of a recommended skill | +3 × mention weight (weight = min(skill score / 5, 2)) |
| Description word overlap | +0.4 per word (cap 1.5 — never enough to qualify alone) |
| Inclusion threshold | ≥ 3 points |

The skill-body pass reads the bodies of the **top 4** recommended skills (2 s timeout each, 5 min cache) and only counts *distinctive* tool names as evidence — names of four or more characters that contain `_` or `-`, or that are ten or more characters long. A tool literally called `skill` does not "appear" in every skill.

Function words are filtered before any of this — English stop words (`this`, `the`, `please`, …) and their Chinese equivalents — so a long generic description cannot win on noise alone.

Results are cached per plugin lifetime: identical request + scope + `limit` for 5 minutes, inventory for 5 seconds, skill bodies for 5 minutes. Caches are dropped with the plugin fiber.

Everything is deterministic: the same request and the same inventory produce the same ranking.

## Configuration

Config is read from the profile's plugin config (the `config:` block of the `need-router` entry in `cordis.patch.yml`).

| Key | Default | Description |
|---|---|---|
| `maxDomains` | `3` | Capability domains returned per route (1–8). |
| `injectPrompt` | `true` | Inject the short routing hint into the system prompt. |
| `promptOrder` | `30` | Order of the injected system-prompt fragment. |
| `locale` | `auto` | `auto` (follow the request), `zh`, or `en`. |
| `matchSkills` | `true` | Rank the skills installed on this machine. |
| `matchTools` | `true` | Rank the tools visible to the session. |
| `showSkillSource` | `true` | Annotate each recommended skill with its source (`user` / `project` / `bundled` / …). |
| `skillLimit` | `6` | Maximum skills per route (1–20). |
| `toolLimit` | `6` | Maximum tools per route (1–20). |
| `inventorySkillLimit` | `80` | Maximum skill names listed by `inventory` mode. |
| `skillSources` | `[]` | Only recommend skills whose source starts with one of these prefixes (empty = all). |
| `excludeSources` | `[]` | Never recommend skills whose source starts with one of these prefixes. |
| `excludeTools` | `["need_route"]` | Tool names never recommended. |
| `skillRoots` | `[]` | Extra skill directories scanned when the host has no skill registry. |
| `projectDir` | `""` | Directory used to discover project-level skills (defaults to the host resolution). |
| `skillScanLimit` | `500` | Maximum skills read by the filesystem fallback. |
| `domains` | `[]` | Custom capability domains: a new `id` adds a domain, an existing `id` extends or overrides a built-in one. |
| `extraKeywords` | `{}` | Extra keywords per domain id. |
| `disableDomains` | `[]` | Remove built-in domains by id. |
| `cacheTtlMs` | `5000` | Inventory cache TTL. |
| `contentTtlMs` | `300000` | Skill-body cache TTL used for tool evidence. |
| `routeCacheTtlMs` | `300000` | Identical-request route cache TTL. |

### Adding your own capability domain

`hint` and `firstAction` accept either a plain string or a `{ zh, en }` object; a plain string is filed under the default hint language (`en` when `locale` is `en`, otherwise `zh`). Keywords are appended to the domain, never replace it.

```yaml
- id: need-router
  name: dsh-need-router
  config:
    maxDomains: 3
    locale: auto
    domains:
      - id: finance
        label: Finance
        keywords: [invoice, reimbursement, ledger, reconciliation, variance]
        hint: Confirm the period and the metric definition before touching numbers.
        firstAction: Get the source documents and the accounting period first, then decide whether to load a skill.
        extensions: [ledger]
    extraKeywords:
      data: ["retention rate", "churn rate"]
```

A custom `id` that already exists (`finance` does not; `data` does) keeps the built-in keywords and merges yours on top, and a `disabled: true` on such an entry removes that built-in domain.

## Built-in domains (17)

These are capability areas, not skill names — no entry names a skill or a tool.

| Id | Label | Typically covers |
|---|---|---|
| `documents` | Documents & Spreadsheets | Word / Excel / PowerPoint / PDF authoring, formulas, layout |
| `data` | Data Analysis | statistics, aggregation, joins, charts, metric definitions |
| `code` | Code & Engineering | source edits, bugs, tests, git, build, dependencies, deploy |
| `web` | Web & Browser | pages, scraping, login, dynamic rendering, browser automation |
| `image` | Image Understanding | screenshots, OCR, diagrams, photos, design mockups |
| `media` | Audio & Video | probing, transcription, subtitles, storyboards, time-anchored questions |
| `creative` | Generative Media | text-to-image / text-to-video, posters, covers, avatars |
| `academic` | Academic Writing | papers, literature, citations, reviewing, polishing, submission |
| `notes` | Notes & Knowledge Base | Markdown, journals, wikilinks, backlinks, vault conventions |
| `communication` | Messaging & Collaboration | chat, mail, calendars, meetings, approvals, OKRs |
| `cli` | External CLIs & Agents | driving other CLIs and agents non-interactively |
| `desktop` | Desktop Control | mouse / keyboard / windows / shortcuts / GUI apps |
| `memory` | Memory & Todos | durable facts, todos, reminders, preferences |
| `design` | Frontend & UI | components, pages, styling, responsive layout, interactions |
| `engineering` | CAD & Technical Drawing | drawings, layers, dimensions, floor plans, DXF/DWG |
| `electronics` | Electronics & EDA | schematics, PCB, BOM, sourcing, SPICE simulation |
| `system` | System & Operations | processes, services, logs, ports, permissions, env, network |

File extensions are a separate signal table (`.xlsx` → `documents`, `.csv` → `data`, `.ts` → `code`, `.dxf` → `engineering`, `.kicad_pcb` → `electronics`, …); custom domains can add their own through `extensions`. Negative rules suppress domains that generic wording would otherwise drag in — "this spreadsheet throws an error" is a code task, not a document-authoring task.

## Cost

Constant overhead, present in every request:

- the `need_route` tool schema: roughly 300 tokens;
- the injected prompt hint (`promptText`, both languages when `locale` is `auto`): roughly 40–60 tokens.

Per call:

- `brief` ≈ 80–150 tokens;
- `route` ≈ 300–600 tokens;
- `inventory` / `json` depend on the environment.

The arithmetic that justifies it: a single call that stops you from loading one wrong `SKILL.md` (2–6k tokens) and then reading the right one pays for itself many times over. If the request is plain conversation or an obvious single step, skip the call.

## Behaviour and limits

- **Read-only.** It writes no files, sends no network requests, and changes no configuration.
- **What it reads:** the host's merged skill registry (when present), this session's visible tool schemas, and the profile `package.json` dependency names. Only in the filesystem fallback does it scan skill directories: `<root>/<skill>/SKILL.md` under the project's `.agents/skills` and `.claude/skills`, then `~/.agents/skills`, `~/.dsh/skills`, `~/.claude/skills`, `~/.codex/skills`, any other `~/.<dir>/skills`, plus `skillRoots`.
- **It routes; it does not act.** It never loads a skill, calls a tool, or re-ranks by model preference. It has no memory of past calls beyond the caches.
- **It can be wrong.** Domains are keyword-driven; a request worded unusually may land in a neighbouring domain. That is why `firstAction` advice is phrased as advice and not as a gate.
- **Failure is non-fatal.** An empty `request` returns a usage message; an internal error returns `need_route failed: …`, and `mode=inventory` still works for diagnosis.

## Compatibility

- A DSH host that provides the `tools` and `systemPrompt` services.
- The `skills` service is used when available (`ctx.get('skills')`, scoped to the calling agent); without it the plugin falls back to scanning `SKILL.md` files.
- Node.js **≥ 22.12**; ESM only; peer dependencies on `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`.

## Uninstall

Remove the `dsh-need-router` dependency from the profile `package.json`, re-run the profile install, and restart — or disable it in the plugin manager.

## Development

```bash
npm test   # node --test; pure modules, no dependencies to install
```

| File | Responsibility |
|---|---|
| `lib/text.js` | normalisation, keyword matching, CJK n-grams, stop words, language detection |
| `lib/taxonomy.js` | built-in domains, extension signals, negative rules |
| `lib/discover.js` | live inventory: skills service, tool registry, profile plugins, filesystem fallback |
| `lib/match.js` | scoring and composition (domains → skills → tool evidence) |
| `lib/render.js` | brief / route / inventory rendering and truncation, zh + en |
| `lib/index.js` | plugin wiring: `defineTool`, config schema, caches, prompt hint |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the test rules, how to add a domain, and the PR checklist.

## License

[MIT](LICENSE) © 2026 ken688. Use, modify, redistribute and sell freely; keep the copyright and licence notice.
