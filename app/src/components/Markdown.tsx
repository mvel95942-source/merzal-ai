import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeMath } from '../lib/latex'
import { highlight } from '../lib/highlight'

// Renders assistant text as Markdown with GFM + LaTeX math.
// Bold/headings/lists let the model emphasise what matters; KaTeX renders
// formulas. Fenced code blocks are syntax-highlighted (keywords/strings/etc.)
// like a code editor. Long math/code scroll horizontally instead of breaking.
//
// normalizeMath() first: remark-math only understands $…$ / $$…$$, but models
// freely emit \(…\) and \[…\]. Those used to reach the page as literal
// backslashes and brackets instead of a formula.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={COMPONENTS}>
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  )
}

// react-markdown wraps block code in <pre><code>. We render our own <pre> inside
// CodeBlock, so `pre` just passes children through to avoid a nested <pre>.
const COMPONENTS: Components = {
  pre: ({ children }) => <>{children}</>,
  code({ className, children, ...props }) {
    const text = String(children ?? '')
    const lang = /language-([\w-]+)/.exec(className || '')?.[1]
    // Block code (from a ``` fence) has a language class or spans lines; anything
    // else is inline `code` and stays a plain inline chip.
    const isBlock = !!lang || text.includes('\n')
    if (!isBlock) return <code className={className} {...props}>{children}</code>
    return <CodeBlock code={text.replace(/\n$/, '')} lang={lang} />
  },
}

// A code editor–style block: a thin header with the language and a copy button,
// then the syntax-highlighted source on a dark "terminal" surface.
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const html = useMemo(() => highlight(code, lang), [code, lang])
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }
  return (
    <div className="mz-code">
      <div className="mz-code-head">
        <span className="mz-code-lang">{lang || 'code'}</span>
        <button type="button" className="mz-code-copy" onClick={copy} aria-label="Copy code">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  )
}
