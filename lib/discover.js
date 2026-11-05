/**
 * Live inventory discovery.
 *
 * Preferred source is the host's own registries — `ctx.get('skills')` for skills
 * and `ctx.get('tools')` for tools — because they already merged every provider
 * (bundled, user, project, runtime). Filesystem scanning is only a fallback for
 * hosts without a skill registry, and it looks for the layout shared by most
 * agent skill ecosystems (`<root>/<skill>/SKILL.md`).
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const SKILL_FILE = 'SKILL.md'

function safeAsync(fn, fallback) {
  return fn().catch(() => fallback)
}

/** Home directories that commonly host an `skills/` folder. */
export async function discoverHomeSkillRoots(home = homedir()) {
  const roots = []
  const entries = await safeAsync(() => readdir(home, { withFileTypes: true }), [])
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('.') || entry.name.length < 2) continue
    const candidate = path.join(home, entry.name, 'skills')
    const info = await safeAsync(() => stat(candidate), null)
    if (info?.isDirectory()) roots.push(candidate)
  }
  return roots.sort()
}

/** Roots scanned when the host has no skill service. Project-local first. */
export async function defaultSkillRoots(cwd = process.cwd(), extraRoots = []) {
  const home = homedir()
  const roots = [
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, '.claude', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.dsh', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.codex', 'skills'),
    ...(await discoverHomeSkillRoots(home)),
    ...extraRoots
  ]
  return [...new Set(roots.map((root) => path.resolve(root)))]
}

/** Parse the YAML frontmatter fields the router needs, without a YAML dependency. */
export function parseSkillDoc(text) {
  const source = String(text ?? '')
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(source)
  const result = { name: '', description: '', whenToUse: '' }
  if (!match) return result
  const lines = match[1].split(/\r?\n/)
  const fields = {}
  let current = null
  for (const line of lines) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (pair) {
      current = pair[1]
      fields[current] = pair[2]
      continue
    }
    if (current && /^\s+\S/.test(line)) fields[current] += ` ${line.trim()}`
  }

  const clean = (value) => {
    let text = String(value ?? '').trim()
    if (!text) return ''
    // YAML block scalar indicators (`>`, `|`, `>-`, `|2`) may share the line with
    // the first content line: strip the indicator, keep the content.
    text = text.replace(/^[|>][+-]?[0-9]?\s*/, '')
    if (!text) return ''
    const quote = text[0]
    if ((quote === '"' || quote === "'") && text.endsWith(quote)) {
      text = text.slice(1, -1)
    }
    return text.replace(/\s+/g, ' ').trim()
  }

  result.name = clean(fields.name)
  result.description = clean(fields.description)
  result.whenToUse = clean(fields.whenToUse ?? fields['when-to-use'] ?? fields.when_to_use)
  return result
}

/** Fallback: scan `<root>/<skill>/SKILL.md` folders. */
export async function scanSkillRoots(roots, options = {}) {
  const limit = Math.max(1, Number(options.limit ?? 500) || 500)
  const skills = []
  const seen = new Set()
  for (const root of roots) {
    const entries = await safeAsync(() => readdir(root, { withFileTypes: true }), [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      if (skills.length >= limit) return skills
      const dir = path.join(root, entry.name)
      const doc = await safeAsync(() => readFile(path.join(dir, SKILL_FILE), 'utf8'), null)
      if (!doc) continue
      const meta = parseSkillDoc(doc)
      const name = meta.name || entry.name
      if (seen.has(name)) continue
      seen.add(name)
      skills.push({
        name,
        description: meta.description,
        whenToUse: meta.whenToUse || undefined,
        source: 'filesystem',
        provider: 'dsh-need-router:fallback',
        path: dir
      })
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/** Skills visible to a scope, using the host registry when present. */
export async function listSkills(ctx, options = {}) {
  const service = typeof ctx?.get === 'function' ? ctx.get('skills') : undefined
  if (service && typeof service.list === 'function') {
    const listed = await safeAsync(() => service.list({ scope: options.scope, cwd: options.cwd }), null)
      ?? await safeAsync(() => service.list({}), null)
    if (Array.isArray(listed)) {
      return {
        via: 'service',
        skills: listed
          .filter((skill) => skill && typeof skill.name === 'string')
          .map((skill) => ({
            name: skill.name,
            description: String(skill.description ?? ''),
            whenToUse: skill.whenToUse,
            source: skill.source ?? 'unknown',
            provider: skill.provider,
            path: skill.path
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      }
    }
  }
  const roots = await defaultSkillRoots(options.cwd, options.extraRoots ?? [])
  return { via: 'filesystem', skills: await scanSkillRoots(roots, { limit: options.limit }) }
}

/** Tools visible to a scope. */
export function listTools(ctx, scope) {
  const service = typeof ctx?.get === 'function' ? ctx.get('tools') : undefined
  if (!service || typeof service.schemas !== 'function') return []
  const trySchemas = (value) => {
    try {
      const schemas = value === undefined ? service.schemas() : service.schemas(value)
      return Array.isArray(schemas) ? schemas : null
    } catch {
      return null
    }
  }
  const schemas = (scope !== undefined ? trySchemas(scope) : null) ?? trySchemas(undefined) ?? []
  return schemas
    .filter((schema) => schema && typeof schema.name === 'string')
    .map((schema) => ({ name: schema.name, description: String(schema.description ?? '') }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Candidate profile directories, most specific first. */
export async function profileDirCandidates(env = process.env, home = homedir()) {
  const dshHome = env.DSH_HOME || path.join(home, '.dsh')
  const root = path.join(dshHome, 'profiles')
  const candidates = []
  if (env.DSH_PROFILE_DIR) candidates.push(env.DSH_PROFILE_DIR)
  const entries = await safeAsync(() => readdir(root, { withFileTypes: true }), [])
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  if (env.DSH_PROFILE) candidates.push(path.join(root, env.DSH_PROFILE))
  for (const name of names) candidates.push(path.join(root, name))
  return [...new Set(candidates)]
}

/** Installed plugin names from the profile package.json. */
export async function listPlugins(options = {}) {
  const candidates = options.profileDirs ?? await profileDirCandidates()
  for (const dir of candidates) {
    const raw = await safeAsync(() => readFile(path.join(dir, 'package.json'), 'utf8'), null)
    if (!raw) continue
    try {
      const pkg = JSON.parse(raw)
      const names = Object.keys(pkg?.dependencies ?? {}).sort()
      if (names.length > 0) return { dir, names }
    } catch {
      // ignore malformed profile package.json and try the next candidate
    }
  }
  return { dir: null, names: [] }
}

/** One inventory snapshot: skills, tools, plugins and where they came from. */
export async function collectInventory(ctx, options = {}) {
  const [skillsResult, plugins] = await Promise.all([
    listSkills(ctx, options),
    listPlugins(options)
  ])
  const tools = listTools(ctx, options.scope)
  const bySource = {}
  for (const skill of skillsResult.skills) {
    const key = skill.source ?? 'unknown'
    bySource[key] = (bySource[key] ?? 0) + 1
  }
  return {
    skills: skillsResult.skills,
    skillsVia: skillsResult.via,
    skillSources: bySource,
    tools,
    plugins
  }
}

/** Load one skill body (used to find tool mentions). */
export async function loadSkillContent(ctx, name, options = {}) {
  const service = typeof ctx?.get === 'function' ? ctx.get('skills') : undefined
  if (!service || typeof service.get !== 'function') return ''
  const skill = await safeAsync(() => service.get(name, { scope: options.scope }), null)
  return typeof skill?.content === 'string' ? skill.content : ''
}
