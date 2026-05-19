import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { subodhaService, SUBODHA_LANGUAGES } from "../services/subodhaService";
import "./SubodhaCourseEditor.css";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;600;700&display=swap";

function ensureFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById("sce-fonts")) return;
  const link = document.createElement("link");
  link.id = "sce-fonts";
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

const sanitize = (html) =>
  DOMPurify.sanitize(html || "", { USE_PROFILES: { html: true } });

const BLOCK_LABEL = { html: "HTML Block", quiz: "Quiz Question", video: "Video Block" };

const VideoSasWarning = ({ urls }) => {
  if (!Array.isArray(urls) || urls.length === 0) return null;
  const now = Date.now();
  const stale = urls.find((u) => {
    const m = /[?&]se=([^&]+)/.exec(u || "");
    if (!m) return false;
    const t = Date.parse(decodeURIComponent(m[1]));
    return Number.isFinite(t) && t < now;
  });
  if (!stale) return null;
  return (
    <div className="sce-alert sce-alert--warn" role="status">
      Azure SAS URL has expired. Playback would fail. Mirror to SEEDS blob via the Asset Worker (Phase 2).
    </div>
  );
};

function seedDraft(block, lang) {
  const body = (block && block.body) || {};
  if (lang === "english") {
    return {
      displayName: block.displayName || "",
      htmlContent: body.htmlContent || "",
      questionText: body.questionText || "",
      choices: (body.choices || []).map((c) => ({ ...c })),
      explanation: body.explanation || "",
      notes: block.notes || "",
      transcriptText: "",
    };
  }
  const t = (block.translations && block.translations[lang]) || {};
  return {
    displayName: t.displayName || "",
    htmlContent: t.htmlContent || "",
    questionText: t.questionText || "",
    choices: (
      t.choices || (body.choices || []).map((c) => ({ label: "", correct: c.correct }))
    ).map((c) => ({ ...c })),
    explanation: t.explanation || "",
    notes: block.notes || "",
    transcriptText: t.transcriptText || "",
  };
}

