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

function AutoGrowTextarea({ value, onChange, className }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      autoFocus
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function BlockEditor({ block, onCommit, onCancel }) {
  const [draft, setDraft] = useState(() => draftFromBlock(block));
  const containerRef = useRef(null);
  const commit = (refocus) => {
    const raw = buildRawFromDraft(block, draft);
    if (raw === block.raw) onCancel(refocus);
    else onCommit(raw, refocus);
  };
  const handleBlur = (e) => {
    if (containerRef.current.contains(e.relatedTarget)) return;
    commit(false);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel(true);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit(true);
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

function Block({ block, jobId, editingId, focusIdRef, onEdit, onCommit, onCancel }) {
  const triggerRef = useRef(null);
  const editing = editingId === block.id;
  useEffect(() => {
    if (!editing && focusIdRef.current === block.id) {
      triggerRef.current?.focus();
      focusIdRef.current = null;
    }
  }, [editing, block.id, focusIdRef]);

  if (block.type === "marker") return null;
  if (editing) {
    return (
      <BlockEditor
        key={block.raw}
        block={block}
        onCommit={(raw, refocus) => onCommit(block.id, raw, refocus)}
        onCancel={(refocus) => onCancel(block.id, refocus)}
      />
    );
  }
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <div className="remediation-block" onClick={() => onEdit(block.id)}>
        <MarkdownViewer text={block.raw} jobId={jobId} />
      </div>
      <button
        ref={triggerRef}
        type="button"
        className="action-ghost-button"
        style={{ padding: "4px 10px", fontSize: "12px" }}
        aria-label={BLOCK_LABELS[block.type]}
        onClick={() => onEdit(block.id)}
      >
        Edit
      </button>
    </div>
  );
}

export function RemediationPageEditor({ jobId, pageMarkdown, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const focusIdRef = useRef(null);
  const blocks = splitBlocks(pageMarkdown);

  const commitBlock = (id, raw, refocus) => {
    if (refocus) focusIdRef.current = id;
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
          focusIdRef={focusIdRef}
          onEdit={setEditingId}
          onCommit={commitBlock}
          onCancel={(id, refocus) => {
            if (refocus) focusIdRef.current = id;
            setEditingId(null);
          }}
        />
      ))}
    </div>
  );
}
