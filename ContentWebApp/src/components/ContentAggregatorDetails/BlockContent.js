import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathDelimiters, MarkdownParagraph } from "./markdownMath";
import { MultipleChoiceProblem } from "./MultipleChoiceProblem";
import { brailleAsciiToUnicode } from "../../utils/brailleAscii";

function getYoutubeId(streams) {
  if (!streams) return null;
  const entries = streams.split(",");
  const preferred = entries.find((e) => e.startsWith("1.00:")) || entries[0];
  return preferred?.split(":")[1] || null;
}

function BlockContent({ block, courseId, source, onBlockChange }) {
  if (!block) return null;
  const sources = block.student_view_data?.sources || [];
  const youtubeId = sources.length === 0 ? getYoutubeId(block.student_view_data?.streams) : null;

  if (block.type === "video" && sources.length > 0) {
    return (
      <video controls poster={block.student_view_data?.poster || undefined} className="content-aggregator-block-video">
        <source src={sources[0]} />
      </video>
    );
  }

  if (block.type === "video" && youtubeId) {
    return (
      <iframe
        className="content-aggregator-block-video content-aggregator-block-video-embed"
        src={`https://www.youtube.com/embed/${youtubeId}`}
        title={block.display_name || "Video"}
        allowFullScreen
      />
    );
  }

  if (block.type === "problem") {
    return <MultipleChoiceProblem block={block} courseId={courseId} source={source} onBlockChange={onBlockChange} />;
  }

  if (block.type === "brf") {
    return <pre className="content-aggregator-block-braille">{brailleAsciiToUnicode(block.markdown)}</pre>;
  }

  // Other interactive types (drag-and-drop-v2, etc.) still need Subodha's own
  // JS to hydrate — no reliable way to parse/render those generically yet.
  if (block.type === "drag-and-drop-v2") {
    return (
      <p className="table-cell-secondary">
        This is an interactive exercise — open it in Subodha to attempt it.
      </p>
    );
  }

  if (block.markdown) {
    return (
      <div className="content-aggregator-block-html">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{ p: MarkdownParagraph }}
        >
          {normalizeMathDelimiters(block.markdown)}
        </ReactMarkdown>
      </div>
    );
  }

  if (block.html) {
    return <div className="content-aggregator-block-html" dangerouslySetInnerHTML={{ __html: block.html }} />;
  }

  return <p className="table-cell-secondary">No preview available for this content type.</p>;
}

export function BlockCard({ block, courseId, source, onBlockChange }) {
  if (!block) return null;
  return (
    <div className="content-aggregator-block-card">
      <BlockContent block={block} courseId={courseId} source={source} onBlockChange={onBlockChange} />
    </div>
  );
}
