/**
 * Scoring engine.
 *
 * Three independent rankings are produced from one request:
 *   1. capability domains  — "what kind of work is this"
 *   2. available skills     — "which of the skills this machine actually has"
 *   3. available tools      — "which tools this session can call right now"
 *
 * The engine never invents skills or tools: callers pass the live inventory in.
 */
import {
  cjkGrams, contentWords, detectLanguage, keywordHit, keywordWeight,
  nameTokens, normalize, confidenceOf, unique
} from './text.js'
import { DOMAINS, EXTENSION_DOMAINS, NEGATIVE_RULES, fallbackLabel } from './taxonomy.js'

const clone = (value) => JSON.parse(JSON.stringify(value ?? null))

function localeText(value, lang) {
  if (value && typeof value === 'object') return value[lang] ?? value.zh ?? value.en ?? ''
  return typeof value === 'string' ? value : ''
}

/**
 * Merge the built-in taxonomy with user-provided domains and keyword extras.
 * Custom domains with an existing id override that domain's text and extend its
 * keywords; unknown ids add a new domain.
 */
export function buildCatalog(options = {}) {
  const custom = Array.isArray(options.domains) ? options.domains : []
  const extra = options.extraKeywords && typeof options.extraKeywords === 'object' ? options.extraKeywords : {}
  const disabled = new Set(Array.isArray(options.disableDomains) ? options.disableDomains : [])
  const byId = new Map()

  for (const domain of DOMAINS) byId.set(domain.id, clone(domain))

  for (const raw of custom) {
    if (!raw || typeof raw !== 'object') continue
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!id) continue
    const current = byId.get(id) ?? { id, label: fallbackLabel(id), keywords: [], hint: {}, firstAction: {} }
    const labels = raw.labels && typeof raw.labels === 'object' ? raw.labels : undefined
    const merged = {
      ...current,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : current.label,
      labels: labels ? { ...(current.labels ?? {}), ...labels } : current.labels,
      keywords: unique([...(current.keywords ?? []), ...(Array.isArray(raw.keywords) ? raw.keywords : [])]),
      extensions: unique([...(current.extensions ?? []), ...(Array.isArray(raw.extensions) ? raw.extensions : [])]),
      hint: raw.hint ? { ...(current.hint ?? {}), ...(typeof raw.hint === 'string' ? { [defaultHintLang(options)]: raw.hint } : raw.hint) } : current.hint,
      firstAction: raw.firstAction
        ? { ...(current.firstAction ?? {}), ...(typeof raw.firstAction === 'string' ? { [defaultHintLang(options)]: raw.firstAction } : raw.firstAction) }
        : current.firstAction
    }
    if (raw.disabled === true) disabled.add(id)
    byId.set(id, merged)
  }

  for (const [domainId, words] of Object.entries(extra)) {
    const domain = byId.get(domainId)
    if (!domain || !Array.isArray(words)) continue
    domain.keywords = unique([...(domain.keywords ?? []), ...words.filter((w) => typeof w === 'string')])
  }

  const extensions = { ...EXTENSION_DOMAINS }
  for (const domain of byId.values()) {
    if (Array.isArray(domain.extensions)) {
      for (const ext of domain.extensions) {
        if (typeof ext !== 'string') continue
        extensions[ext.replace(/^\./, '').toLowerCase()] = domain.id
      }
    }
  }

  const domains = [...byId.values()].filter((domain) => !disabled.has(domain.id))
  return { domains, extensions }
}

function defaultHintLang(options) {
  return options.locale === 'en' ? 'en' : 'zh'
}

