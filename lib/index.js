/**
 * dsh-need-router — capability router for DeepSeek Harness.
 *
 * Reads one request and answers three questions, cheaply:
 *   - which capability domains does it touch?
 *   - which of the skills installed on THIS machine can serve it?
 *   - which tools visible in THIS session are actually useful for it?
 *
 * Everything it recommends is read from the live host registry, so the same
 * package behaves correctly on a machine with a completely different skill set.
 * Users extend it through config (`domains`, `extraKeywords`, `skillRoots`)
 * instead of patching the source.
 *
 * Output tiers, cheapest first:
 *   brief     one line (~80–150 tokens): domains + skill names + tool names
 *   route     default: what was matched, what to do first, what to skip
 *   inventory full environment listing for debugging
 *   json      machine-readable routing result for scripts
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

import { collectInventory, loadSkillContent } from './discover.js'
import {
  buildCatalog, collectToolMentions, domainKeywordPool, matchTools, routeRequest
} from './match.js'
import { normalize } from './text.js'
import { renderBrief, renderInventory, renderRoute } from './render.js'

const name = 'dsh-need-router'
const inject = ['tools', 'systemPrompt']

const MAX_EVIDENCE_SKILLS = 4
const CONTENT_TIMEOUT_MS = 2000

/**
 * Applied defaults. The schema below documents these to the host UI, but a
 * partially resolved config (or a direct apply in a test) must still behave.
 */
const DEFAULTS = {
  maxDomains: 3,
  injectPrompt: true,
  promptOrder: 30,
  locale: 'auto',
  matchSkills: true,
  matchTools: true,
  showSkillSource: true,
  skillLimit: 6,
  toolLimit: 6,
  inventorySkillLimit: 80,
  skillSources: [],
  excludeSources: [],
  excludeTools: ['need_route'],
  skillRoots: [],
  projectDir: '',
  skillScanLimit: 500,
  domains: [],
  extraKeywords: {},
  disableDomains: [],
  cacheTtlMs: 5000,
  contentTtlMs: 300000,
  routeCacheTtlMs: 300000
}

function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(Math.round(number), max))
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(''), ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function matchesSourceFilter(skill, config) {
  const include = Array.isArray(config.skillSources) ? config.skillSources.filter(Boolean) : []
  const exclude = Array.isArray(config.excludeSources) ? config.excludeSources.filter(Boolean) : []
  const source = String(skill.source ?? '')
  if (exclude.some((pattern) => source.startsWith(pattern))) return false
  if (include.length > 0 && !include.some((pattern) => source.startsWith(pattern))) return false
  return true
}

/** Per-apply runtime: caches are dropped together with the plugin fiber. */
function createRuntime(ctx, config) {
  const inventoryCache = new Map()
  const contentCache = new Map()
  const routeCache = new Map()

  const catalog = buildCatalog(config)

  async function inventoryFor(scope) {
    const key = scope?.id ?? 'global'
    const cached = inventoryCache.get(key)
    if (cached && Date.now() - cached.at < config.cacheTtlMs) return cached.value
    const raw = await collectInventory(ctx, {
      scope,
      cwd: config.projectDir || undefined,
      extraRoots: Array.isArray(config.skillRoots) ? config.skillRoots : [],
      limit: config.skillScanLimit
    })
    const value = { ...raw, skills: raw.skills.filter((skill) => matchesSourceFilter(skill, config)) }
    inventoryCache.set(key, { at: Date.now(), value })
    return value
  }

  async function contentsFor(skills, scope) {
    const picked = skills.slice(0, MAX_EVIDENCE_SKILLS)
    const map = new Map()
    await Promise.all(picked.map(async (skill) => {
      const key = `${scope?.id ?? 'global'}:${skill.name}`
      const cached = contentCache.get(key)
      if (cached && Date.now() - cached.at < config.contentTtlMs) {
        map.set(skill.name, cached.text)
        return
      }
      const text = await withTimeout(loadSkillContent(ctx, skill.name, { scope }), CONTENT_TIMEOUT_MS)
      if (typeof text === 'string' && text.length > 0) {
        contentCache.set(key, { at: Date.now(), text })
        map.set(skill.name, text)
      }
    }))
    return map
  }

  async function routeFor(request, scope, options) {
    const inventory = await inventoryFor(scope)
    const base = routeRequest({
      request,
      catalog,
      skills: inventory.skills,
      tools: inventory.tools,
      mentioned: [],
      config
    })

    if (config.matchTools !== false && base.skills.length > 0) {
      const contents = await contentsFor(base.skills, scope)
      const mentioned = collectToolMentions(base.skills, contents, inventory.tools)
      if (mentioned.length > 0) {
        base.tools = matchTools(normalize(request), inventory.tools, mentioned, {
          ...config,
          domainKeywords: domainKeywordPool(base.domains)
        })
      }
    }

    base.maxDomains = options.maxDomains
    return { route: base, inventory }
  }

  return { catalog, inventoryFor, routeFor, routeCache, contentCache, inventoryCache }
}

