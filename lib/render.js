/**
 * Output rendering. Everything is localized from the routing result; the tool
 * never renders hardcoded skill names, so output stays truthful on any machine.
 */
import { localeText } from './match.js'

const CONFIDENCE = {
  zh: { strong: '强', medium: '中', weak: '弱', none: '无' },
  en: { strong: 'strong', medium: 'medium', weak: 'weak', none: 'none' }
}

const LABELS = {
  zh: {
    briefPrefix: 'brief: ',
    noDomain: '无专业域 → 直接做',
    noneHint: '本机没有匹配到已安装技能，按通用流程做',
    judge: '判定',
    hit: '命中',
    skills: '技能',
    tools: '工具',
    firstAction: '先做',
    skip: '本次可跳过',
    weak: '信心偏弱：先直接试一次通用工具，别急着加载技能。',
    note: '注意',
    noTools: '未匹配专用工具，按技能里给出的命令执行',
    noSkills: '（未匹配到已安装技能，可用 inventory 看本机到底有什么）',
    fallbackAdvice: '判定：没有命中任何专业能力域 —— 这更像一次通用对话或直接的文件 / 命令操作。',
    fallbackNext: '建议：直接用通用工具（读文件 / 跑命令 / 搜网页），不必加载专业技能。',
    installed: '已安装',
    visible: '可见',
    plugins: '插件（已装）',
    skillsCatalog: '技能目录',
    viaService: '服务',
    viaFs: '文件扫描',
    toolsVisible: '本会话可见工具',
    domains: '能力域',
    none: '（无）',
    sourceTag: { bundled: '内置', runtime: '运行时', project: '项目', custom: '自定义', user: '用户' }
  },
  en: {
    briefPrefix: 'brief: ',
    noDomain: 'no specialist domain -> just do it',
    noneHint: 'no installed skill matched; use a generic workflow',
    judge: 'verdict',
    hit: 'matched',
    skills: 'skills',
    tools: 'tools',
    firstAction: 'first step',
    skip: 'skip this time',
    weak: 'Low confidence: try a generic tool once before loading a skill.',
    note: 'note',
    noTools: 'no dedicated tool matched; follow the commands in the skill',
    noSkills: '(no installed skill matched — use inventory to see what this machine has)',
    fallbackAdvice: 'Verdict: no specialist capability domain matched — this looks like ordinary conversation or a direct file/command task.',
    fallbackNext: 'Suggestion: use generic tools (read files / run commands / search the web); no specialist skill is needed.',
    installed: 'installed',
    visible: 'visible',
    plugins: 'plugins',
    skillsCatalog: 'skills',
    viaService: 'registry',
    viaFs: 'filesystem scan',
    toolsVisible: 'tools visible to this session',
    domains: 'domains',
    none: '(none)',
    sourceTag: { bundled: 'bundled', runtime: 'runtime', project: 'project', custom: 'custom', user: 'user' }
  }
}

export function stringsFor(lang) {
  return LABELS[lang === 'en' ? 'en' : 'zh']
}

export function confidenceLabel(confidence, lang) {
  return CONFIDENCE[lang === 'en' ? 'en' : 'zh'][confidence] ?? confidence
}

/** Map a skill source string to a short tag: folded project-scope in, keeps provider id otherwise. */
export function sourceTag(source, lang) {
  const table = stringsFor(lang).sourceTag
  if (!source) return table.custom
  if (source === 'bundled') return table.bundled
  if (source === 'runtime') return table.runtime
  if (source.startsWith('project')) return table.project
  if (source.startsWith('custom')) return table.custom
  if (source.startsWith('user')) return table.user
  return source
}

function domainLabel(domain, lang) {
  // `label` is the default (English) label; `labels` only carries translations.
  // Never fall back from a missing English translation to a Chinese one.
  const localized = domain.labels && typeof domain.labels === 'object' ? domain.labels[lang] : undefined
  return localized || domain.label || localeText(domain.labels, lang)
}

function domainText(domain, lang) {
  return {
    label: domainLabel(domain, lang),
    hint: localeText(domain.hint, lang),
    firstAction: localeText(domain.firstAction, lang)
  }
}

function joinDomains(domains, lang) {
  return domains
    .map((domain) => `${domainText(domain, lang).label}(${confidenceLabel(domain.confidence, lang)})`)
    .join(lang === 'en' ? ' + ' : '+')
}

function joinNames(items, lang) {
  return items.join(lang === 'en' ? ', ' : '、')
}

function skillLine(skills, lang, options) {
  if (skills.length === 0) return null
  const tagSkill = (skill) => (options.showSkillSource === false
    ? skill.name
    : `${skill.name}(${sourceTag(skill.source, lang)})`)
  return skills.map(tagSkill).join(lang === 'en' ? ', ' : '、')
}

