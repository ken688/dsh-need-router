# dsh-need-router

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.12-3c873a)](https://nodejs.org/)
[![DSH plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4b6bfb)](https://github.com/deepseek-ai)

English · [中文](README.zh-CN.md)

> **A capability router for DeepSeek Harness (DSH).** One request in; back comes the capability domains it touches, the skills your machine actually has for it, and the tools this session can use — plus the first concrete step and what to skip this time.

It is a routing **hint**, not an executor: it never loads a skill, calls a tool, or touches the network. Every recommendation is drawn from the live registry of the machine it runs on, so the same package behaves correctly on a machine with a completely different skill set.

---

## Table of contents

- [TL;DR](#tldr)
- [Why this exists](#why-this-exists)
- [What it answers](#what-it-answers)
- [See it in action](#see-it-in-action)
- [How it works](#how-it-works)
- [Install](#install)
- [Usage](#usage)
- [Output modes](#output-modes)
- [Configuration](#configuration)
- [Adding your own capability domain](#adding-your-own-capability-domain)
- [Built-in capability domains](#built-in-capability-domains-17)
- [Cost](#cost)
- [Compatibility and requirements](#compatibility-and-requirements)
- [Security and privacy](#security-and-privacy)
- [Design guarantees](#design-guarantees)
- [Known limits](#known-limits)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Development](#development)
- [Project layout](#project-layout)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## TL;DR

- **What it is:** a DSH plugin that adds one tool, `need_route`, and a one-sentence system-prompt hint.
- **What it costs:** ~300 tokens of tool schema per request, plus 80–600 tokens when you actually call it.
- **What it never does:** load a skill, run a tool, call a model, or write a file. It answers, then stops.
- **Why generic:** v0.2.0 reads skills and tools from the host registry on every call. No skill names, tool names or personal paths are baked into the source.

## Why this exists

An agent with a large skill catalogue has a routing problem before it has an execution problem. On the author's machine alone there are more than a hundred skills spread over five roots (`~/.agents`, `~/.dsh`, `~/.claude`, `~/.trae-cn`, and per-project directories). Reading skill descriptions to decide what to load costs thousands of tokens per attempt; guessing costs a wrong `SKILL.md` and a retry.

A deterministic pass over the request can answer the cheap questions first:

- Which capability areas does this touch?
- Which installed skills can actually serve it?
- Which of the tools visible right now are relevant?
- What is the first concrete step, and what can be skipped?

That answer is worth one small tool call when it prevents loading the wrong skill — and worth skipping entirely for plain conversation or an obvious single step.

## What it answers

| Question | Example answer |
|---|---|
| Which capability domains? | `Code & Engineering(strong)`, `Data Analysis(medium)` |
| Which installed skills? | `code-review(user)`, `test-driven-development(user)` — never a skill that is not installed |
| Which visible tools? | `ops_bash`, `ops_grep` — never a tool the session cannot call |
| What first, what to skip? | "Search first (grep / list files), read the file, then edit — never guess." / skip `Documents & Spreadsheets` |

## See it in action

Example output for `Build a chart from this Excel pivot table`, against a sample registry of two user skills and one tool. The names below exist only in this example — the plugin would read whatever your machine actually has:

```text
verdict: Data Analysis(medium) + Documents & Spreadsheets(medium)
matched: pivot table, chart, excel, pivot
skills: excel-tools(user), chart-maker(user)
tools: no dedicated tool matched; follow the commands in the skill
first step: Read the header and a few sample rows (shape, columns, missing values) before choosing an analysis.
· Documents & Spreadsheets note: Load exactly one subtype skill for the file type; recalculate after formula edits and render before delivery.
skip this time: Code & Engineering
```

The same request in `brief` mode, for when you only want the shortlist:

```text
brief: Data Analysis(medium) + Documents & Spreadsheets(medium) | skills excel-tools,chart-maker | tools -
```

## How it works

```text
request text
   │  NFKC normalisation · lowercase · stop-word filtering
   ▼
domain scoring ── keywords · file extensions · negative rules
   │
   ├──► skills   ← live host skill registry (scoped to the calling agent)
   │        └──► tool evidence read from the bodies of the top skills
   └──► tools    ← live session tool schemas
   ▼
render: brief · route · inventory · json — in the language of the request
```

Nothing is cached across plugin lifetimes except short TTLs (5 minutes for a route, 5 seconds for the inventory, 5 minutes for skill bodies). The same request against the same inventory always produces the same ranking.

## Install

DSH plugin, **host-only** — it registers a tool and a system-prompt hint; there is no UI.

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

2. Reinstall the profile dependencies (or let the plugin manager install it once), then restart the host.
3. The session gains a `need_route` tool plus a one-sentence system-prompt hint.

For local development, depend on the checkout with a `link:` specifier instead of the GitHub specifier — edits then need only a plugin reload, not a restart.

**Uninstall:** remove the `dsh-need-router` dependency and bundle entry from the profile `package.json`, reinstall the profile, and restart — or disable it in the plugin manager.

## Usage

`need_route` takes four parameters:

| Parameter | Type | Purpose |
|---|---|---|
| `request` | string (required) | The user request verbatim. Longer input routes more accurately. |
| `brief` | boolean | Return a single compact line instead of the full route. |
| `mode` | string | `route` (default) · `brief` · `inventory` · `json` |
| `limit` | integer | Maximum capability domains to return (clamped to 1–8). Defaults to `maxDomains`. |

```text
need_route(request="Audit the Excel budget workbook, fix the broken pivot formula, then post the summary to the team chat")
```

```text
need_route(request="...", brief=true)
```

```text
need_route(request="...", mode="json")
```

Output language follows the request: a Chinese request gets a Chinese answer, an English one an English one, and mixed requests count as Chinese. Set `locale` to force a language.

Plain conversation and single-step work you already know how to do (read a file, run a command, edit code) do **not** need a call — the injected prompt hint says exactly that.

## Output modes

| Mode | Content | Cost (approx.) |
|---|---|---|
| `brief` (or `brief=true`) | One line: domains with confidence, then skill and tool names | 80–150 tokens |
| `route` (default) | Verdict, matched keywords, skills, tools, first step, notes for secondary domains, what to skip | 300–600 tokens |
| `inventory` | Installed plugins, skill catalogue with its source breakdown, tools visible to the session | depends on environment |
| `json` | The same routing result as machine-readable JSON, for scripts | depends on output |

`inventory` is also the diagnostic mode: if routing looks wrong, it shows exactly which skills the plugin can see and where they came from.

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

## Adding your own capability domain

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

A custom `id` that already exists (`finance` does not; `data` does) keeps the built-in keywords and merges yours on top; adding `disabled: true` to such an entry removes that built-in domain.

## Built-in capability domains (17)

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

## Compatibility and requirements

- A DSH host that provides the `tools` and `systemPrompt` services.
- The `skills` service is used when available (`ctx.get('skills')`, scoped to the calling agent); without it the plugin falls back to scanning `SKILL.md` files.
- Node.js **≥ 22.12**; ESM only; peer dependencies on `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`.
- No network access, no API key, no model call: routing is deterministic keyword scoring.

## Security and privacy

- **Read-only.** It writes no files, sends no network requests, and changes no configuration.
- **What it reads:** the host's merged skill registry (when present), this session's visible tool schemas, and the profile `package.json` dependency names. Only in the filesystem fallback does it scan skill directories: `<root>/<skill>/SKILL.md` under the project's `.agents/skills` and `.claude/skills`, then `~/.agents/skills`, `~/.dsh/skills`, `~/.claude/skills`, `~/.codex/skills`, any other `~/.<dir>/skills`, plus `skillRoots`.
- **What it never sends:** no request text, skill names or tool names leave the process. There is no telemetry.
- **Output contains only names that already exist** on the host — it never prefixes or invents a skill id.

## Design guarantees

These are enforced by the code, not by convention:

- It **never recommends a skill that is not installed** in the current scope, or a **tool that is not visible** to the session. Candidates come from the live inventory; nothing is synthesised.
- Skill sources can be filtered with `skillSources` / `excludeSources`, so you can keep, say, only `user` skills in the ranking.
- Tool recommendations are **evidence-based**: an explicit mention in the request, a match between a token of the tool name and the request, a name token that equals the vocabulary of a matched domain, or the tool being named inside the body of a recommended skill. There is no hardcoded tool list.
- The built-in taxonomy describes **capability areas only**. You extend it through config (`domains`, `extraKeywords`, `disableDomains`) instead of patching source.
- Routing is **deterministic** and local: same request + same inventory ⇒ same ranking, every time.
- **Failure is non-fatal.** An empty `request` returns a usage message; an internal error returns `need_route failed: …`, and `mode=inventory` still works for diagnosis.

## Known limits

- **Cross-lingual matching is lexical, not semantic.** Domain vocabulary is bilingual, so a Chinese request still finds the right capability area on an English-only machine. Skill and tool *names and descriptions* are matched in their own language, though: with a corpus whose descriptions are English only, a Chinese request may return the domain and no skill picks. It never invents a name; adding Chinese descriptions (or Chinese keywords) to your skills fixes the recall.
- **It can be wrong.** Domains are keyword-driven; a request worded unusually may land in a neighbouring domain. That is why `firstAction` advice is phrased as advice and not as a gate.
- **It routes; it does not act.** It never loads a skill, calls a tool, or re-ranks by model preference. It has no memory of past calls beyond the caches.
- **Tool noise is possible.** A generic tool whose name contains a domain keyword (for example a development helper named `build_*`) can appear in an unrelated domain. Pin your preference with `excludeTools`, or narrow it with `matchTools: false`.

## Troubleshooting

| Symptom | Check |
|---|---|
| `need_route` is not in the tool list | Is `dsh-need-router` in `dsh.profile.bundles`? Did the host restart after the install? |
| It recommends skills you do not want | Filter with `skillSources` / `excludeSources`; hide tools with `excludeTools`; disable a whole domain with `disableDomains`. |
| It returns domains but no skills | Run `mode=inventory` and check the skill source breakdown. In the filesystem fallback, confirm the skill roots; with English-only descriptions, add Chinese keywords/descriptions. |
| A domain never appears | Add words through `extraKeywords`, or define a custom domain; check that a negative rule is not suppressing it. |
| Wrong language in the output | Set `locale: zh` or `locale: en` instead of `auto`. |
| An error is returned | `need_route failed: …` is non-fatal; `mode=inventory` still works and usually shows the cause. |

## FAQ

**Does it call an LLM?** No. Domain, skill and tool scoring is plain deterministic code. No model, no network, no key.

**Does it load or run the skills it recommends?** No. It only names them. The model decides whether to load one.

**Why not just let the model choose?** It can — but a 100+ skill catalogue makes that choice expensive and inconsistent. A cheap deterministic pre-pass narrows the candidate set; the model still makes the final decision.

**Will it work with my skill set?** Yes — the ranking is computed from your registry at call time. If a skill is not installed in the calling scope, it cannot be recommended.

**Does it work outside DSH?** The scoring core (`lib/text.js`, `lib/taxonomy.js`, `lib/match.js`, `lib/render.js`) is dependency-free ESM and could be wrapped by another host, but this package targets DSH services (`tools`, `systemPrompt`, optional `skills`). No other host adapter ships today.

**Why 17 domains?** They cover the broad capability areas a general agent encounters. The list is data, not code: add, extend or disable domains through config.

**Does it send my requests anywhere?** No. Nothing leaves the process; there is no telemetry.

## Development

```bash
npm test   # node --test; pure modules, no dependencies to install
```

The suite is dependency-free and covers text matching, taxonomy, scoring, rendering and the discovery fallbacks. See [CONTRIBUTING.md](CONTRIBUTING.md) for the test rules, how to add a domain, and the PR checklist.

## Project layout

```text
lib/text.js        normalisation, keyword matching, CJK n-grams, stop words, language detection
lib/taxonomy.js    built-in domains, extension signals, negative rules
lib/discover.js    live inventory: skills service, tool registry, profile plugins, filesystem fallback
lib/match.js       scoring and composition (domains → skills → tool evidence)
lib/render.js      brief / route / inventory rendering and truncation, zh + en
lib/index.js       plugin wiring: defineTool, config schema, caches, prompt hint
test/              node --test suites for every module above
```

## Roadmap

Candidate ideas, not commitments — feedback and PRs are welcome:

- Optional semantic (embedding) fallback for cross-lingual skill recall, off by default.
- More locale packs for the built-in taxonomy (the structure is already bilingual).
- Benchmarks against a few public skill catalogues, run locally.
- Richer `json` output so external routers and UIs can consume it directly.

## Contributing

Issues and pull requests are welcome. Keep the core constraints intact: no skill names, tool names or personal paths in `lib/taxonomy.js`; recommendations must stay evidence-based; tests must pass without installing anything. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 ken688. Use, modify, redistribute and sell freely; keep the copyright and licence notice.