function jsonResult(route, inventory, config) {
  return JSON.stringify({
    lang: route.lang,
    confidence: route.confidence,
    domains: route.domains.map((domain) => ({
      id: domain.id,
      label: domain.label,
      score: domain.score,
      confidence: domain.confidence,
      matched: domain.matched
    })),
    skills: route.skills.map((skill) => ({
      name: skill.name,
      score: skill.score,
      source: skill.source,
      why: skill.why
    })),
    tools: route.tools.map((tool) => ({ name: tool.name, score: tool.score, why: tool.why })),
    inventory: {
      skills: inventory.skills.length,
      skillsVia: inventory.skillsVia,
      skillSources: inventory.skillSources,
      tools: inventory.tools.length,
      plugins: inventory.plugins.names.length
    },
    config: {
      locale: config.locale,
      matchSkills: config.matchSkills,
      matchTools: config.matchTools,
      maxDomains: config.maxDomains
    }
  })
}

function needRouteTool(runtime, config) {
  return defineTool({
    name: 'need_route',
    description: [
      'Capability router: map one user request to capability domains, the skills actually installed on this machine, and the tools visible in this session; also states the first step and what to skip.',
      'Use it when a request crosses domains or you are unsure which skill/tool to use; skip it for plain conversation.',
      'brief=true returns one line; mode=inventory lists the live environment; mode=json returns machine-readable output.',
      '需求判断器：把一条请求映射到能力域、本机已安装技能与本会话可见工具，并给出第一步与可跳过项；跨领域或不确定时用，brief=true 只回一行，mode=inventory 查看本机能力。'
    ].join(' '),
    parameters: {
      request: {
        type: 'string',
        required: true,
        description: 'The raw user request, verbatim (longer input routes more accurately). / 用户请求原文。'
      },
      brief: {
        type: 'boolean',
        description: 'Return a single compact line (~80 tokens) instead of the full route. / 一行结论。'
      },
      mode: {
        type: 'string',
        description: "route (default) | inventory (list installed skills/tools/plugins) | json (machine-readable). / route 默认、inventory 环境清单、json 机器可读。"
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of capability domains to return (defaults to the configured maxDomains). / 最多返回几个能力域。'
      }
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }]
    },
    execute: async (args, exec) => {
      const scope = exec?.agent
      const mode = typeof args?.mode === 'string' ? args.mode.toLowerCase() : 'route'
      try {
        if (mode === 'inventory') {
          const inventory = await runtime.inventoryFor(scope)
          return renderInventory(inventory, {
            lang: config.locale === 'en' ? 'en' : config.locale === 'zh' ? 'zh' : undefined,
            inventorySkillLimit: config.inventorySkillLimit,
            domainIds: runtime.catalog.domains.map((domain) => domain.id)
          })
        }

        const request = String(args?.request ?? '')
        if (!request.trim()) {
          return 'need_route: empty request. Pass the user request verbatim in `request`. / 请把用户请求原文填进 request。'
        }

        const maxDomains = clampInt(args?.limit ?? config.maxDomains, config.maxDomains, 1, 8)
        const cacheKey = `${scope?.id ?? 'global'}:${maxDomains}:${request.slice(0, 500)}`
        const cached = runtime.routeCache.get(cacheKey)
        if (cached && Date.now() - cached.at < config.routeCacheTtlMs) return cached.value

        const { route, inventory } = await runtime.routeFor(request, scope, { maxDomains })

        let value
        if (mode === 'json') {
          value = jsonResult(route, inventory, config)
        } else if (args?.brief === true || mode === 'brief') {
          value = renderBrief(route, { maxDomains, showSkillSource: config.showSkillSource })
        } else {
          value = renderRoute(route, { maxDomains, showSkillSource: config.showSkillSource })
        }

        if (runtime.routeCache.size > 128) runtime.routeCache.clear()
        runtime.routeCache.set(cacheKey, { at: Date.now(), value })
        return value
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `need_route failed: ${message}. Inventory mode still works: need_route(mode=inventory). / 路由失败，可先用 inventory 查看环境。`
      }
    }
  })
}

