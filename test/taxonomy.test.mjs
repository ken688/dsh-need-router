import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCatalog } from '../lib/match.js'
import { DOMAINS } from '../lib/taxonomy.js'

test('built-in domains are capability areas, never installed skill names', () => {
  for (const domain of DOMAINS) {
    assert.equal(domain.skills, undefined, `${domain.id} must not hardcode skill names`)
    assert.ok(Array.isArray(domain.keywords) && domain.keywords.length > 0, `${domain.id} needs keywords`)
    assert.ok(domain.hint && domain.firstAction, `${domain.id} needs hint and firstAction`)
  }
})

test('every built-in domain id is unique and kebab-case', () => {
  const ids = DOMAINS.map((domain) => domain.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/)
})

test('all built-in domains carry both Chinese and English guidance', () => {
  for (const domain of DOMAINS) {
    assert.ok(domain.hint.zh && domain.hint.en, `${domain.id} hint`)
    assert.ok(domain.firstAction.zh && domain.firstAction.en, `${domain.id} firstAction`)
  }
})

test('custom domain with a new id adds a domain', () => {
  const catalog = buildCatalog({
    domains: [{ id: 'finance', label: 'Finance', keywords: ['invoice', '发票'] }]
  })
  const finance = catalog.domains.find((domain) => domain.id === 'finance')
  assert.ok(finance)
  assert.deepEqual(finance.keywords, ['invoice', '发票'])
})

test('custom domain with an existing id extends keywords', () => {
  const catalog = buildCatalog({ domains: [{ id: 'data', keywords: ['留存率'] }] })
  const data = catalog.domains.find((domain) => domain.id === 'data')
  assert.ok(data.keywords.includes('留存率'))
  assert.ok(data.keywords.includes('数据分析'))
})

test('extraKeywords appends per domain', () => {
  const catalog = buildCatalog({ extraKeywords: { code: ['热更新'] } })
  assert.ok(catalog.domains.find((domain) => domain.id === 'code').keywords.includes('热更新'))
})

test('disableDomains and per-domain disabled both remove domains', () => {
  const catalog = buildCatalog({
    disableDomains: ['desktop'],
    domains: [{ id: 'system', disabled: true }]
  })
  assert.equal(catalog.domains.find((domain) => domain.id === 'desktop'), undefined)
  assert.equal(catalog.domains.find((domain) => domain.id === 'system'), undefined)
})

test('custom extensions map back to their domain', () => {
  const catalog = buildCatalog({ domains: [{ id: 'finance', extensions: ['ledger'] }] })
  assert.equal(catalog.extensions.ledger, 'finance')
})
