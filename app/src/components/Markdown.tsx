import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

// Renders assistant text as Markdown with GFM + LaTeX math ($…$ and $$…$$).
// Bold/headings/lists let the model emphasise what matters; KaTeX renders
// formulas. Long math/code scroll horizontally instead of breaking the layout.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
