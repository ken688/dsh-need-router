# Contributing to dsh-need-router

Thanks for taking a look. This is a small, dependency-free plugin; the bar for a change is: correct on a machine that is not yours, cheap in tokens, and covered by a test.

## Requirements

- **Node.js ≥ 22.12** (the test runner is the built-in `node --test`).
- No package manager step: there are **no runtime or dev dependencies**, so `npm install` is not needed to run the tests.
- A DSH host only if you want to exercise `lib/index.js` end to end — the test suite deliberately does not need one.

## Get the code and run the tests

```bash
git clone https://github.com/ken688/dsh-need-router.git
cd dsh-need-router
npm test                 # same as: node --test
```

If `https://` to GitHub is blocked on your network, clone over SSH instead (`git@github.com:ken688/dsh-need-router.git`) — nothing else changes.

Single file, or a single test by name:

```bash
node --test test/match.test.mjs
node --test --test-name-pattern="negative signals" test/match.test.mjs
```

The whole suite runs in well under a second, so there is no reason not to run it. Any change that alters routing behaviour should come with a test that fails before it and passes after.

## Project layout

| File | Responsibility |
|---|---|
| `lib/text.js` | normalisation, keyword hit rules, CJK n-grams, stop words, language detection |
| `lib/taxonomy.js` | built-in capability domains, file-extension signals, negative rules |
| `lib/discover.js` | live inventory: skills service, tool registry, profile plugins, filesystem fallback |
| `lib/match.js` | catalog building, scoring, composition of the routing result |
| `lib/render.js` | brief / route / inventory rendering and truncation, zh + en |
| `lib/index.js` | plugin wiring: `defineTool`, config schema, caches, system-prompt hint |

`lib/index.js` is the only file that needs a host (`ctx`, `defineTool`, `systemPrompt`). The other five are pure and are the ones tests import.

## Test rules

- Import only the pure modules (`text`, `taxonomy`, `discover`, `match`, `render`). Never import `lib/index.js` in a test — it needs a host context.
- To test discovery, pass a fake context, exactly as `test/discover.test.mjs` does:

```js
const fakeCtx = {
  get(name) {
    if (name === 'skills') return { list: async () => [{ name: 'alpha', description: 'first', source: 'user' }] }
    if (name === 'tools') return { schemas: () => [{ name: 'a_tool', description: 'a' }] }
    return undefined
  }
}
```

- No network, no reliance on the developer's home directory, no fixed profile names. When a test must touch the filesystem, use `mkdtemp` under `os.tmpdir()` and clean up in `finally` (see the existing discovery tests).
- Assert on behaviour, not on exact prose, unless the prose is the contract (for example "brief is one line").
- Route the same request through both Chinese and English when you change matching or rendering.

## Adding a capability domain

**Prefer config over source.** If the area matters to you but is not universal — finance, legal, a house workflow — configure it in your profile instead of editing `lib/taxonomy.js`:

```yaml
- id: need-router
  name: dsh-need-router
  config:
    domains:
      - id: finance
        label: Finance
        keywords: [invoice, reimbursement, ledger, reconciliation, variance]
        hint: Confirm the period and the metric definition before touching numbers.
        firstAction: Get the source documents and the accounting period first, then decide whether to load a skill.
        extensions: [ledger]
    extraKeywords:
      data: ["retention rate"]
```

A new `id` adds a domain; an existing `id` merges into the built-in one (keywords are appended, `label` / `hint` / `firstAction` override). `disableDomains` or a per-entry `disabled: true` removes one.

Touch `lib/taxonomy.js` only when the capability area is universal and worded as a **capability**, never as a product or a skill name. A built-in entry must satisfy the contract that `test/taxonomy.test.mjs` enforces:

- `id` is kebab-case and unique (enforced by the test);
- `label` is single-language English and `labels` carries the localized display name(s) (convention, so both READMEs can render the domain);
- `hint` and `firstAction` carry **both** `zh` and `en` (enforced);
- `keywords` are a non-empty vocabulary for the area, in both languages where both are natural (non-empty is enforced, bilingual coverage is convention);
- no `skills` field and no skill or tool names, no personal paths (enforced for `skills`).

