import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCatalog, collectToolMentions, matchSkills, matchTools, routeRequest, scoreDomains
} from '../lib/match.js'
import { normalize } from '../lib/text.js'

const SKILLS = [
  { name: 'office-xlsx', description: 'Create and edit Excel .xlsx workbooks, formulas, pivot tables and charts', source: 'user-agents' },
  { name: 'data-analysis', description: 'Analyze CSV files with pandas: statistics, aggregates, pivot tables', source: 'user-agents' },
  { name: 'bug-hunt', description: '复现并定位问题，给出最小修复和验证路径', source: 'user-agents' },
  { name: 'lark-im', description: '飞书即时通讯：收发消息、搜索聊天记录、管理群聊', source: 'bundled' },
  { name: 'cad-draw', description: 'CAD 通用绘图：AutoCAD COM 自动化或导出 DXF 图纸', source: 'user-agents' }
]

const TOOLS = [
  { name: 'ops_bash', description: 'Execute a Bash command in a fresh shell' },
  { name: 'video_probe', description: 'Inspect a local video file and return its metadata' },
  { name: 'need_route', description: 'Capability router' },
  { name: 'obsidian_read', description: 'Read a note from the Obsidian vault' }
]

const catalog = buildCatalog({})

function route(request, config = {}) {
  return routeRequest({ request, catalog, skills: SKILLS, tools: TOOLS, mentioned: [], config })
}

test('routes an Excel request to document/data domains', () => {
  const result = route('把这个 Excel 的透视表做成图表')
  const ids = result.domains.map((domain) => domain.id)
  assert.ok(ids.includes('documents'))
  assert.ok(ids.includes('data'))
})

test('recommends only skills that are actually installed', () => {
  const result = route('把这个 Excel 的透视表做成图表')
  assert.ok(result.skills.length > 0)
  for (const skill of result.skills) {
    assert.ok(SKILLS.some((installed) => installed.name === skill.name), `invented skill ${skill.name}`)
  }
})

test('an explicitly named skill ranks first', () => {
  const result = route('用 bug-hunt 帮我定位这个报错')
  assert.equal(result.skills[0]?.name, 'bug-hunt')
  assert.ok(result.skills[0].why.includes('explicit'))
})

test('negative signals suppress the wrong domain for a debugging request', () => {
  const text = normalize('excel 打开就报错，栈里说 undefined')
  const domains = scoreDomains(text, catalog)
  const code = domains.findIndex((domain) => domain.id === 'code')
  const documents = domains.findIndex((domain) => domain.id === 'documents')
  assert.ok(code >= 0, 'code domain should match')
  assert.ok(documents === -1 || code < documents, 'code should outrank documents')
})

test('domain keywords bridge into skill descriptions', () => {
  const result = route('飞书群发消息通知大家')
  assert.ok(result.skills.some((skill) => skill.name === 'lark-im'))
})

test('chat requests match no domain and stay direct', () => {
  const result = route('你好，随便聊聊')
  assert.equal(result.domains.length, 0)
  assert.equal(result.skills.length, 0)
  assert.equal(result.confidence, 'none')
})

test('tools are restricted to the visible set and to the exclusion list', () => {
  const result = route('跑个 bash 命令看下 video 元数据')
  for (const tool of result.tools) {
    assert.ok(TOOLS.some((visible) => visible.name === tool.name), `invented tool ${tool.name}`)
    assert.notEqual(tool.name, 'need_route')
  }
})

test('collectToolMentions reads evidence out of skill bodies', () => {
  const mentions = collectToolMentions(
    [{ name: 'bug-hunt', score: 8 }],
    new Map([['bug-hunt', '# Bug Hunt\n\nUse `ops_bash` to run the failing test, then inspect the stack.']]),
    TOOLS
  )
  assert.deepEqual(mentions.map((entry) => entry.name), ['ops_bash'])
  assert.equal(mentions[0].skill, 'bug-hunt')
})

test('plain-word tool names need a code-span reference', () => {
  const tools = [{ name: 'memory', description: 'Memory tool' }, { name: 'present', description: 'Present files' }]
  const prose = collectToolMentions(
    [{ name: 'memory-consolidate', score: 6 }],
    new Map([['memory-consolidate', 'Recent memory should be merged; present the result to the user.']]),
    tools
  )
  assert.deepEqual(prose, [])
  const codeSpan = collectToolMentions(
    [{ name: 'memory-consolidate', score: 6 }],
    new Map([['memory-consolidate', 'Use the `memory` tool with `replace` or `archive`.']]),
    tools
  )
  assert.deepEqual(codeSpan.map((entry) => entry.name), ['memory'])
})

test('tool mentions from skills feed the tool ranking', () => {
  const mentions = [{ name: 'ops_bash', skill: 'bug-hunt', weight: 1.6 }]
  const ranked = matchTools(normalize('定位这个问题'), TOOLS, mentions, { excludeTools: ['need_route'] })
  assert.equal(ranked[0]?.name, 'ops_bash')
})

test('tool names bridge to the matched domain vocabulary', () => {
  const tools = [
    { name: 'memory', description: 'Read and write durable memories' },
    { name: 'dev_stage_list', description: 'List staged tools' },
    { name: 'video_probe', description: 'Inspect a local video file' }
  ]
  const result = routeRequest({
    request: '记住我的偏好，顺便把这件事加到待办',
    catalog,
    skills: [],
    tools,
    mentioned: [],
    config: {}
  })
  assert.ok(result.tools.some((tool) => tool.name === 'memory'))
  assert.ok(!result.tools.some((tool) => tool.name === 'video_probe'))
  assert.ok(!result.tools.some((tool) => tool.name === 'dev_stage_list'), 'partial keyword matches must not qualify')
})

test('skill ranking is limited by config', () => {
  const result = route('excel 表格 数据 透视 图表 csv 统计', { skillLimit: 2 })
  assert.ok(result.skills.length <= 2)
})

test('matchSkills tolerates empty descriptions', () => {
  const ranked = matchSkills(normalize('xlsx'), [], [{ name: 'empty', description: '' }])
  assert.deepEqual(ranked, [])
})

test('score is deterministic for repeated input', () => {
  const first = route('把 PDF 转成 Word')
  const second = route('把 PDF 转成 Word')
  assert.deepEqual(first.domains.map((d) => [d.id, d.score]), second.domains.map((d) => [d.id, d.score]))
})

test('confidence reflects the top domain score', () => {
  const result = route('用 AutoCAD 画三视图图纸，建图层并标注，导出 DXF')
  assert.equal(result.domains[0].id, 'engineering')
  assert.ok(['medium', 'strong'].includes(result.confidence))
})

test('CAD drawing and circuit design are separate domains', () => {
  const cad = route('用 AutoCAD 画一张平面图并标注尺寸')
  assert.equal(cad.domains[0].id, 'engineering')
  const eda = route('用嘉立创选料并打样，检查一下原理图的电源滤波')
  assert.equal(eda.domains[0].id, 'electronics')
})

test('release notes are code work, not note-taking', () => {
  const result = route('Draft the release notes and update the changelog, then publish')
  const ids = result.domains.map((domain) => domain.id)
  assert.equal(ids[0], 'code')
  assert.ok(!ids.includes('notes'))
})
