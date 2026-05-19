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

function pickBlock(course, blockSourceId) {
  if (!course) return null;
  for (const sec of course.sections || []) {
    for (const sub of sec.subsections || []) {
      for (const u of sub.units || []) {
        for (const b of u.blocks || []) {
          if (b.sourceId === blockSourceId) return b;
        }
      }
    }
  }
  return null;
}

function replaceBlock(course, blockSourceId, nextBlock) {
  return {
    ...course,
    sections: (course.sections || []).map((sec) => ({
      ...sec,
      subsections: (sec.subsections || []).map((sub) => ({
        ...sub,
        units: (sub.units || []).map((u) => ({
          ...u,
          blocks: (u.blocks || []).map((b) =>
            b.sourceId === blockSourceId ? nextBlock : b
          ),
        })),
      })),
    })),
  };
}

const TYPE_LABEL = { html: "HTML Block", problem: "Quiz Question", video: "Video Block" };

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

function seedDraft(b, lang) {
  if (lang === "english") {
    return {
      displayName: b.displayName || "",
      htmlContent: b.htmlContent || "",
      questionText: b.questionText || "",
      choices: (b.choices || []).map((c) => ({ ...c })),
      explanation: b.explanation || "",
      notes: b.notes || "",
      transcriptText: "",
    };
  }
  const t = (b.translations && b.translations[lang]) || {};
  return {
    displayName: t.displayName || "",
    htmlContent: t.htmlContent || "",
    questionText: t.questionText || "",
    choices: (
      t.choices ||
      (b.choices || []).map((c) => ({ label: "", correct: c.correct }))
    ).map((c) => ({ ...c })),
    explanation: t.explanation || "",
    notes: b.notes || "",
    transcriptText: t.transcriptText || "",
  };
}

