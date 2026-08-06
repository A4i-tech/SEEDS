import React, { useState, useEffect, useCallback, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { subodhaService } from "../services/subodhaService";
import { getLanguageName } from "../utils/languageName";
import "./SubodhaCourseDetails.css";

function getYoutubeId(streams) {
  if (!streams) return null;
  const entries = streams.split(",");
  const preferred = entries.find((e) => e.startsWith("1.00:")) || entries[0];
  return preferred?.split(":")[1] || null;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// edX renders formulas as literal `[mathjax]...[/mathjax]` / `[mathjaxinline]...[/mathjaxinline]`
// markers (its own MathJax shorthand) — KaTeX understands the same LaTeX inside them.
const MATHJAX_RE = /\[mathjax(inline)?\]([\s\S]*?)\[\/mathjax(?:inline)?\]/g;

function renderMathHtml(text) {
  if (!text) return "";
  let html = "";
  let lastIndex = 0;
  let match;
  MATHJAX_RE.lastIndex = 0;
  while ((match = MATHJAX_RE.exec(text))) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const isInline = Boolean(match[1]);
    try {
      html += katex.renderToString(match[2], { throwOnError: false, displayMode: !isInline });
    } catch {
      html += escapeHtml(match[0]);
    }
    lastIndex = MATHJAX_RE.lastIndex;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function MathText({ text, as: Tag = "span" }) {
  const html = useMemo(() => renderMathHtml(text), [text]);
  return <Tag dangerouslySetInnerHTML={{ __html: html }} />;
}

// The real question + choices for a "problem" block live double-HTML-encoded
// inside a `data-content` attribute (edX's own JS decodes and injects it into
// the DOM at runtime — before that runs, the visible markup is an empty
// skeleton). Decode it ourselves and pull out the multiple-choice fields.
function parseMultipleChoice(rawHtml) {
  if (!rawHtml) return null;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = rawHtml;
  const encoded = wrapper.querySelector("[data-content]")?.getAttribute("data-content");
  if (!encoded) return null;

  // textarea.innerHTML → .value is the standard trick for decoding HTML entities.
  const decoder = document.createElement("textarea");
  decoder.innerHTML = encoded;

  const inner = document.createElement("div");
  inner.innerHTML = decoder.value;

  const legend = inner.querySelector("legend");
  const question = legend ? legend.textContent.trim() : "";

  const choices = Array.from(inner.querySelectorAll("input[type=\"radio\"]")).map((input) => {
    const label = inner.querySelector(`label[for="${input.id}"]`);
    return { value: input.value, text: (label ? label.textContent : input.value).trim() };
  });

  if (!question || choices.length === 0) return null;
  return { question, choices };
}

function MultipleChoiceProblem({ block, courseId, onBlockChange }) {
  const parsedFromHtml = useMemo(() => parseMultipleChoice(block.html), [block.html]);
  // Prior edits are stored directly on the block (question/choices) and take
  // priority over re-parsing the original Subodha markup.
  const current = block.question && block.choices?.length ? { question: block.question, choices: block.choices } : parsedFromHtml;

  const [editing, setEditing] = useState(false);
  const [questionDraft, setQuestionDraft] = useState("");
  const [choiceDrafts, setChoiceDrafts] = useState([]);
  const [saving, setSaving] = useState(false);

  if (!current) {
    return (
      <p className="table-cell-secondary">
        This is an interactive exercise — open it in Subodha to attempt it.
      </p>
    );
  }

  const startEdit = () => {
    setQuestionDraft(current.question);
    setChoiceDrafts(current.choices.map((c) => c.text));
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const updatedChoices = current.choices.map((c, i) => ({ value: c.value, text: choiceDrafts[i] }));
    try {
      await subodhaService.updateProblemBlock(courseId, block.block_id, {
        question: questionDraft,
        choices: updatedChoices,
      });
      onBlockChange?.({ ...block, question: questionDraft, choices: updatedChoices });
      setEditing(false);
    } catch (err) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="subodha-problem-edit">
        <label className="subodha-problem-edit-label">
          Question
          <textarea
            className="subodha-problem-edit-input"
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
          />
        </label>
        {choiceDrafts.map((text, i) => (
          // eslint-disable-next-line react/no-array-index-key -- choices are a fixed-size draft array, index is stable here
          <label key={i} className="subodha-problem-edit-label">
            {`Choice ${i + 1}`}
            <input
              className="subodha-problem-edit-input"
              value={text}
              onChange={(e) => {
                const next = e.target.value;
                setChoiceDrafts((prev) => prev.map((t, idx) => (idx === i ? next : t)));
              }}
            />
          </label>
        ))}
        <div className="subodha-problem-edit-actions">
          <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="secondary-button" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="subodha-problem-view">
      <p className="subodha-problem-question">
        <MathText text={current.question} />
      </p>
      <ul className="subodha-problem-choice-list">
        {current.choices.map((choice) => (
          <li key={choice.value}>
            <MathText text={choice.text} />
          </li>
        ))}
      </ul>
      <button type="button" className="secondary-button" onClick={startEdit}>
        Edit
      </button>
    </div>
  );
}

function BlockContent({ block, courseId, onBlockChange }) {
  if (!block) return null;
  const sources = block.student_view_data?.sources || [];
  const youtubeId = sources.length === 0 ? getYoutubeId(block.student_view_data?.streams) : null;

  if (block.type === "video" && sources.length > 0) {
    return (
      <video controls poster={block.student_view_data?.poster || undefined} className="subodha-block-video">
        <source src={sources[0]} />
      </video>
    );
  }

  if (block.type === "video" && youtubeId) {
    return (
      <iframe
        className="subodha-block-video subodha-block-video-embed"
        src={`https://www.youtube.com/embed/${youtubeId}`}
        title={block.display_name || "Video"}
        allowFullScreen
      />
    );
  }

  if (block.type === "problem") {
    return <MultipleChoiceProblem block={block} courseId={courseId} onBlockChange={onBlockChange} />;
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
      <div className="subodha-block-html">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.markdown}</ReactMarkdown>
      </div>
    );
  }

  if (block.html) {
    // Fallback for the rare pandoc-conversion-failed case — rendering
    // already-published course content from the source LMS, exactly as it
    // renders on Subodha itself (not user-submitted input).
    return <div className="subodha-block-html" dangerouslySetInnerHTML={{ __html: block.html }} />;
  }

  return <p className="table-cell-secondary">No preview available for this content type.</p>;
}

function BlockCard({ block, courseId, onBlockChange }) {
  if (!block) return null;
  // A generic displayName ("Video", "Multiple Choice", ...) tells the reader
  // nothing the surrounding unit title doesn't already say — skip the
  // redundant label + type badge and keep only the Subodha link.
  const showLabel = !isGenericLabel(block);
  return (
    <div className="subodha-block-card">
      <div className="subodha-block-header">
        {showLabel && (
          <>
            <strong>{block.display_name}</strong>
            <span className="content-type">{block.markdown ? "markdown" : block.type}</span>
          </>
        )}
        {block.lms_url && (
          <a
            href={block.lms_url}
            target="_blank"
            rel="noreferrer"
            className="secondary-button subodha-block-header-action"
          >
            Open in Subodha
          </a>
        )}
      </div>
      <BlockContent block={block} courseId={courseId} onBlockChange={onBlockChange} />
    </div>
  );
}

// edX's default display name is generic per type ("Multiple Choice" for every
// problem, "Video" for every video) — with many blocks sharing that generic
// name, disambiguate repeats as "Multiple Choice 1", "Multiple Choice 2", etc.
// Names the course author actually customized (appearing only once) are left as-is.
function disambiguateLabels(blocks) {
  const totals = {};
  blocks.forEach((b) => {
    const label = b.display_name || b.type;
    totals[label] = (totals[label] || 0) + 1;
  });
  const running = {};
  return blocks.map((b) => {
    const label = b.display_name || b.type;
    if (totals[label] <= 1) return label;
    running[label] = (running[label] || 0) + 1;
    return `${label} ${running[label]}`;
  });
}

// Without outline data we can't group blocks by unit, but stacking every
// video/problem in the whole course on one page isn't usable either. Show
// the full list of blocks up front (all visible, nothing hidden behind a
// toggle) — clicking one opens it full-screen with Previous/Next and a way
// back to the list, mirroring Subodha's own list → unit navigation.
function FlatBlockNavigator({ blocks, courseId, onBlockChange, onBack }) {
  const [index, setIndex] = useState(null);
  const labels = useMemo(() => disambiguateLabels(blocks || []), [blocks]);

  if (!blocks || blocks.length === 0) {
    return <p>No content blocks synced for this course.</p>;
  }

  if (index === null) {
    return (
      <>
        <div className="content-details-actions">
          <button onClick={onBack} className="primary-button">
            ← Back
          </button>
        </div>
        <ul className="subodha-section-list">
          {blocks.map((b, i) => (
            <li key={b.block_id}>
              <button type="button" className="subodha-section-list-item" onClick={() => setIndex(i)}>
                {i + 1}. {labels[i]}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const block = blocks[index];

  return (
    <div>
      <div className="content-details-actions">
        <button type="button" className="primary-button" onClick={() => setIndex(null)}>
          ← Back to list
        </button>
      </div>
      <div className="subodha-pager">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← Previous
        </button>
        <span className="subodha-pager-position">
          {index + 1} / {blocks.length}: {labels[index]}
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setIndex((i) => Math.min(blocks.length - 1, i + 1))}
          disabled={index === blocks.length - 1}
        >
          Next →
        </button>
      </div>
      <BlockCard key={block.block_id} block={block} courseId={courseId} onBlockChange={onBlockChange} />
    </div>
  );
}

// Sibling blocks in the same unit are typically the same content in different
// languages (e.g. "Hindi", "Gujarati") — show one at a time via a picker
// instead of rendering every language's video/content at once.
//
// The untranslated/default variant keeps the xblock's generic display name
// (e.g. displayName "Video" on a block of type "video"), unlike real language
// variants which the course author renamed to the language itself — filter
// those generic ones out of the picker rather than hardcode a language list.
function isGenericLabel(block) {
  const label = (block.display_name || "").trim().toLowerCase();
  return !label || label === block.type.toLowerCase();
}

function LanguageSelectableBlocks({ blocks, courseId, onBlockChange }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!blocks || blocks.length === 0) return null;

  const languageBlocks = blocks.filter((b) => !isGenericLabel(b));
  const options = languageBlocks.length > 0 ? languageBlocks : blocks;

  if (options.length === 1) return <BlockCard block={options[0]} courseId={courseId} onBlockChange={onBlockChange} />;

  return (
    <div className="subodha-language-group">
      <label className="subodha-language-label">
        Language:{" "}
        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          className="subodha-language-select"
        >
          {options.map((b, i) => (
            <option key={b.block_id} value={i}>
              {b.display_name || `${b.type} ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      {/* key forces a full remount on selection change — <video><source> won't
          reload a new src on an existing element without one (browser quirk). */}
      <BlockCard
        key={options[selectedIndex].block_id}
        block={options[selectedIndex]}
        courseId={courseId}
        onBlockChange={onBlockChange}
      />
    </div>
  );
}

// A sequential (lesson) selected from the outline list — shows its units as a
// tab strip (like Subodha's own row of icons) with Previous/Next between
// them, plus a breadcrumb back to the full outline list.
function SequentialPlayer({ chapter, sequential, blockMap, courseId, onBlockChange, onBack }) {
  const [unitIndex, setUnitIndex] = useState(0);
  const verticals = sequential.verticals;
  const vertical = verticals[unitIndex];

  return (
    <div>
      <div className="subodha-breadcrumb">
        <button type="button" className="subodha-breadcrumb-link" onClick={onBack}>
          Course
        </button>
        {" / "}
        {chapter.display_name} / {sequential.display_name}
      </div>
      <div className="subodha-unit-tabs">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setUnitIndex((i) => Math.max(0, i - 1))}
          disabled={unitIndex === 0}
        >
          ← Previous
        </button>
        <div className="subodha-unit-tab-list">
          {verticals.map((v, i) => (
            <button
              key={v.block_id}
              type="button"
              className={i === unitIndex ? "subodha-unit-tab active" : "subodha-unit-tab"}
              title={v.display_name}
              onClick={() => setUnitIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setUnitIndex((i) => Math.min(verticals.length - 1, i + 1))}
          disabled={unitIndex === verticals.length - 1}
        >
          Next →
        </button>
      </div>
      <h4>{vertical.display_name}</h4>
      <LanguageSelectableBlocks
        key={vertical.block_id}
        blocks={vertical.block_ids.map((id) => blockMap[id]).filter(Boolean)}
        courseId={courseId}
        onBlockChange={onBlockChange}
      />
    </div>
  );
}

// Full outline visible at once (chapter cards, each listing its lessons) —
// clicking a lesson opens SequentialPlayer for it. Chapters can be individually
// collapsed, or all at once via "Collapse all" (mirrors Subodha's own outline).
function OutlineNavigator({ outline, blockMap, courseId, onBlockChange, onBackToContent }) {
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  if (selected) {
    const chapter = outline[selected.chapterIdx];
    const sequential = chapter.sequentials[selected.seqIdx];
    return (
      <SequentialPlayer
        chapter={chapter}
        sequential={sequential}
        blockMap={blockMap}
        courseId={courseId}
        onBlockChange={onBlockChange}
        onBack={() => setSelected(null)}
      />
    );
  }

  const allCollapsed = outline.length > 0 && outline.every((chapter) => collapsed[chapter.block_id]);

  const toggleAll = () => {
    setCollapsed(allCollapsed ? {} : Object.fromEntries(outline.map((chapter) => [chapter.block_id, true])));
  };

  const toggleChapter = (blockId) => {
    setCollapsed((prev) => ({ ...prev, [blockId]: !prev[blockId] }));
  };

  return (
    <div className="subodha-outline-list">
      <div className="content-details-actions">
        <button onClick={onBackToContent} className="primary-button">
          ← Back
        </button>
        <button type="button" className="secondary-button" onClick={toggleAll}>
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>
      {outline.map((chapter, chapterIdx) => {
        const isCollapsed = Boolean(collapsed[chapter.block_id]);
        return (
          <div key={chapter.block_id} className="subodha-outline-chapter-card">
            <button
              type="button"
              className="subodha-outline-chapter-header"
              onClick={() => toggleChapter(chapter.block_id)}
            >
              <span className="subodha-outline-check" aria-hidden="true">✓</span>
              <span className="subodha-outline-chapter-title">{chapter.display_name}</span>
              <span className="subodha-outline-toggle" aria-hidden="true">{isCollapsed ? "+" : "−"}</span>
            </button>
            {!isCollapsed && (
              <ul className="subodha-outline-sequential-list">
                {chapter.sequentials.map((seq, seqIdx) => (
                  <li key={seq.block_id}>
                    <button
                      type="button"
                      className="subodha-outline-sequential-item"
                      onClick={() => setSelected({ chapterIdx, seqIdx })}
                    >
                      <span className="subodha-outline-check" aria-hidden="true">✓</span>
                      {seq.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SubodhaCourseDetails = ({ courseId, onBack }) => {
  const [course, setCourse] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await subodhaService.getCourse(courseId);
      setCourse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBlockChange = useCallback((updatedBlock) => {
    setCourse((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.block_id === updatedBlock.block_id ? updatedBlock : b)),
    }));
  }, []);

  if (isLoading) {
    return <p>Loading course content...</p>;
  }

  if (error) {
    return (
      <>
        <div className="content-details-actions">
          <button onClick={onBack} className="primary-button">
            ← Back
          </button>
        </div>
        <p className="content-details-error">Error: {error}</p>
      </>
    );
  }

  if (!course) {
    return (
      <>
        <div className="content-details-actions">
          <button onClick={onBack} className="primary-button">
            ← Back
          </button>
        </div>
        <p>Course not found.</p>
      </>
    );
  }

  const blockMap = Object.fromEntries((course.blocks || []).map((b) => [b.block_id, b]));
  const hasOutline = Array.isArray(course.outline) && course.outline.length > 0;

  return (
    <div className="subodha-course-details">
      <h2>{course.title}</h2>
      <div className="subodha-course-meta">
        <span>{course.org} / {course.course_number}</span>
        {course.language && <span>Language: {getLanguageName(course.language)}</span>}
        <span>Pacing: {course.pacing}</span>
        {course.hidden && <span className="subodha-badge-hidden">Hidden</span>}
      </div>
      {course.description && <p>{course.description}</p>}

      {hasOutline ? (
        <OutlineNavigator
          outline={course.outline}
          blockMap={blockMap}
          courseId={courseId}
          onBlockChange={handleBlockChange}
          onBackToContent={onBack}
        />
      ) : (
        // Fallback for courses synced before outline capture was added: we have
        // no vertical/unit boundaries, so blocks can't be reliably grouped as
        // language variants of "the same" content — list them all instead of
        // guessing (re-sync the course to get outline + real unit grouping).
        <div className="subodha-blocks">
          <FlatBlockNavigator
            blocks={course.blocks || []}
            courseId={courseId}
            onBlockChange={handleBlockChange}
            onBack={onBack}
          />
        </div>
      )}
    </div>
  );
};

export default SubodhaCourseDetails;
