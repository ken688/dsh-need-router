import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCatalog, routeRequest } from '../lib/match.js'
import { confidenceLabel, renderBrief, renderInventory, renderRoute, sourceTag } from '../lib/render.js'

const catalog = buildCatalog({})

const SKILLS = [
  { name: 'office-xlsx', description: 'Create and edit Excel workbooks, formulas and pivot tables', source: 'user-agents' },
  { name: 'data-analysis', description: 'Analyze CSV files with pandas', source: 'user-agents' }
]

const TOOLS = [{ name: 'ops_bash', description: 'Execute a Bash command' }]

function route(request, config = {}) {
  return routeRequest({ request, catalog, skills: SKILLS, tools: TOOLS, mentioned: [], config })
}

test('Chinese route output uses Chinese labels and skips nothing wrong', () => {
  const text = renderRoute(route('把这个 Excel 透视表做成图表'))
  assert.match(text, /判定/)
  assert.match(text, /技能/)
  assert.match(text, /office-xlsx/)
})

test('English request renders English output', () => {
  const text = renderRoute(route('make a chart from this Excel pivot table'))
  assert.match(text, /verdict:/i)
  assert.match(text, /skills:/i)
})

test('English output never falls back to Chinese domain labels', () => {
  const text = renderRoute(route('make a chart from this Excel pivot table'))
  assert.match(text, /Documents & Spreadsheets/)
  assert.doesNotMatch(text, /文档与表格/)
})

test('locale config overrides language detection', () => {
  const text = renderRoute(route('make a chart from excel', { locale: 'zh' }))
  assert.match(text, /判定/)
})

test('brief is a single line without newlines', () => {
  const text = renderBrief(route('把这个 Excel 透视表做成图表'))
  assert.equal(text.includes('\n'), false)
  assert.match(text, /^brief: /)
})

test('no-domain route explains that generic tools are enough', () => {
  const text = renderRoute(route('你好啊'))
  assert.match(text, /没有命中任何专业能力域/)
  assert.match(text, /通用工具/)
})

test('inventory renders counts and source breakdown', () => {
  const text = renderInventory({
    skills: SKILLS,
    skillsVia: 'service',
    skillSources: { 'user-agents': 2 },
    tools: TOOLS,
    plugins: { dir: '/tmp/profile', names: ['dsh-need-router'] }
  }, { domainIds: ['documents', 'data'] })
  assert.match(text, /插件（已装）: 1/)
  assert.match(text, /技能目录: 2/)
  assert.match(text, /user-agents 2/)
  assert.match(text, /能力域: documents/)
})

test('inventory truncates long tool lists', () => {
  const tools = Array.from({ length: 70 }, (_, index) => ({ name: `tool_${index}`, description: '' }))
  const text = renderInventory({
    skills: [],
    skillsVia: 'service',
    skillSources: {},
    tools,
    plugins: { dir: null, names: [] }
  }, { inventoryToolLimit: 10 })
  assert.match(text, /tool_9/)
  assert.match(text, /\+60/)
})

test('source tags stay short and localised', () => {
  assert.equal(sourceTag('bundled', 'zh'), '内置')
  assert.equal(sourceTag('user-agents', 'zh'), '用户')
  assert.equal(sourceTag('project-dsh', 'en'), 'project')
  assert.equal(sourceTag('agent-trae-cn', 'en'), 'agent-trae-cn')
})

test('confidence labels are localised', () => {
  assert.equal(confidenceLabel('strong', 'zh'), '强')
  assert.equal(confidenceLabel('medium', 'en'), 'medium')
})

test('skill source annotations can be turned off', () => {
  const text = renderRoute(route('excel 表格'), { showSkillSource: false })
  assert.match(text, /office-xlsx/)
  assert.doesNotMatch(text, /office-xlsx\(用户\)/)
})
