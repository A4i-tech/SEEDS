import React from "react";
import "../shared/buttons.css";
import { useToast } from "./Toast";

export function SnippetBlock({ snippet }) {
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
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "100%" }}>
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

export default SnippetBlock;