function promptText(config) {
  const zh = '跨领域或不确定该用哪套技能/工具时，可先调用 need_route 拿短名单；纯对话不必。'
  const en = 'Call need_route when a request crosses domains or the right skill/tool is unclear; skip it for plain chat.'
  if (config.locale === 'zh') return zh
  if (config.locale === 'en') return en
  return `${zh}${en}`
}

const Config = z.object({
  maxDomains: z.number().default(3).description('Maximum capability domains returned per route (1–8).'),
  injectPrompt: z.boolean().default(true).description('Inject the short routing hint into the system prompt.'),
  promptOrder: z.number().default(30).description('Order of the injected system-prompt fragment.'),
  locale: z.string().default('auto').description("Output language: 'auto' (follow the request), 'zh', or 'en'."),
  matchSkills: z.boolean().default(true).description('Rank the skills installed on this machine.'),
  matchTools: z.boolean().default(true).description('Rank the tools visible to this session.'),
  showSkillSource: z.boolean().default(true).description('Annotate each skill with its source (user/project/bundled).'),
  skillLimit: z.number().default(6).description('Maximum skills returned per route (1–20).'),
  toolLimit: z.number().default(6).description('Maximum tools returned per route (1–20).'),
  inventorySkillLimit: z.number().default(80).description('Maximum skill names listed by inventory mode.'),
  skillSources: z.array(z.string()).default([]).description('Only recommend skills whose source starts with one of these prefixes (empty = all).'),
  excludeSources: z.array(z.string()).default([]).description('Never recommend skills whose source starts with one of these prefixes.'),
  excludeTools: z.array(z.string()).default(['need_route']).description('Tool names never recommended.'),
  skillRoots: z.array(z.string()).default([]).description('Extra skill directories for hosts without a skill registry.'),
  projectDir: z.string().default('').description('Directory used to discover project-level skills (defaults to the host resolution).'),
  skillScanLimit: z.number().default(500).description('Maximum skills read by the filesystem fallback.'),
  domains: z.array(z.object({
    id: z.string().required().description('Stable domain id, e.g. "finance".'),
    label: z.string().description('Display label (single-language).'),
    labels: z.object({ zh: z.string(), en: z.string() }).description('Bilingual display labels.'),
    keywords: z.array(z.string()).description('Extra trigger words appended to the domain.'),
    hint: z.union([z.string(), z.object({ zh: z.string(), en: z.string() })]).description('Short advice shown for secondary matches.'),
    firstAction: z.union([z.string(), z.object({ zh: z.string(), en: z.string() })]).description('Concrete first step for this domain.'),
    extensions: z.array(z.string()).description('File extensions that signal this domain.'),
    disabled: z.boolean().description('Disable a built-in domain by its id.')
  })).default([]).description('Custom domains: new ids add domains, existing ids extend/override built-ins.'),
  extraKeywords: z.dict(z.array(z.string())).default({}).description('Extra keywords per domain id, e.g. {"data": ["留存率"]}.'),
  disableDomains: z.array(z.string()).default([]).description('Remove built-in domains by id.'),
  cacheTtlMs: z.number().default(5000).description('Inventory cache TTL in milliseconds.'),
  contentTtlMs: z.number().default(300000).description('Skill-body cache TTL used for tool evidence.'),
  routeCacheTtlMs: z.number().default(300000).description('Identical-request route cache TTL.')
})

async function apply(ctx, rawConfig) {
  const config = { ...DEFAULTS, ...(rawConfig ?? {}) }
  const runtime = createRuntime(ctx, config)

  ctx.effect(() => ctx.tools.register(needRouteTool(runtime, config)), 'dsh-need-router: need_route')

  if (config.injectPrompt === false) return

  ctx.effect(() => {
    try {
      return ctx.systemPrompt.context({
        name: 'need-router:hint',
        order: config.promptOrder,
        text: () => promptText(config)
      })
    } catch (error) {
      console.warn('[dsh-need-router] prompt hint registration failed, tool still works:', error instanceof Error ? error.message : error)
      return () => {}
    }
  }, 'dsh-need-router: prompt hint')
}

export { Config, apply, inject, name }
