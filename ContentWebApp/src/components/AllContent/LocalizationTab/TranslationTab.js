import React, { useMemo, useState } from "react";
import ReviewWorkspace from "./ReviewWorkspace";
import { contentService } from "../../../services/contentService";
import { translationService } from "../../../services/translationService";

// Mirror of the runtime SDK's hashText (public/sdk.js) so the phrase keys we
// persist here match exactly what the SDK produces on the live website — the
// same (siteId, route, key) records back both flows.
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return "t" + Math.abs(hash).toString(36);
}

function isTranslatable(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  if (/^[\d\s.,%$₹-]+$/.test(trimmed)) return false;
  return true;
}

const STEPS = [
  { key: "extract", label: "Extract content" },
  { key: "translate", label: "AI translation" },
  { key: "review", label: "Ready for review" },
];

const STEP_STYLE = {
  done: { dot: "#10B981", text: "#065F46", mark: "✓" },
  active: { dot: "#3B82F6", text: "#1E3A8A", mark: "…" },
  error: { dot: "#EF4444", text: "#991B1B", mark: "✕" },
  pending: { dot: "#D1D5DB", text: "#6B7280", mark: "" },
};

const TranslationTab = ({ projects = [], sites = [], languages = [] }) => {
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Hindi");

  const [isTranslating, setIsTranslating] = useState(false);
  const [stepStatus, setStepStatus] = useState({});
  const [warning, setWarning] = useState("");

  const [phrases, setPhrases] = useState([]);
  const [selectedTranslationId, setSelectedTranslationId] = useState(null);
  const [showReview, setShowReview] = useState(false);

  const targetLanguageCode = useMemo(
    () => languages.find((l) => l.name === targetLanguage)?.code || "",
    [languages, targetLanguage]
  );

  const projectSites = useMemo(() => {
    if (!selectedProject) return [];
    return sites.filter((s) => String(s.projectId) === String(selectedProject));
  }, [sites, selectedProject]);

  const setStep = (key, status) =>
    setStepStatus((prev) => ({ ...prev, [key]: status }));

  const resetRun = () => {
    setWarning("");
    setStepStatus({});
    setPhrases([]);
    setSelectedTranslationId(null);
    setShowReview(false);
  };

  const handleTranslate = async () => {
    if (!selectedProject) return alert("Please select a project.");
    if (!selectedSite) return alert("Please select a website.");

    const site = sites.find((s) => String(s.id) === String(selectedSite));
    if (!site) return alert("Website not found.");
    if (!targetLanguageCode) return alert("Selected language has no code configured.");

    const siteId = String(site.siteId || site.id);
    resetRun();
    setIsTranslating(true);

    // 1) Extract real content from the website (server-side fetch + parse).
    setStep("extract", "active");
    let lines = [];
    try {
      const resp = await contentService.extractWebsite(site.url || site.domain);
      lines = Array.from(
        new Set((resp.content || []).map((t) => (t || "").trim()).filter(isTranslatable))
      );
    } catch (error) {
      setStep("extract", "error");
      setIsTranslating(false);
      setWarning(error.message || "Website extraction failed.");
      return;
    }
    if (lines.length === 0) {
      setStep("extract", "error");
      setIsTranslating(false);
      setWarning(
        "No translatable text was found. The website may be a client-side rendered SPA. For SPAs, use the injected SDK on the live site instead."
      );
      return;
    }

    // Persist one real, reviewable record per phrase (dedup by content key).
    const items = lines.map((text) => ({
      key: hashText(text),
      text,
      route: "/",
      sourceLang: "en",
    }));
    try {
      await translationService.extractItems(siteId, items);
    } catch (error) {
      setStep("extract", "error");
      setIsTranslating(false);
      setWarning(error.message || "Failed to store extracted content.");
      return;
    }
    setStep("extract", "done");

    // 2) AI translation (runtime endpoint generates + stores missing phrases).
    setStep("translate", "active");
    try {
      await translationService.getRuntimeTranslations(siteId, "/", targetLanguageCode);
    } catch (error) {
      setStep("translate", "error");
      setIsTranslating(false);
      setWarning(error.message || "Translation failed.");
      return;
    }
    setStep("translate", "done");

    // 3) Resolve reviewable records -> Review Workspace always gets a valid id.
    setStep("review", "active");
    try {
      const docs = await translationService.listTranslations({ siteId, route: "/" });
      if (!docs || docs.length === 0) {
        setStep("review", "error");
        setIsTranslating(false);
        setWarning("No translation records were created for this website.");
        return;
      }
      setPhrases(docs.map((d) => ({ id: d.id, sourceText: d.sourceText })));
      setSelectedTranslationId(docs[0].id);
      setShowReview(true);
      setStep("review", "done");
    } catch (error) {
      setStep("review", "error");
      setWarning(error.message || "Failed to load translation records.");
    } finally {
      setIsTranslating(false);
    }
  };

  const hasRun = Object.keys(stepStatus).length > 0;

  return (
    <div className="table-container">
      <h2>Translate a Website</h2>
      <p className="tt-subtitle">
        Extract a registered website, generate AI translations, and review them —
        all in one place.
      </p>

      <div className="tt-form-grid">
        <div className="tt-field">
          <label>Project</label>
          <select
            className="search-box"
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setSelectedSite("");
              resetRun();
            }}
          >
            <option value="">Select Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="tt-field">
          <label>Website</label>
          <select
            className="search-box"
            value={selectedSite}
            onChange={(e) => {
              setSelectedSite(e.target.value);
              resetRun();
            }}
          >
            <option value="">Select Website</option>
            {projectSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="tt-field">
          <label>Source Language</label>
          <input className="search-box" value="English" readOnly />
        </div>

        <div className="tt-field">
          <label>Target Language</label>
          <select
            className="search-box"
            value={targetLanguage}
            onChange={(e) => {
              setTargetLanguage(e.target.value);
              resetRun();
            }}
          >
            {languages.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="primary-btn tt-translate-btn"
        onClick={handleTranslate}
        disabled={isTranslating}
      >
        {isTranslating ? "Translating…" : "Translate Website"}
      </button>

      {warning && <div className="tt-warning">{warning}</div>}

      {/* Progress stepper (replaces the old pipeline text list + blob preview) */}
      {hasRun && (
        <div className="tt-stepper">
          {STEPS.map((step) => {
            const s = STEP_STYLE[stepStatus[step.key] || "pending"];
            return (
              <div key={step.key} className="tt-step">
                <span className="tt-step-dot" style={{ background: s.dot }}>
                  {s.mark}
                </span>
                <span className="tt-step-label" style={{ color: s.text }}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Workspace — the single central review experience */}
      {showReview && selectedTranslationId && (
        <div className="tt-review">
          {phrases.length > 1 && (
            <div className="tt-phrase-picker">
              <label>Phrase to review</label>
              <select
                className="search-box"
                value={selectedTranslationId}
                onChange={(e) => setSelectedTranslationId(e.target.value)}
              >
                {phrases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sourceText.length > 80
                      ? `${p.sourceText.slice(0, 80)}…`
                      : p.sourceText}
                  </option>
                ))}
              </select>
            </div>
          )}

          <ReviewWorkspace
            key={selectedTranslationId}
            translationId={selectedTranslationId}
            lang={targetLanguageCode}
            onApprove={() => {}}
          />
        </div>
      )}
    </div>
  );
};

export default TranslationTab;