/** Rank capability domains for one already-lowercased request. */
export function scoreDomains(text, catalog) {
  const extensions = catalog.extensions ?? EXTENSION_DOMAINS
  const results = []

  for (const domain of catalog.domains) {
    let score = 0
    const matched = []

    for (const keyword of domain.keywords ?? []) {
      if (!keywordHit(text, keyword)) continue
      score += keywordWeight(keyword)
      matched.push(keyword)
    }

    for (const [ext, domainId] of Object.entries(extensions)) {
      if (domainId !== domain.id) continue
      if (!text.includes(`.${ext}`)) continue
      score += 3
      matched.push(`.${ext}`)
    }

    for (const rule of NEGATIVE_RULES) {
      if (!rule.against.includes(domain.id)) continue
      if (rule.keys.some((key) => keywordHit(text, key))) score -= 3
    }

    if (score <= 0) continue
    results.push({
      id: domain.id,
      label: domain.label,
      labels: domain.labels,
      hint: domain.hint,
      firstAction: domain.firstAction,
      score: Math.round(score * 10) / 10,
      confidence: confidenceOf(score),
      matched: unique(matched).slice(0, 8)
    })
  }

  results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return results
}

/** Keywords the request actually hit, used as the bridge into skill descriptions. */
function matchedKeywords(domains, limit = 6) {
  const words = []
  for (const domain of domains.slice(0, limit)) {
    for (const keyword of domain.matched) {
      if (keyword.startsWith('.')) continue
      words.push(keyword)
    }
  }
  return unique(words)
}

/**
 * Rank installed skills using four signals: explicit name mention, name tokens,
 * domain keywords found in the skill text, and generic word overlap.
 */
export function matchSkills(text, domains, skills, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.skillLimit ?? 6) || 6, 20))
  const words = contentWords(text)
  const grams = cjkGrams(text)
  const keywords = matchedKeywords(domains)
  const results = []

  for (const skill of skills) {
    const name = normalize(skill.name ?? '')
    if (!name) continue
    const haystack = normalize([skill.name, skill.description, skill.whenToUse].filter(Boolean).join(' '))
    if (!haystack) continue

    let score = 0
    const why = []

    if (name.length >= 4 && text.includes(name)) {
      score += 8
      why.push('explicit')
    }

    const tokens = nameTokens(skill.name).filter((token) => token.length >= 3)
    let tokenScore = 0
    for (const token of tokens) {
      if (words.includes(token)) {
        tokenScore += 3
        if (!why.includes(token)) why.push(token)
      } else if (keywords.some((keyword) => keyword === token || keyword.includes(token))) {
        tokenScore += 1.5
      }
    }
    score += Math.min(tokenScore, 6)

    let keywordScore = 0
    for (const keyword of keywords) {
      if (!keywordHit(haystack, keyword)) continue
      keywordScore += 2
      if (why.length < 6 && !why.includes(keyword)) why.push(keyword)
    }
    score += Math.min(keywordScore, 8)

    let wordScore = 0
    for (const word of words) {
      if (haystack.includes(word)) wordScore += 1
    }
    score += Math.min(wordScore, 4)

    let gramScore = 0
    for (const gram of grams) {
      if (haystack.includes(gram)) gramScore += 0.6
    }
    score += Math.min(gramScore, 3)

    // A skill whose name carries a matched domain id (code-review, data-analysis,
    // web-access) is usually the most specific answer for that domain.
    if (domains.slice(0, 3).some((domain) => tokens.includes(domain.id))) {
      score += 2
      why.push('domain-name')
    }

    if (score < 3) continue
    results.push({
      name: skill.name,
      description: skill.description,
      source: skill.source ?? null,
      provider: skill.provider ?? null,
      score: Math.round(score * 10) / 10,
      why: why.slice(0, 6)
    })
  }

  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return results.slice(0, limit)
}

/**
 * Rank callable tools. Evidence comes from explicit mentions, name tokens, words
 * shared with the description, and — the strongest generic signal — the fact that
 * a recommended skill's own body names the tool.
 */
