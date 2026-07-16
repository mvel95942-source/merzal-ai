import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeMath } from '../lib/latex'

// Renders assistant text as Markdown with GFM + LaTeX math.
// Bold/headings/lists let the model emphasise what matters; KaTeX renders
// formulas. Long math/code scroll horizontally instead of breaking the layout.
//
// normalizeMath() first: remark-math only understands $…$ / $$…$$, but models
// freely emit \(…\) and \[…\]. Those used to reach the page as literal
// backslashes and brackets instead of a formula.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  )
}
