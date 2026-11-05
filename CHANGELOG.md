# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-11-05

Complete generalization pass: the router no longer knows anything about the
author's machine.

### Changed

- **Skills are discovered live** from the host skill registry (`ctx.get('skills')`,
  scoped to the calling agent) instead of a hardcoded list. Filesystem scanning of
  `<root>/<skill>/SKILL.md` remains only as a fallback for hosts without a skill
  registry, and it now discovers common agent-skill roots automatically.
- **Tools are discovered live** from `ctx.get('tools').schemas(scope)`. Recommendations
  are evidence-based: explicit mention, tool-name token match, or the tool being named
  in a recommended skill's body. There is no hardcoded tool list any more.
- **Built-in capability taxonomy rewritten** as capability areas only — 17 domains,
  bilingual labels/keywords/hints, file-extension signals and negative rules — with no
  skill names, no plugin names and no personal paths in the source.
- **Configuration is the extension mechanism**: `domains`, `extraKeywords`,
  `disableDomains`, `skillSources` / `excludeSources`, `skillRoots`, `projectDir` and
  cache TTLs. Custom domains can add new areas or extend built-ins.
- **Output localization**: Chinese or English is selected from the request (or forced
  with `locale`), including the injected system-prompt hint.
- Capability domains are now `documents`, `data`, `code`, `web`, `image`, `media`,
  `creative`, `academic`, `notes`, `communication`, `cli`, `desktop`, `memory`,
  `design`, `engineering` (CAD), `electronics` (EDA) and `system`.
- Skill and tool scoring retuned so that common English/Chinese function words and
  generic descriptions cannot produce recommendations on their own.
- Inventory mode reports skill sources (registry vs filesystem fallback), source
  distribution, and truncates very long lists.
- Package metadata: version 0.2.0, test script `node --test`, explicit `files` list,
  bilingual description and updated keywords.

### Added

- `mode=json` output for scripts and tests.
- Tool-evidence pass that reads the bodies of the top recommended skills (cached,
  bounded, 2 s timeout) to find tools the skill actually tells you to use; ordinary
  words such as `memory` only count when the body references them as a code span.
- Tool-name ↔ domain-vocabulary bridge: a whole token of a tool name that equals a
  keyword of a matched domain (e.g. `memory` ↔ the memory domain) is evidence, which
  makes Chinese requests recommend generic tools on an English-described host.
- Explicit "known limits" note in the docs: matching is lexical, so a Chinese request
  against an English-only skill corpus returns domain guidance but no skill picks.
- Dependency-free test suite (`node --test`) covering text matching, taxonomy,
  scoring, rendering and discovery fallbacks.
- `README.md` (English), `README.zh-CN.md` (Chinese), `CONTRIBUTING.md`.

### Removed

- Hardcoded domain → skill lists and domain → tool lists (returned non-existent names
  on machines without those exact skills).
- The Office-family special case that narrowed skills by hardcoded names; the same
  effect now comes from description matching against the installed skill set.

### Fixed

- English plural forms now match singular keywords (`tests` ↔ `test`) without turning
  short keywords into loose prefixes.
- Duplicate and cross-domain noise in skill/tool rankings.
- Profile detection no longer assumes a profile named `desktop`; it follows
  `DSH_PROFILE_DIR` / `DSH_PROFILE` and otherwise scans the real profile directory.

## [0.1.0] — 2026-10-30

Initial release.

- `need_route` tool with `brief`, `route` and `inventory` outputs.
- 16 hardcoded capability domains for the author's personal skill set.
- System-prompt hint for cross-domain requests.
- MIT license, DSH bundle patch, icon.