const BlockEditor = ({ block, courseId, onSaved }) => {
  const [activeLang, setActiveLang] = useState("english");
  const [draft, setDraft] = useState(() => seedDraft(block, "english"));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ kind: null, msg: "" });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDraft(seedDraft(block, activeLang));
    setStatus({ kind: null, msg: "" });
  }, [block.sourceId, activeLang]); // eslint-disable-line

  async function save() {
    setSaving(true);
    setStatus({ kind: null, msg: "" });
    try {
      if (activeLang === "english") {
        const patch = { displayName: draft.displayName, notes: draft.notes };
        if (block.type === "html") patch.htmlContent = draft.htmlContent;
        if (block.type === "problem") {
          patch.questionText = draft.questionText;
          patch.choices = draft.choices;
          patch.explanation = draft.explanation;
        }
        const r = await subodhaService.patchBlock(courseId, {
          blockSourceId: block.sourceId,
          expectedBlockVersion: block.blockVersion || 1,
          patch,
        });
        onSaved(r.block);
        setStatus({ kind: "ok", msg: "Saved. Block version now " + r.block.blockVersion + "." });
      } else {
        const translation = {};
        if (draft.displayName) translation.displayName = draft.displayName;
        if (block.type === "html") translation.htmlContent = draft.htmlContent;
        if (block.type === "problem") {
          translation.questionText = draft.questionText;
          translation.choices = draft.choices;
          translation.explanation = draft.explanation;
        }
        if (block.type === "video") translation.transcriptText = draft.transcriptText;
        const r = await subodhaService.putTranslation(courseId, {
          blockSourceId: block.sourceId,
          lang: activeLang,
          translation,
          expectedBlockVersion: block.blockVersion || 1,
        });
        onSaved(r.block);
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
      const safeName = `subodha-${block.sourceId.slice(-12)}-${activeLang}-${Date.now()}.mp3`;
      const { sasToken } = await subodhaService.getSasToken(safeName);
      const url = sasToken;
      await fetch(url, {
        method: "PUT",
        headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "audio/mpeg" },
        body: file,
      });
      const audioUrl = url.split("?")[0];
      const r = await subodhaService.putAudio(courseId, {
        blockSourceId: block.sourceId,
        lang: activeLang,
        audioUrl,
      });
      onSaved(r.block);
      setStatus({ kind: "ok", msg: `${activeLang} audio uploaded.` });
    } catch (e) {
      setStatus({ kind: "error", msg: e.message });
    } finally {
      setUploading(false);
    }
  }

  const audioUrl = (block.audioByLang || {})[activeLang] || "";
  const typeClass = `sce-editorType sce-editorType--${block.type}`;

  return (
    <section className="sce-editor" aria-labelledby="sce-block-heading">
      <div className="sce-editorHead">
        <span className={typeClass} id="sce-block-heading">{TYPE_LABEL[block.type] || block.type}</span>
        <code className="sce-editorId" aria-label="Block source id (last 12 chars)">
          {block.sourceId.slice(-12)}
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

        {block.type === "html" && (
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

        {block.type === "problem" && (
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

        {block.type === "video" && (
          <>
            <VideoSasWarning urls={block.html5Sources || []} />
            <dl className="sce-videoMeta">
              <dt>YouTube</dt>
              <dd>
                {block.youtubeUrl ? (
                  <a href={block.youtubeUrl} target="_blank" rel="noreferrer">
                    {block.youtubeUrl}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>HTML5 sources</dt>
              <dd>
                {(block.html5Sources || []).length === 0
                  ? "—"
                  : (block.html5Sources || []).map((u, i) => (
                      <div key={i}><code>{u}</code></div>
                    ))}
              </dd>
              <dt>Transcript URL</dt>
              <dd>{block.transcriptUrl || "—"}</dd>
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

const Tree = ({ course, selected, onSelect }) => (
  <nav className="sce-outline" aria-label="Course outline">
    <h2>Course Outline</h2>
    {(course.sections || []).map((sec, si) => (
      <details className="sce-section" key={sec.sourceId} open={si === 0}>
        <summary>{sec.displayName || "(section)"}</summary>
        {(sec.subsections || []).map((sub) => (
          <details className="sce-subsection" key={sub.sourceId} open>
            <summary>{sub.displayName || "(subsection)"}</summary>
            {(sub.units || []).map((u) => (
              <details className="sce-unit" key={u.sourceId} open>
                <summary>{u.displayName || "(unit)"}</summary>
                <ul className="sce-blocks">
                  {(u.blocks || []).map((b) => (
                    <li key={b.sourceId}>
                      <button
                        type="button"
                        className={`sce-blockBtn ${selected === b.sourceId ? "is-selected" : ""}`}
                        onClick={() => onSelect(b.sourceId)}
                        aria-current={selected === b.sourceId ? "true" : undefined}
                      >
                        <span className={`sce-blockBadge sce-blockBadge--${b.type}`}>
                          {b.type}
                        </span>
                        <span>{b.displayName || b.sourceId.slice(-8)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </details>
        ))}
      </details>
    ))}
  </nav>
);

const SubodhaCourseEditor = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [err, setErr] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    ensureFonts();
    let alive = true;
    subodhaService
      .getCourse(courseId)
      .then((c) => {
        if (!alive) return;
        setCourse(c);
        const first = c?.sections?.[0]?.subsections?.[0]?.units?.[0]?.blocks?.[0];
        if (first) setSelectedId(first.sourceId);
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [courseId]);

  const selected = useMemo(
    () => (selectedId && course ? pickBlock(course, selectedId) : null),
    [selectedId, course]
  );

  function onSaved(nextBlock) {
    setCourse((c) => replaceBlock(c, nextBlock.sourceId, nextBlock));
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
            {course.detectedScripts?.length > 0 && (
              <span>· scripts: {course.detectedScripts.join(", ")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="sce-grid">
        <Tree course={course} selected={selectedId} onSelect={setSelectedId} />
        {selected ? (
          <BlockEditor block={selected} courseId={course._id} onSaved={onSaved} />
        ) : (
          <div className="sce-editor sce-empty">Pick a block in the outline to begin editing.</div>
        )}
      </div>

      <footer className="sce-footer">
        Source: Subodha LMS · <code>{course.source?.courseId}</code> · imported{" "}
        {course.source?.importedAt ? new Date(course.source.importedAt).toLocaleString() : "—"}
      </footer>
    </main>
  );
};

export default SubodhaCourseEditor;
