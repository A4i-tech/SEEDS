import React, { useState } from "react";
import "../shared/cards.css";
import "../shared/buttons.css";
import "../shared/utilities.css";
import "../AnalyticsTab/css/AnalyticsTab.css";
import { useToast } from "./Toast";
import { SnippetBlock } from "./SnippetBlock";
import { DevToolsSection } from "./DevToolsSection";
import { extractDomain } from "../../../utils/url";

export function OnboardingCard({ loc }) {
  const { toast } = useToast();
  const { projects, workspaceLoadError } = loc;
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const resolveProjectId = async () => {
    if (projects.length) return projects[0].id;
    throw workspaceLoadError || new Error("No project available to register the website under");
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
      const friendly = err?.message || "Failed to register website";
      setError(friendly);
      toast({ message: friendly, tone: "crit" });
    } finally {
      setBusy(false);
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
        {error && <p className="error-message">{error}</p>}
        <button className="primary-button" type="submit" disabled={!domain.trim() || busy}>
          {busy ? "Registering…" : "Register Website"}
        </button>
      </form>
    </div>
  );
}

export default OnboardingCard;
