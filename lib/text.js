/**
 * Bilingual text utilities for request matching.
 *
 * Design goals:
 * - Works for Chinese (no word boundaries) and Latin scripts (word boundaries).
 * - No dependencies, no segmentation library: CJK matching is substring based,
 *   n-grams are derived per character run.
 * - Everything is deterministic and cheap enough to run on every tool call.
 */

/** Unicode normalization + lower case. Keeps punctuation (word boundaries need it). */
export function normalize(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .toLowerCase()
}

/** True when the string is printable ASCII (used to pick a matching strategy). */
export function isAscii(value) {
  return /^[\x20-\x7e]+$/.test(value)
}

/** True when the string contains CJK ideographs. */
export function hasCjk(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(value)
}

/** Count of CJK ideographs. */
export function cjkCount(value) {
  const hits = String(value).match(/[\u3400-\u9fff\uf900-\ufaff]/g)
  return hits ? hits.length : 0
}

/** Count of Latin letters (a-z, after normalization). */
export function latinCount(value) {
  const hits = String(value).match(/[a-z]/g)
  return hits ? hits.length : 0
}

export function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Does `keyword` occur in already-normalized `text`?
 * Latin keywords require word boundaries so that `go` does not hit `good`.
 * CJK keywords are matched as plain substrings.
 */
export function keywordHit(text, keyword) {
  const kw = normalize(keyword).trim()
  if (!kw) return false
  if (isAscii(kw)) {
    // Allow a trailing plural ("tests" matches "test") without turning short
    // keywords into loose prefixes ("go" must not match "good").
    const suffix = kw.length >= 3 ? '(?:s|es)?' : ''
    return new RegExp(`(^|[^a-z0-9_])${escapeRe(kw)}${suffix}([^a-z0-9_]|$)`, 'i').test(text)
  }
  return text.includes(kw)
}

/** Split a skill/tool name such as `office-xlsx` into `['office', 'xlsx']`. */
export function nameTokens(name) {
  return normalize(name)
    .split(/[^a-z0-9\u3400-\u9fff]+/)
    .filter((token) => token.length > 0)
}

/** Latin/digit words of length >= 2, used for description overlap. */
export function latinWords(text) {
  const hits = normalize(text).match(/[a-z0-9][a-z0-9_+-]*/g)
  return hits ? hits.filter((word) => word.length >= 2) : []
}

/**
 * Function words that carry no routing signal in English. Without this filter a
 * long English description wins purely on "this / the / and / request".
 */
const STOP_WORDS = new Set([
  'this', 'that', 'these', 'those', 'the', 'and', 'for', 'with', 'from', 'into',
  'when', 'what', 'which', 'who', 'why', 'how', 'about', 'then', 'than', 'them',
  'they', 'their', 'there', 'here', 'its', 'our', 'out', 'over', 'some', 'such',
  'very', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must',
  'you', 'your', 'yours', 'are', 'was', 'were', 'has', 'have', 'had', 'not',
  'but', 'all', 'any', 'one', 'two', 'also', 'just', 'like', 'please', 'help',
  'user', 'users', 'request', 'requests', 'asked', 'asks', 'want', 'wants',
  'need', 'needs', 'make', 'made', 'get', 'got', 'use', 'used', 'using', 'via',
  'per', 'etc', 'e.g', 'i.e', 'some', 'more', 'most', 'only', 'other', 'same',
  'own', 'each', 'both', 'every', 'after', 'before', 'while', 'during',
  // CRUD verbs: they appear in request text and in many tool descriptions, but
  // they do not tell you which capability is needed.
  'update', 'updates', 'updated', 'create', 'creates', 'delete', 'deletes',
  'remove', 'removes', 'add', 'adds', 'edit', 'edits', 'change', 'changes',
  'list', 'lists', 'get', 'gets', 'set', 'sets', 'run', 'runs', 'start',
  'starts', 'stop', 'stops', 'draft', 'drafts'
])

/** Request words that actually carry meaning for matching. */
export function contentWords(text) {
  return uniqueList(latinWords(text).filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))
}

function uniqueList(list) {
  return [...new Set(list)]
}

/** Very small stop list for CJK n-grams; keeps noise out of description matching. */
const CJK_STOP = new Set([
  '帮我', '我们', '你们', '这个', '那个', '一下', '什么', '怎么', '如何',
  '可以', '需要', '我的', '你的', '一个', '现在', '然后', '因为', '所以',
  '但是', '如果', '就是', '不是', '没有', '还有', '以及', '或者', '进行',
  '通过', '使用', '看看', '看下', '一份', '做个', '你能', '能否', '麻烦',
  '这样', '那样', '这些', '那些', '之后', '之前', '里面', '东西'
])

/** CJK character runs of length >= 2, plus their bigrams. */
export function cjkGrams(text) {
  const runs = normalize(text).match(/[\u3400-\u9fff\uf900-\ufaff]{2,}/g) ?? []
  const grams = new Set()
  for (const run of runs) {
    const chars = [...run]
    if (chars.length <= 4) {
      const whole = chars.join('')
      if (!CJK_STOP.has(whole)) grams.add(whole)
      continue
    }
    for (let i = 0; i + 1 < chars.length; i++) {
      const gram = chars[i] + chars[i + 1]
      if (!CJK_STOP.has(gram)) grams.add(gram)
    }
  }
  return [...grams]
}

/** Weight a positive keyword by how specific it looks. */
export function keywordWeight(keyword) {
  const length = [...String(keyword)].length
  return length >= 3 ? 2 : 1.2
}

/** Confidence bucket from a score. `none` only when nothing matched at all. */
export function confidenceOf(score) {
  if (!(score > 0)) return 'none'
  if (score >= 6) return 'strong'
  if (score >= 3) return 'medium'
  return 'weak'
}

/** De-duplicate preserving order. */
export function unique(list) {
  return [...new Set(list)]
}

/**
 * Detect the dominant language of a request.
 * Mixed Chinese/English requests count as Chinese (the model answers in kind).
 */
export function detectLanguage(text, fallback = 'zh') {
  const cjk = cjkCount(text)
  const latin = latinCount(text)
  if (cjk === 0 && latin === 0) return fallback
  if (cjk === 0) return 'en'
  if (latin === 0) return 'zh'
  return cjk >= latin * 0.2 ? 'zh' : 'en'
}