const BlockEditor = ({ block, seedsBlockId, courseId, onSaved }) => {
  const [activeLang, setActiveLang] = useState("english");
  const [draft, setDraft] = useState(() => seedDraft(block, "english"));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ kind: null, msg: "" });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDraft(seedDraft(block, activeLang));
    setStatus({ kind: null, msg: "" });
  }, [seedsBlockId, activeLang]); // eslint-disable-line

  const blockType = block.blockType || "html";

  async function save() {
    setSaving(true);
    setStatus({ kind: null, msg: "" });
    try {
      const expectedBlockVersion = block.blockVersion || 1;
      if (activeLang === "english") {
        const patch = { displayName: draft.displayName, notes: draft.notes };
        if (blockType === "html") patch.htmlContent = draft.htmlContent;
        if (blockType === "quiz") {
          patch.questionText = draft.questionText;
          patch.choices = draft.choices;
          patch.explanation = draft.explanation;
        }
        const r = await subodhaService.patchBlock(courseId, {
          seedsBlockId,
          expectedBlockVersion,
          patch,
        });
        onSaved(seedsBlockId, {
          ...block,
          displayName: patch.displayName ?? block.displayName,
          notes: patch.notes ?? block.notes,
          body: {
            ...(block.body || {}),
            ...(blockType === "html" ? { htmlContent: patch.htmlContent } : {}),
            ...(blockType === "quiz"
              ? {
                  questionText: patch.questionText,
                  choices: patch.choices,
                  explanation: patch.explanation,
                }
              : {}),
          },
          blockVersion: r.blockVersion || expectedBlockVersion + 1,
        });
        setStatus({ kind: "ok", msg: `Saved. Block version now ${r.blockVersion || expectedBlockVersion + 1}.` });
      } else {
        const translation = {};
        if (draft.displayName) translation.displayName = draft.displayName;
        if (blockType === "html") translation.htmlContent = draft.htmlContent;
        if (blockType === "quiz") {
          translation.questionText = draft.questionText;
          translation.choices = draft.choices;
          translation.explanation = draft.explanation;
        }
        if (blockType === "video") translation.transcriptText = draft.transcriptText;
        await subodhaService.putTranslation(courseId, {
          seedsBlockId,
          lang: activeLang,
          translation,
          expectedBlockVersion,
        });
        onSaved(seedsBlockId, {
          ...block,
          translations: {
            ...(block.translations || {}),
            [activeLang]: translation,
          },
          blockVersion: expectedBlockVersion + 1,
        });
        setStatus({ kind: "ok", msg: `Saved ${activeLang} translation.` });
      }
    } catch (e) {
      const msg =
        e.response && e.response.status === 409
          ? "Another editor saved this block first. Reload before continuing."
          : e.message;
      setStatus({ kind: "error", msg });
    } finally {
      setSaving(false);
    }
  }

  async function uploadAudio(file) {
    setUploading(true);
    setStatus({ kind: null, msg: "" });
    try {
      const safeName = `imported-${seedsBlockId.slice(0, 8)}-${activeLang}-${Date.now()}.mp3`;
      const { sasToken } = await subodhaService.getSasToken(safeName);
      const url = sasToken;
      await fetch(url, {
        method: "PUT",
        headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "audio/mpeg" },
        body: file,
      });
      const audioUrl = url.split("?")[0];
      await subodhaService.putAudio(courseId, {
        seedsBlockId,
        lang: activeLang,
        audioUrl,
      });
      onSaved(seedsBlockId, {
        ...block,
        audioByLang: { ...(block.audioByLang || {}), [activeLang]: audioUrl },
        blockVersion: (block.blockVersion || 1) + 1,
      });
      setStatus({ kind: "ok", msg: `${activeLang} audio uploaded.` });
    } catch (e) {
      setStatus({ kind: "error", msg: e.message });
    } finally {
      setUploading(false);
    }
  }

  const audioUrl = (block.audioByLang || {})[activeLang] || "";
  const typeClass = `sce-editorType sce-editorType--${blockType}`;
  const body = block.body || {};
  const videoSources = body.videoSources || [];

  return (
    <section className="sce-editor" aria-labelledby="sce-block-heading">
      <div className="sce-editorHead">
        <span className={typeClass} id="sce-block-heading">{BLOCK_LABEL[blockType] || blockType}</span>
        <code className="sce-editorId" aria-label="Block id (first 8 chars)">
          {seedsBlockId.slice(0, 8)}
        </code>
        <span className="sce-editorVersion" aria-label={`Block version ${block.blockVersion || 1}`}>
          v{block.blockVersion || 1}
        </span>
      </div>

      <ul className="sce-tablist" role="tablist" aria-label="Language">
        {SUBODHA_LANGUAGES.map((l) => (
          <li key={l} role="presentation">
            <button
              type="button"
              role="tab"
              className="sce-tab"
              aria-selected={activeLang === l}
              aria-controls="sce-tabpanel"
              tabIndex={activeLang === l ? 0 : -1}
              onClick={() => setActiveLang(l)}
            >
              {l === "english" ? "English (source)" : l}
            </button>
          </li>
        ))}
      </ul>

      <div role="tabpanel" id="sce-tabpanel" aria-labelledby="sce-block-heading">
        <div className="sce-field">
          <label className="sce-fieldLabel" htmlFor="sce-displayName">Display name</label>
          <input
            id="sce-displayName"
            type="text"
            className="sce-input"
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
          />
        </div>

        {blockType === "html" && (
          <>
            <div className="sce-field">
              <label className="sce-fieldLabel" htmlFor="sce-html">
                HTML content {activeLang !== "english" && `(${activeLang})`}
              </label>
              <textarea
                id="sce-html"
                className="sce-textarea sce-textarea--mono"
                value={draft.htmlContent}
                onChange={(e) => setDraft({ ...draft, htmlContent: e.target.value })}
                aria-describedby="sce-html-help"
              />
              <small id="sce-html-help" className="sce-saveStatus">
                Raw HTML. Tags like <code>&lt;script&gt;</code> and event handlers are stripped on save.
              </small>
            </div>
            <div className="sce-preview" role="region" aria-label="Sanitized preview">
              <div className="sce-previewLabel">Preview</div>
              <div
                className="sce-previewBody"
                dangerouslySetInnerHTML={{ __html: sanitize(draft.htmlContent) }}
              />
            </div>
          </>
        )}

        {blockType === "quiz" && (
          <>
            <div className="sce-field">
              <label className="sce-fieldLabel" htmlFor="sce-question">Question</label>
              <textarea
                id="sce-question"
                className="sce-textarea"
                rows={3}
                value={draft.questionText}
                onChange={(e) => setDraft({ ...draft, questionText: e.target.value })}
              />
            </div>
            <div className="sce-field">
              <span className="sce-fieldLabel">Choices (tick the correct ones)</span>
              <div className="sce-choices" role="group" aria-label="Answer choices">
                {(draft.choices || []).map((c, i) => (
                  <label className="sce-choice" key={i}>
                    <input
                      type="checkbox"
                      checked={!!c.correct}
                      onChange={(e) => {
                        const next = [...draft.choices];
                        next[i] = { ...next[i], correct: e.target.checked };
                        setDraft({ ...draft, choices: next });
                      }}
                      aria-label={`Choice ${i + 1} correct`}
                    />
                    <input
                      type="text"
                      value={c.label || ""}
                      onChange={(e) => {
                        const next = [...draft.choices];
                        next[i] = { ...next[i], label: e.target.value };
                        setDraft({ ...draft, choices: next });
                      }}
                      aria-label={`Choice ${i + 1} text`}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="sce-field">
              <label className="sce-fieldLabel" htmlFor="sce-explanation">Explanation</label>
              <textarea
                id="sce-explanation"
                className="sce-textarea"
                rows={3}
                value={draft.explanation}
                onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
              />
            </div>
          </>
        )}

        {blockType === "video" && (
          <>
            <VideoSasWarning urls={videoSources} />
            <dl className="sce-videoMeta">
              <dt>YouTube</dt>
              <dd>
                {body.youtubeUrl ? (
                  <a href={body.youtubeUrl} target="_blank" rel="noreferrer">
                    {body.youtubeUrl}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Video sources</dt>
              <dd>
                {videoSources.length === 0
                  ? "—"
                  : videoSources.map((u, i) => (
                      <div key={i}><code>{u}</code></div>
                    ))}
              </dd>
              <dt>Transcript URL</dt>
              <dd>{body.transcriptUrl || "—"}</dd>
            </dl>
            {activeLang !== "english" && (
              <div className="sce-field">
                <label className="sce-fieldLabel" htmlFor="sce-transcript">
                  Transcript ({activeLang})
                </label>
                <textarea
                  id="sce-transcript"
                  className="sce-textarea"
                  rows={6}
                  value={draft.transcriptText}
                  onChange={(e) => setDraft({ ...draft, transcriptText: e.target.value })}
                />
              </div>
            )}
          </>
        )}

        <div className="sce-field sce-fileWrap">
          <label className="sce-fieldLabel" htmlFor="sce-audio">Audio ({activeLang})</label>
          {audioUrl && (
            <a className="sce-audioLink" href={audioUrl} target="_blank" rel="noreferrer">
              {audioUrl.split("/").pop()}
            </a>
          )}
          <input
            id="sce-audio"
            type="file"
            accept="audio/mpeg,.mp3"
            disabled={uploading}
            onChange={(e) => e.target.files && e.target.files[0] && uploadAudio(e.target.files[0])}
          />
          {uploading && <small className="sce-saveStatus">Uploading…</small>}
        </div>

        <div className="sce-field">
          <label className="sce-fieldLabel" htmlFor="sce-notes">Editor notes (private)</label>
          <textarea
            id="sce-notes"
            className="sce-textarea"
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </div>
      </div>

      <div className="sce-savebar">
        <div
          className="sce-saveStatus"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {status.kind === "error" ? (
            <span style={{ color: "var(--sce-error)" }}>{status.msg}</span>
          ) : status.kind === "ok" ? (
            <span style={{ color: "var(--sce-ok)" }}>{status.msg}</span>
          ) : saving ? (
            "Saving…"
          ) : (
            "Unsaved changes are kept locally until you click Save."
          )}
        </div>
        <button
          type="button"
          className="sce-saveBtn"
          disabled={saving}
          onClick={save}
        >
          {saving
            ? "Saving…"
            : activeLang === "english"
            ? "Save block"
            : `Save ${activeLang} translation`}
        </button>
      </div>
    </section>
  );
};

// Recursive tree renderer — walks the structure-only `tree` from doc.imported.tree.
// Containers nest via `children`; leaves are `kind === "block"` with `_seedsBlockId` ref.
const TreeNode = ({ node, depth, blocks, selectedId, onSelect, defaultOpen }) => {
  if (node.kind === "block") {
    const b = blocks[node._seedsBlockId] || {};
    const blockType = b.blockType || "html";
    const label = node.displayName || b.displayName || node.sourceId.slice(-8);
    return (
      <li>
        <button
          type="button"
          className={`sce-blockBtn ${selectedId === node._seedsBlockId ? "is-selected" : ""}`}
          onClick={() => onSelect(node._seedsBlockId)}
          aria-current={selectedId === node._seedsBlockId ? "true" : undefined}
        >
          <span className={`sce-blockBadge sce-blockBadge--${blockType}`}>{blockType}</span>
          <span>{label}</span>
        </button>
      </li>
    );
  }
  const Tag = depth === 0 ? "details" : "details";
  const cls =
    depth === 0 ? "sce-section" : depth === 1 ? "sce-subsection" : "sce-unit";
  return (
    <Tag className={cls} open={defaultOpen}>
      <summary>{node.displayName || "(container)"}</summary>
      {(node.children || []).every((c) => c.kind === "block") ? (
        <ul className="sce-blocks">
          {(node.children || []).map((c) => (
            <TreeNode
              key={c._seedsBlockId}
              node={c}
              depth={depth + 1}
              blocks={blocks}
              selectedId={selectedId}
              onSelect={onSelect}
              defaultOpen
            />
          ))}
        </ul>
      ) : (
        (node.children || []).map((c) => (
          <TreeNode
            key={c._seedsBlockId}
            node={c}
            depth={depth + 1}
            blocks={blocks}
            selectedId={selectedId}
            onSelect={onSelect}
            defaultOpen
          />
        ))
      )}
    </Tag>
  );
};

const Tree = ({ tree, blocks, selectedId, onSelect }) => (
  <nav className="sce-outline" aria-label="Course outline">
    <h2>Course Outline</h2>
    {(tree || []).map((root, i) => (
      <TreeNode
        key={root._seedsBlockId}
        node={root}
        depth={0}
        blocks={blocks}
        selectedId={selectedId}
        onSelect={onSelect}
        defaultOpen={i === 0}
      />
    ))}
  </nav>
);

// Find first leaf block's _seedsBlockId in pre-order.
function firstLeafId(nodes) {
  for (const n of nodes || []) {
    if (n.kind === "block") return n._seedsBlockId;
    const hit = firstLeafId(n.children);
    if (hit) return hit;
  }
  return null;
}

const SubodhaCourseEditor = () => {
  const navigate = useNavigate();
  const { courseId: routeCourseId, id: routeId } = useParams();
  const courseId = routeCourseId || routeId;
  const [course, setCourse] = useState(null);
  const [err, setErr] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    ensureFonts();
    let alive = true;
    subodhaService
      .getCourse(courseId)
      .then((doc) => {
        if (!alive) return;
        const sc = doc?.imported || {};
        const adapted = {
          _id: doc?._id,
          courseName: doc?.title?.english || sc?.source?.courseCode || "",
          language: doc?.language || "",
          detectedScripts: sc.detectedScripts || [],
          status: sc.status,
          source: {
            courseId: doc?.sourceContentId || doc?.sourceCourseId,
            importedAt: sc?.source?.importedAt || doc?.lastSyncedAt,
            org: sc?.source?.org,
            run: sc?.source?.run,
            platform: doc?.sourcePlatform,
          },
          tree: sc.tree || [],
          blocks: sc.blocks || {},
        };
        setCourse(adapted);
        const first = firstLeafId(adapted.tree);
        if (first) setSelectedId(first);
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [courseId]);

  const selectedBlock = useMemo(() => {
    if (!course || !selectedId) return null;
    return course.blocks[selectedId] || null;
  }, [selectedId, course]);

  function onSaved(seedsBlockId, nextBlock) {
    setCourse((c) => ({
      ...c,
      blocks: { ...c.blocks, [seedsBlockId]: nextBlock },
    }));
  }

  if (err) {
    return (
      <div className="sce-root">
        <div className="sce-alert sce-alert--error">Failed to load: {err}</div>
      </div>
    );
  }
  if (!course) return <div className="sce-root">Loading…</div>;

  return (
    <main className="sce-root">
      <div className="sce-topbar">
        <button type="button" className="sce-back" onClick={() => navigate("/content")}>
          ← Back to Content
        </button>
        <div>
          <h1 className="sce-courseTitle">{course.courseName}</h1>
          <div className="sce-courseMeta">
            <code>{course.source?.courseId}</code>
            <span>· {course.language}</span>
            {course.source?.platform && <span>· {course.source.platform}</span>}
            {course.detectedScripts?.length > 0 && (
              <span>· scripts: {course.detectedScripts.join(", ")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="sce-grid">
        <Tree
          tree={course.tree}
          blocks={course.blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selectedBlock && selectedId ? (
          <BlockEditor
            block={selectedBlock}
            seedsBlockId={selectedId}
            courseId={course._id}
            onSaved={onSaved}
          />
        ) : (
          <div className="sce-editor sce-empty">Pick a block in the outline to begin editing.</div>
        )}
      </div>

      <footer className="sce-footer">
        Source: {course.source?.platform || "—"} ·{" "}
        <code>{course.source?.courseId}</code> · imported{" "}
        {course.source?.importedAt
          ? new Date(course.source.importedAt).toLocaleString()
          : "—"}
      </footer>
    </main>
  );
};

export default SubodhaCourseEditor;