export function matchTools(text, tools, mentioned, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.toolLimit ?? 6) || 6, 20))
  const excluded = new Set(Array.isArray(options.excludeTools) ? options.excludeTools : [])
  const words = contentWords(text)
  const mentionMap = new Map()
  for (const entry of mentioned ?? []) {
    if (!entry || typeof entry.name !== 'string') continue
    const current = mentionMap.get(entry.name) ?? { weight: 0, skills: [] }
    current.weight = Math.max(current.weight, Number(entry.weight) || 0)
    if (entry.skill && !current.skills.includes(entry.skill)) current.skills.push(entry.skill)
    mentionMap.set(entry.name, current)
  }

  const results = []
  for (const tool of tools) {
    if (!tool || typeof tool.name !== 'string') continue
    if (excluded.has(tool.name)) continue
    const name = normalize(tool.name)
    const description = normalize(tool.description ?? '')
    let score = 0
    const why = []

    if (name.length >= 5 && text.includes(name)) {
      score += 6
      why.push('explicit')
    }

    let tokenScore = 0
    for (const token of nameTokens(tool.name).filter((token) => token.length >= 4)) {
      if (words.includes(token)) tokenScore += 3
    }
    score += Math.min(tokenScore, 6)
    if (tokenScore > 0) why.push('name')

    const mention = mentionMap.get(tool.name)
    if (mention) {
      score += 3 * Math.min(mention.weight, 2)
      why.push(`skill:${mention.skills[0] ?? '?'}`)
    }

    let descScore = 0
    for (const word of words) {
      if (description.includes(word)) descScore += 0.4
    }
    score += Math.min(descScore, 1.5)

    // Weak evidence alone must not produce a recommendation: a tool needs a name
    // match, an explicit mention, or a reference from a recommended skill body.
    if (score < 3) continue
    results.push({ name: tool.name, score: Math.round(score * 10) / 10, why: unique(why).slice(0, 4) })
  }

  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return results.slice(0, limit)
}

/**
 * Extract tool mentions from recommended skill bodies. This is what makes tool
 * advice evidence-based instead of a hardcoded name list.
 *
 * @param {Array<{name: string, score: number}>} skills ranked skills
 * @param {Map<string,string>} contents skill name -> SKILL.md body
 * @param {Array<{name: string}>} tools visible tools
 */
export function collectToolMentions(skills, contents, tools) {
  // Only distinctive tool names count as evidence. A tool literally called
  // `skill` or `present` would otherwise "appear" in every skill body.
  const names = tools
    .map((tool) => tool?.name)
    .filter((name) => typeof name === 'string' && name.length >= 4)
    .filter((name) => name.includes('_') || name.includes('-') || name.length >= 10)
  const mentions = []
  for (const skill of skills) {
    const body = contents instanceof Map ? contents.get(skill.name) : contents?.[skill.name]
    if (typeof body !== 'string' || body.length === 0) continue
    const lower = body.toLowerCase()
    for (const toolName of names) {
      if (!lower.includes(toolName.toLowerCase())) continue
      mentions.push({ name: toolName, skill: skill.name, weight: Math.min(skill.score / 5, 2) })
    }
  }
  return mentions
}

/** Compose the three rankings into one routing result. */
export function routeRequest({ request, catalog, skills, tools, mentioned, config = {} }) {
  const text = normalize(request)
  const requested = String(config.locale ?? 'auto')
  const lang = requested === 'zh' || requested === 'en' ? requested : detectLanguage(request)
  const domains = scoreDomains(text, catalog)
  const matchedSkills = config.matchSkills === false ? [] : matchSkills(text, domains, skills, config)
  const matchedTools = config.matchTools === false ? [] : matchTools(text, tools, mentioned, config)

  return {
    lang,
    request: String(request ?? ''),
    domains,
    skills: matchedSkills,
    tools: matchedTools,
    confidence: domains.length > 0 ? domains[0].confidence : 'none',
    inventory: { skills: skills.length, tools: tools.length }
  }
}

export { localeText }
