import React from "react";

const AITranslationPanel = ({
  aiTranslation,
}) => {

  const wordCount =
    aiTranslation
      ? aiTranslation.trim().split(/\s+/).length
      : 0;

  const charCount =
    aiTranslation
      ? aiTranslation.length
      : 0;

  const confidence = 92;

  // ==========================================
  // Copy
  // ==========================================

  const copyTranslation = () => {

    navigator.clipboard.writeText(aiTranslation);

    alert("AI Translation copied!");

  };

  // ==========================================
  // Download
  // ==========================================

  const downloadTranslation = () => {

    const blob = new Blob(
      [aiTranslation],
      {
        type: "text/plain",
      }
    );

    const url =
      window.URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download = "ai-translation.txt";

    a.click();

    window.URL.revokeObjectURL(url);

  };

  return (

    <div>

      {/* ========================================== */}
      {/* Header */}
      {/* ========================================== */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >

        <div>

          <div
            style={{
              color: "#64748B",
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            AI Generated
          </div>

          <h2
            style={{
              margin: "6px 0",
            }}
          >
            AI Translation
          </h2>

        </div>

        <div
          style={{
            background: "#DCFCE7",
            color: "#166534",
            padding: "8px 16px",
            borderRadius: "999px",
            fontWeight: "600",
          }}
        >
          French
        </div>

      </div>

      {/* ========================================== */}
      {/* AI Metadata */}
      {/* ========================================== */}

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >

        <MetaCard
          label="Words"
          value={wordCount}
        />

        <MetaCard
          label="Characters"
          value={charCount}
        />

        <MetaCard
          label="Confidence"
          value={`${confidence}%`}
        />

        <MetaCard
          label="Model"
          value="GPT-5"
        />

      </div>

      {/* ========================================== */}
      {/* Translation */}
      {/* ========================================== */}

      <textarea
        rows={18}
        readOnly
        value={aiTranslation}
        style={{
          width: "100%",
          padding: "18px",
          borderRadius: "14px",
          border: "1px solid #CBD5E1",
          background: "#F8FAFC",
          resize: "vertical",
          boxSizing: "border-box",
          fontSize: "14px",
          lineHeight: "1.7",
          fontFamily: "Consolas, monospace",
        }}
      />

      {/* ========================================== */}
      {/* Footer */}
      {/* ========================================== */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "20px",
          flexWrap: "wrap",
        }}
      >

        <div
          style={{
            color: "#64748B",
            fontSize: "13px",
          }}
        >
          Generated Successfully -
          {" "}
          {new Date().toLocaleTimeString()}
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
          }}
        >

          <button
            style={buttonStyle}
            onClick={copyTranslation}
          >
            Copy
          </button>

          <button
            style={buttonStyle}
            onClick={downloadTranslation}
          >
            Download
          </button>

        </div>

      </div>

    </div>

  );

};

const MetaCard = ({
  label,
  value,
}) => (

  <div
    style={{
      background: "#F8FAFC",
      padding: "10px 14px",
      borderRadius: "10px",
      border: "1px solid #E5E7EB",
    }}
  >

    <div
      style={{
        fontSize: "12px",
        color: "#64748B",
      }}
    >
      {label}
    </div>

    <strong>
      {value}
    </strong>

  </div>

);

const buttonStyle = {

  padding: "10px 18px",

  borderRadius: "10px",

  border: "1px solid #CBD5E1",

  background: "#FFFFFF",

  cursor: "pointer",

  fontWeight: "600",

};

export default AITranslationPanel;