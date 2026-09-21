import React from "react";
import "../shared/utilities.css";
import { SEEDS_URL } from "../../../Constants";
import { SnippetBlock } from "./SnippetBlock";

const buildDevToolsScript = (siteId) =>
  [
    "const s = document.createElement(\"script\");",
    `s.src = "${window.location.origin}/sdk.js";`,
    `s.dataset.siteId = "${siteId}";`,
    `s.dataset.apiBase = "${SEEDS_URL}";`,
    "document.body.appendChild(s);",
  ].join("\n");

export function DevToolsSection({ siteId }) {
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

export default DevToolsSection;
