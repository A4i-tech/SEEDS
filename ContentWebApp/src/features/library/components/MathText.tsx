import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

const INLINE = /\[mathjaxinline\](.*?)\[\/mathjaxinline\]/gs;
const DISPLAY = /\[mathjax\](.*?)\[\/mathjax\]/gs;

export function MathText({ children }: { children: string }) {
  const source = children.replace(INLINE, '$$$1$$').replace(DISPLAY, '$$$$$1$$$$');
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{ p: ({ children: content }) => <>{content}</> }}
    >
      {source}
    </ReactMarkdown>
  );
}
