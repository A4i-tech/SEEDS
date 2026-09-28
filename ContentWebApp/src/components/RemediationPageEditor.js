import { useEffect, useRef, useState } from "react";

import { MarkdownViewer } from "./RemediationMarkdownView";
import {
  applyListEdit,
  buildHeading,
  buildImage,
  buildList,
  joinBlocks,
  parseHeading,
  parseImage,
  parseList,
  splitBlocks,
} from "./remediationBlocks";

const BLOCK_LABELS = {
  heading: "Edit heading",
  paragraph: "Edit paragraph",
  list: "Edit list",
  image: "Edit figure",
  table: "Edit table",
  math: "Edit math",
  marker: "",
};

function draftFromBlock(block) {
  if (block.type === "heading") return parseHeading(block.raw);
  if (block.type === "list") {
    const items = parseList(block.raw);
    return { items, text: items.map((item) => item.text).join("\n") };
  }
  if (block.type === "image") return parseImage(block.raw);
  return { text: block.raw };
}

function buildRawFromDraft(block, draft) {
  if (block.type === "heading") return buildHeading(draft);
  if (block.type === "list") return buildList(applyListEdit(draft.items, draft.text));
  if (block.type === "image") return buildImage(draft);
  return draft.text;
}

function AutoGrowTextarea({ value, onChange, autoFocus, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      autoFocus={autoFocus}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function BlockEditor({ block, onCommit, onCancel }) {
  const [draft, setDraft] = useState(() => draftFromBlock(block));
  const containerRef = useRef(null);
  const commit = () => onCommit(buildRawFromDraft(block, draft));
  const handleBlur = (e) => {
    if (containerRef.current && containerRef.current.contains(e.relatedTarget)) return;
    commit();
  };
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
  };

  return (
    <div ref={containerRef} className="remediation-block-editor" onBlur={handleBlur} onKeyDown={handleKeyDown}>
      {block.type === "image" ? (
        <>
          <label className="remediation-block-field">
            Alt text
            <input autoFocus value={draft.alt} onChange={(e) => setDraft({ ...draft, alt: e.target.value })} />
          </label>
          <label className="remediation-block-field">
            Description
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
        </>
      ) : (
        <AutoGrowTextarea
          autoFocus
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          className={
            block.type === "table" || block.type === "math"
              ? "remediation-block-textarea remediation-block-textarea-raw"
              : "remediation-block-textarea"
          }
        />
      )}
    </div>
  );
}

function Block({ block, jobId, editingId, onEdit, onCommit, onCancel }) {
  if (block.type === "marker") return null;
  if (editingId === block.id) {
    return <BlockEditor block={block} onCommit={(raw) => onCommit(block.id, raw)} onCancel={onCancel} />;
  }
  return (
    <div
      role="button"
      tabIndex={0}
      className="remediation-block"
      aria-label={BLOCK_LABELS[block.type] || "Edit block"}
      onClick={() => onEdit(block.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(block.id);
        }
      }}
    >
      <MarkdownViewer text={block.raw} jobId={jobId} />
    </div>
  );
}

export function RemediationPageEditor({ jobId, pageMarkdown, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const blocks = splitBlocks(pageMarkdown);

  const commitBlock = (id, raw) => {
    const nextBlocks = blocks.map((block) => (block.id === id ? { ...block, raw } : block));
    setEditingId(null);
    onChange(joinBlocks(nextBlocks));
  };

  return (
    <div className="remediation-block-page">
      {blocks.map((block) => (
        <Block
          key={block.id}
          block={block}
          jobId={jobId}
          editingId={editingId}
          onEdit={setEditingId}
          onCommit={commitBlock}
          onCancel={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}
