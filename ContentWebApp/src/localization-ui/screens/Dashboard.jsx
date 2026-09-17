import React, { useState } from "react";
import "../../components/AllContent/shared/cards.css";
import "../../components/AllContent/shared/buttons.css";
import "../../components/AllContent/shared/utilities.css";
import "../../components/AllContent/AnalyticsTab/css/AnalyticsTab.css";
import { useToast } from "../Toast";
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet || "");
      toast({ message: "Snippet copied", tone: "good" });
    } catch {
      toast({ message: "Copy failed", tone: "crit" });
    }
  };

  return (
    <div>
      <button type="button" className="action-ghost-button" onClick={copy}>
        Copy Snippet
      </button>
      <pre>
        <code>{snippet}</code>
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
  const script = buildDevToolsScript(siteId);

  return (
    <details>
      <summary className="label">Developer Testing (Chrome DevTools)</summary>
      <div className="registration-flex-card" style={{ marginTop: 12 }}>
        <p className="placeholder-text">
          If you're testing on a third-party website (for example <code>microsoft.com</code>) and
          cannot modify its HTML, you can temporarily inject the SDK using the{" "}
          <strong>Chrome DevTools Console</strong>.
        </p>

        <ol className="placeholder-text">
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

        <SnippetBlock snippet={script} />

        <p className="placeholder-text">
          <strong>Development only.</strong> This script injects the SDK only into the{" "}
          <strong>current browser tab</strong>. Refreshing or navigating away from the page
          removes the injected SDK. For production deployments, always install the HTML snippet
          before the closing <code>&lt;/body&gt;</code> tag.
        </p>
      </div>
    </details>
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
      <div className="card registration-flex-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Website Connected</h2>
            <p className="card-description">Your website has been registered successfully.</p>
          </div>
        </div>

        <div>
          <span className="label">Domain</span>
          <p><code>{result.domain}</code></p>
          <span className="label">Integration Status</span>
          <p className="success-message">Ready to install SDK</p>
        </div>

        <SnippetBlock snippet={result.snippet} />

        <div>
          <span className="label">How to install</span>
          <ol className="placeholder-text">
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

        <div className="button-group">
          <button type="button" className="primary-button" onClick={copySnippet}>
            Copy Snippet
          </button>
          <button
            className="action-ghost-button"
            type="button"
            onClick={() =>
              window.open("https://docs.example.com/sdk", "_blank", "noopener,noreferrer")
            }
          >
            View Documentation
          </button>
          <button className="action-ghost-button" type="button" onClick={reset}>
            Register Another Website
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h1 className="card-title">Connect your website</h1>
          <p className="card-description">Register your website and start localizing it in minutes.</p>
        </div>
      </div>
      <form className="registration-flex-card" onSubmit={register}>
        <label className="label" htmlFor="onb-domain">Website URL</label>
        <input
          id="onb-domain"
          className="input-field"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="https://example.com"
        />
        {error ? <p className="error-message">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={!domain.trim() || busy}>
          {busy ? "Registering…" : "Register Website"}
        </button>
      </form>
    </div>
  );
}

export function DashboardScreen({ loc }) {
  return (
    <div className="registration-flex-card">
      <OnboardingCard loc={loc} />
      <ManageScreen nav="sites" loc={loc} />
    </div>
  );
}

export default DashboardScreen;