/** brief: one line, ~80–150 tokens. */
export function renderBrief(route, options = {}) {
  const lang = route.lang === 'en' ? 'en' : 'zh'
  const t = stringsFor(lang)
  const limit = Math.max(1, Number(options.maxDomains ?? 3) || 3)
  if (route.domains.length === 0) {
    return `${t.briefPrefix}${t.noDomain} | ${t.skills} ${route.skills.slice(0, 3).map((s) => s.name).join(',') || '-'}`
  }
  const shown = route.domains.slice(0, limit)
  const skills = route.skills.slice(0, 6).map((skill) => skill.name)
  const tools = route.tools.slice(0, 6).map((tool) => tool.name)
  return [
    `${t.briefPrefix}${joinDomains(shown, lang)}`,
    `| ${t.skills} ${skills.join(',') || '-'}`,
    `| ${t.tools} ${tools.join(',') || '-'}`
  ].join(' ')
}

/** route: the default output. */
export function renderRoute(route, options = {}) {
  const lang = route.lang === 'en' ? 'en' : 'zh'
  const t = stringsFor(lang)
  const limit = Math.max(1, Number(options.maxDomains ?? 3) || 3)
  const sep = lang === 'en' ? ', ' : '、'

  if (route.domains.length === 0) {
    const lines = [t.fallbackAdvice, t.fallbackNext]
    if (route.skills.length > 0) lines.push(`${t.skills}: ${skillLine(route.skills, lang, options)}`)
    if (route.tools.length > 0) lines.push(`${t.tools}: ${route.tools.map((tool) => tool.name).join(sep)}`)
    lines.push(`(${t.installed} ${route.inventory.skills} ${t.skillsCatalog} / ${route.inventory.tools} ${t.toolsVisible})`)
    return lines.join('\n')
  }

  const shown = route.domains.slice(0, limit)
  const rest = route.domains.slice(limit)
  const top = domainText(shown[0], lang)
  const matched = [...new Set(shown.flatMap((domain) => domain.matched))].slice(0, 10)
  const skillText = skillLine(route.skills, lang, options)
  const toolText = route.tools.map((tool) => tool.name).join(sep)

  const lines = [
    `${t.judge}: ${joinDomains(shown, lang)}`,
    `${t.hit}: ${matched.join(sep)}`,
    `${t.skills}: ${skillText ?? t.noSkills}`,
    `${t.tools}: ${toolText || t.noTools}`
  ]
  if (top.firstAction) lines.push(`${t.firstAction}: ${top.firstAction}`)

  for (const domain of shown.slice(1)) {
    const text = domainText(domain, lang)
    if (text.hint) lines.push(`· ${text.label} ${t.note}: ${text.hint}`)
  }
  if (rest.length > 0) lines.push(`${t.skip}: ${rest.map((domain) => domainLabel(domain, lang)).join(sep)}`)
  if (route.confidence === 'weak') lines.push(t.weak)
  return lines.join('\n')
}

/** inventory: environment inspection, kept to one screen. */
export function renderInventory(inventory, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'zh'
  const t = stringsFor(lang)
  const sep = lang === 'en' ? ', ' : '、'
  const skillLimit = Math.max(1, Number(options.inventorySkillLimit ?? 80) || 80)

  const plugins = inventory.plugins.names.length > 0
    ? inventory.plugins.names.join(sep)
    : t.none
  const sources = Object.entries(inventory.skillSources ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source} ${count}`)
    .join(sep)
  const names = inventory.skills.slice(0, skillLimit).map((skill) => skill.name)
  const more = inventory.skills.length > skillLimit ? ` … +${inventory.skills.length - skillLimit}` : ''
  const toolLimit = Math.max(1, Number(options.inventoryToolLimit ?? 60) || 60)
  const toolNames = inventory.tools.map((tool) => tool.name)
  const toolMore = toolNames.length > toolLimit ? ` … +${toolNames.length - toolLimit}` : ''
  const via = inventory.skillsVia === 'service' ? t.viaService : t.viaFs

  return [
    `${t.plugins}: ${inventory.plugins.names.length} — ${plugins}`,
    `${t.skillsCatalog}: ${inventory.skills.length} (${via}) — ${names.join(sep) || t.none}${more}`,
    ...(sources ? [`· ${sources}`] : []),
    `${t.toolsVisible}: ${inventory.tools.length} — ${toolNames.slice(0, toolLimit).join(sep) || t.none}${toolMore}`,
    ...(Array.isArray(options.domainIds) && options.domainIds.length > 0
      ? [`${t.domains}: ${options.domainIds.join(sep)}`]
      : [])
  ].join('\n')
}
