import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cjkGrams, contentWords, detectLanguage, hasCjk, keywordHit, keywordWeight, latinWords,
  nameTokens, normalize
} from '../lib/text.js'

test('normalize lowercases and NFKC-normalizes', () => {
  assert.equal(normalize('ＥＸＣＥＬ 表格'), 'excel 表格')
})

test('latin keywords respect word boundaries', () => {
  assert.equal(keywordHit('fix the go build', 'go'), true)
  assert.equal(keywordHit('a good build', 'go'), false)
  assert.equal(keywordHit('openai api', 'api'), true)
})

test('CJK keywords match as substrings', () => {
  assert.equal(keywordHit('帮我把这个文档排版一下', '排版'), true)
  assert.equal(keywordHit('帮我翻译', '排版'), false)
})

test('hasCjk detects ideographs only', () => {
  assert.equal(hasCjk('pure english'), false)
  assert.equal(hasCjk('中文 mixed'), true)
})

test('nameTokens splits kebab and snake names', () => {
  assert.deepEqual(nameTokens('office-xlsx_export'), ['office', 'xlsx', 'export'])
})

test('cjkGrams drops stop bigrams', () => {
  const grams = cjkGrams('帮我把表格导出成pdf')
  assert.ok(grams.includes('表格'))
  assert.ok(!grams.includes('帮我'))
})

test('latinWords ignores one-letter noise', () => {
  assert.deepEqual(latinWords('a b cc ddd'), ['cc', 'ddd'])
})

test('contentWords drops function words and CRUD verbs', () => {
  assert.deepEqual(contentWords('please update this list and create a chart'), ['chart'])
})

test('keywordWeight rewards specificity', () => {
  assert.ok(keywordWeight('xlsx') > keywordWeight('x'))
  assert.equal(keywordWeight('xls'), 2)
})

test('detectLanguage handles mixed requests as Chinese', () => {
  assert.equal(detectLanguage('帮我看下 review 这段代码'), 'zh')
  assert.equal(detectLanguage('please review this patch'), 'en')
  assert.equal(detectLanguage('你好'), 'zh')
  assert.equal(detectLanguage(''), 'zh')
  assert.equal(detectLanguage('', 'en'), 'en')
})
