import React, { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RotateCw,
} from "lucide-react";
import "../dashboard.css";
import { Field, Input, useToast } from "../primitives";
import { ManageScreen } from "./Manage";
import { extractDomain } from "../lib/url";

function parseApiErrorMessage(err) {
  const raw = err?.message || "";
  try {
    const parsed = JSON.parse(raw);
    return parsed.message || parsed.error || raw;
  } catch {
    return raw;
  }
}

function SnippetBlock({ snippet }) {
  const { toast } = useToast();
  const lines = String(snippet || "").split("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet || "");
      toast({ message: "Snippet copied", tone: "good" });
    } catch {
      toast({ message: "Copy failed", tone: "crit" });
    }
  };

  return (
    <div className="onb-code">
      <button type="button" className="onb-code-copy" onClick={copy} aria-label="Copy snippet">
        <Copy size={14} />
      </button>
      <pre className="onb-code-pre">
        {lines.map((line, i) => (
          <span className="onb-code-line" key={i}>
            <span className="onb-code-num">{i + 1}</span>
            <span className="onb-code-text">{line}</span>
          </span>
        ))}
      </pre>
    </div>
  );
}

const buildDevToolsScript = (siteId) =>
  [
    "const s = document.createElement(\"script\");",
    "s.src = \"http://localhost:3000/sdk.js\";",
    `s.dataset.siteId = "${siteId}";`,
    "s.dataset.apiBase = \"http://localhost:3000\";",
    "document.body.appendChild(s);",
  ].join("\n");

function DevToolsSection({ siteId }) {
  const [open, setOpen] = useState(false);
  const script = buildDevToolsScript(siteId);

  return (
    <div className="onb-dev-section">
      <button
        type="button"
        className="onb-dev-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Code2 size={15} />
        <span>Developer Testing (Chrome DevTools)</span>
        <ChevronDown size={16} className={`onb-dev-chev ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="onb-dev-body">
          <p className="onb-dev-desc">
            If you're testing on a third-party website (for example <code>microsoft.com</code>) and
            cannot modify its HTML, you can temporarily inject the SDK using the{" "}
            <strong>Chrome DevTools Console</strong>.
          </p>

          <div className="onb-dev-steps">
            <div className="onb-steps-title">Steps</div>
            <ol>
              <li>Open the target website in Chrome.</li>
              <li>
                Press <code>F12</code> (or <code>Ctrl + Shift + I</code>) to open Chrome DevTools.
              </li>
              <li>
                Open the <strong>Console</strong> tab.
              </li>
              <li>
                Paste the JavaScript below and press <strong>Enter</strong>.
              </li>
              <li>Verify that the SDK loads successfully.</li>
            </ol>
          </div>

          <SnippetBlock snippet={script} />

          <div className="onb-dev-warn">
            <AlertTriangle size={15} />
            <div>
              <div className="onb-dev-warn-title">Development only</div>
              <p>
                This script injects the SDK only into the <strong>current browser tab</strong>.
                Refreshing or navigating away from the page removes the injected SDK. For production
                deployments, always install the HTML snippet before the closing{" "}
                <code>&lt;/body&gt;</code> tag.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_PROJECT_NAME = "Default Project";

function OnboardingCard({ loc }) {
  const { toast } = useToast();
  const { projects } = loc;
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // Project selection is not user-facing: every site still needs a
  // projectId server-side, so resolve one transparently — reuse the first
  // existing project, or auto-create a single default project on first use.
  const resolveProjectId = async () => {
    if (projects.length) return projects[0].id;
    const created = await loc.handleCreateProject({
      name: DEFAULT_PROJECT_NAME,
      description: "",
      sourceLanguage: "English",
      status: "Active",
    });
    return created.id;
  };

  const register = async (e) => {
    e.preventDefault();
    if (!domain.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const projectId = await resolveProjectId();
      const site = await loc.handleCreateSite({
        projectId,
        domain: extractDomain(domain.trim()),
        name: "",
        status: "Active",
      });
      setResult(site);
    } catch (err) {
      const friendly = parseApiErrorMessage(err) || "Failed to register website";
      setError(friendly);
      toast({ message: friendly, tone: "crit" });
    } finally {
      setBusy(false);
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(result.snippet || "");
      toast({ message: "Snippet copied", tone: "good" });
    } catch {
      toast({ message: "Copy failed", tone: "crit" });
    }
  };

  const reset = () => {
    setResult(null);
    setDomain("");
    setError("");
  };

  if (result) {
    return (
      <div className="onb-card">
        <div className="onb-success-head">
          <span className="onb-success-icon">
            <Check size={20} />
          </span>
          <div>
            <div className="onb-success-title">Website Connected</div>
            <div className="onb-sub">Your website has been registered successfully.</div>
          </div>
        </div>

        <div className="onb-meta">
          <div className="onb-meta-col">
            <span className="onb-meta-label">Domain</span>
            <span className="onb-meta-value mono">{result.domain}</span>
          </div>
          <div className="onb-meta-col">
            <span className="onb-meta-label">Integration Status</span>
            <span className="onb-meta-value onb-meta-good">Ready to install SDK</span>
          </div>
        </div>

        <SnippetBlock snippet={result.snippet} />

        <div className="onb-steps">
          <div className="onb-steps-title">How to install</div>
          <ol>
            <li>Open your website's HTML file (or template layout used on every page).</li>
            <li>
              Paste the snippet above right before the closing <code>&lt;/body&gt;</code> tag.
            </li>
            <li>
              Deploy/publish your site. This is an HTML tag, not a browser console command — it
              won't run if pasted into DevTools.
            </li>
            <li>
              Reload the live page — the SDK loads automatically and starts serving translated
              content.
            </li>
          </ol>
        </div>

        <DevToolsSection siteId={result.siteId} />

        <div className="onb-actions">
          <button className="primary-button" onClick={copySnippet}>
            <Copy size={15} /> Copy Snippet
          </button>
          <button
            className="action-ghost-button"
            type="button"
            onClick={() =>
              window.open("https://docs.example.com/sdk", "_blank", "noopener,noreferrer")
            }
          >
            <BookOpen size={15} /> View Documentation <ExternalLink size={13} />
          </button>
          <button className="action-ghost-button" type="button" onClick={reset}>
            <RotateCw size={15} /> Register Another Website
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onb-card">
      <div className="onb-head">
        <h1 className="onb-title">Connect your website</h1>
        <p className="onb-sub">Register your website and start localizing it in minutes.</p>
      </div>
      <form className="onb-form" onSubmit={register}>
        <Field label="Website URL" error={error || undefined}>
          <span className="onb-input-icon">
            <Globe size={15} />
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="https://example.com"
            />
          </span>
        </Field>
        <button className="primary-button" type="submit" disabled={!domain.trim() || busy}>
          {busy ? <Loader2 size={16} className="spin" /> : null} Register Website
        </button>
      </form>
    </div>
  );
}

export function DashboardScreen({ loc }) {
  return (
    <div className="onb-page">
      <OnboardingCard loc={loc} />
      <ManageScreen nav="sites" loc={loc} />
    </div>
  );
}

export default DashboardScreen;
