// Tiny, dependency-free syntax highlighter for chat code blocks.
//
// A full library (highlight.js / Prism) is ~hundreds of KB and would ride in the
// main chat bundle for every student. This covers what a campus assistant
// actually emits — the mainstream languages students learn — with a single
// tokenizer: comments, strings, numbers, keywords, constants and function names.
// It over-highlights slightly across languages (a Python keyword tinted inside
// C, say), which reads fine as "keywords are coloured, like an editor".
//
// Output is an HTML string of escaped text wrapped in <span class="tok-*">, fed
// to the CodeBlock via dangerouslySetInnerHTML. Because we escape every token
// ourselves and only ever emit our own span markup, no user/model text can
// inject HTML.

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

// Broad union of keywords across the languages students use. Kept as one set on
// purpose — see the file header note on cross-language over-highlighting.
const KEYWORDS = new Set([
  'abstract', 'and', 'as', 'assert', 'async', 'await', 'base', 'break', 'case', 'catch', 'class',
  'const', 'constexpr', 'continue', 'def', 'default', 'del', 'delete', 'do', 'elif', 'else', 'end',
  'enum', 'except', 'export', 'extends', 'extern', 'final', 'finally', 'fn', 'for', 'foreach', 'from',
  'func', 'function', 'global', 'goto', 'if', 'impl', 'implements', 'import', 'in', 'include', 'inline',
  'instanceof', 'interface', 'is', 'lambda', 'let', 'match', 'module', 'mut', 'namespace', 'new', 'not',
  'object', 'operator', 'or', 'override', 'package', 'pass', 'private', 'protected', 'public', 'raise',
  'readonly', 'ref', 'return', 'select', 'sizeof', 'static', 'struct', 'super', 'switch', 'synchronized',
  'template', 'then', 'throw', 'throws', 'trait', 'try', 'type', 'typedef', 'typeof', 'typename', 'union',
  'unsigned', 'use', 'using', 'val', 'var', 'virtual', 'void', 'volatile', 'when', 'where', 'while',
  'with', 'yield',
])
// Built-in types get the same treatment — they read as language furniture.
const TYPES = new Set([
  'int', 'long', 'short', 'char', 'byte', 'float', 'double', 'bool', 'boolean', 'string', 'str',
  'list', 'dict', 'set', 'tuple', 'vector', 'map', 'array', 'number', 'object', 'any', 'unknown', 'auto',
  'signed', 'usize', 'i32', 'i64', 'u32', 'u64', 'f32', 'f64',
])
// Literal constants — a distinct colour so they stand out from keywords.
const CONSTS = new Set([
  'true', 'false', 'null', 'none', 'nil', 'nullptr', 'undefined', 'nan', 'inf', 'self', 'this', 'super',
])

const HASH_COMMENT = /^(py|python|pyw|rb|ruby|sh|bash|shell|zsh|yaml|yml|r|perl|pl|toml|ini|conf|makefile|dockerfile|cmake|nim|jl|julia)$/
const DASH_COMMENT = /^(sql|lua|hs|haskell|ada|elm)$/

export function highlight(code: string, lang?: string): string {
  const L = (lang || '').trim().toLowerCase()
  const hash = HASH_COMMENT.test(L)
  const dash = DASH_COMMENT.test(L)

  // One combined tokenizer. Order matters: comments and strings first so their
  // insides are never mis-tokenized; identifiers and numbers last.
  const patterns = [
    '/\\*[\\s\\S]*?\\*/',                 // block comment
    '//[^\\n]*',                          // // line comment
    hash ? '#[^\\n]*' : '',               // # line comment (python/shell/…)
    dash ? '--[^\\n]*' : '',              // -- line comment (sql/lua/…)
    '"(?:\\\\.|[^"\\\\\\n])*"?',          // double-quoted (tolerate unclosed while streaming)
    "'(?:\\\\.|[^'\\\\\\n])*'?",          // single-quoted
    '`(?:\\\\.|[^`\\\\])*`?',             // template literal
    '\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b', // number
    '[A-Za-z_$][A-Za-z0-9_$]*',           // identifier
  ].filter(Boolean)
  const re = new RegExp(patterns.join('|'), 'g')

  let out = ''
  let last = 0
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m.index > last) out += esc(code.slice(last, m.index)) // operators / whitespace / punctuation
    const t = m[0]
    const c = t[0]
    let cls = ''
    if (t.startsWith('//') || t.startsWith('/*') || (hash && c === '#') || (dash && t.startsWith('--'))) cls = 'tok-comment'
    else if (c === '"' || c === "'" || c === '`') cls = 'tok-string'
    else if (c >= '0' && c <= '9') cls = 'tok-number'
    else {
      const lower = t.toLowerCase()
      if (CONSTS.has(lower)) cls = 'tok-const'
      else if (KEYWORDS.has(lower) || TYPES.has(lower)) cls = 'tok-keyword'
      else {
        // Function call/def: identifier immediately followed by "(" (skipping spaces).
        let j = m.index + t.length
        while (code[j] === ' ' || code[j] === '\t') j++
        if (code[j] === '(') cls = 'tok-fn'
      }
    }
    out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t)
    last = m.index + t.length
  }
  if (last < code.length) out += esc(code.slice(last))
  return out
}