Then add the id to the table in `README.md` and `README.zh-CN.md`.

## Overriding built-ins without touching source

| Goal | Setting |
|---|---|
| Add trigger words to a domain | `extraKeywords: { data: ["retention rate"] }` |
| Replace a domain's advice | `domains: [{ id: "data", hint: "…", firstAction: "…" }]` |
| Add file-extension signals | `domains: [{ id: "finance", extensions: ["ledger"] }]` |
| Turn a domain off | `disableDomains: ["desktop"]` |
| Keep only certain skill sources | `skillSources: ["user"]` / `excludeSources: ["project"]` |
| Hide tools from recommendations | `excludeTools: ["need_route", "ops_bash"]` |
| Support a host without a skill registry | `skillRoots: ["/path/to/skills"]` |

## Changing scoring

Scoring lives in `lib/match.js`; the weights are documented in `README.md` and must stay in sync with the code.

- Keep every contribution **capped** (a long description must not win on volume) and **deterministic** (no randomness, no time, no network).
- Do not lower an inclusion threshold to make one example route correctly — thresholds are the guard against recommending noise. Fix the signal, not the gate.
- Prefer evidence that already exists (explicit mention, name tokens, the skill's own body) over new dictionaries.
- When you change behaviour, update the weight tables in `README.md` / `README.zh-CN.md` and add an entry to `CHANGELOG.md`.

You can check a scoring change without a host:

```bash
node --input-type=module -e "
import { buildCatalog, routeRequest } from './lib/match.js'
import { renderBrief } from './lib/render.js'
const catalog = buildCatalog({})
const skills = [{ name: 'excel-tools', description: 'Excel workbooks, formulas and pivot tables' }]
const route = routeRequest({ request: 'pivot table in this workbook', catalog, skills, tools: [], mentioned: [], config: {} })
console.log(renderBrief(route, { maxDomains: 3 }))
"
```

## Code style

There is no linter or formatter configured; match the surrounding code.

- ESM only (`import` / `export`), no CommonJS, no build step.
- **Zero dependencies.** Use `node:` built-ins (`node:fs/promises`, `node:path`, `node:os`); do not add a YAML or NLP library — the frontmatter parser and the CJK handling are deliberately small.
- Two-space indentation, single quotes, **no semicolons**.
- JSDoc comments explain *why* a rule exists (why `go` must not match `good`, why a tool needs distinctive naming); they are not a restatement of the code.
- Keep I/O out of `match.js` / `render.js` — they take data in and return data out.
- Every user-visible string belongs in `LABELS` in `lib/render.js`, with both `zh` and `en`. Do not concatenate translated fragments; add a whole label.
- Never hardcode a skill name, a tool name, a user path, or a machine assumption in `lib/`. Anything recommended must come from the live inventory.
- Keep output small: `brief` stays a single line, `route` gains no new blocks by default, and `inventory` stays on one screen.

## Pull request checklist

- [ ] `npm test` passes.
- [ ] New behaviour has a test; changed behaviour has an updated test.
- [ ] No new dependency, and no `npm install` needed to run the suite.
- [ ] No skill names, tool names, personal paths or host-specific values added to `lib/`.
- [ ] Built-in taxonomy entries remain capability areas, with bilingual `hint` + `firstAction`.
- [ ] README weight and config tables still match the code; `CHANGELOG.md` has an entry.
- [ ] Token cost considered: did the change make `brief` longer or read more files per call?
- [ ] The PR explains the request that routed wrongly and why the change fixes the general case, not just that string.

## Releases

Versioning is SemVer. To cut a release: bump `version` in `package.json`, add the dated section to `CHANGELOG.md`, commit, and tag `vX.Y.Z`.

There is no npm publishing and no CI pipeline — the package is consumed as a git dependency (`github:ken688/dsh-need-router`) or a local `link:`, and `npm test` on a contributor's machine is the gate.
