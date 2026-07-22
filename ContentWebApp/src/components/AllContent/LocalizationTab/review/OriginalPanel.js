import React from "react";

const OriginalPanel = ({ originalText }) => {

  const wordCount =
    originalText
      ? originalText.trim().split(/\s+/).length
      : 0;

  const charCount =
    originalText
      ? originalText.length
      : 0;

  const isHtml =
    originalText?.includes("<");

  // ==========================================
  // Copy
  // ==========================================

  const copyContent = () => {

    navigator.clipboard.writeText(originalText);

    alert("Original content copied!");

  };

  // ==========================================
  // Download
  // ==========================================

  const downloadContent = () => {

    const blob = new Blob(
      [originalText],
      {
        type: "text/plain",
      }
    );

    const url =
      window.URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download = "original-content.txt";

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
            Source Document
          </div>

          <h2
            style={{
              margin: "6px 0",
            }}
          >
            📄 Original Content
          </h2>

        </div>

        <div
          style={{
            background: "#EEF2FF",
            color: "#4338CA",
            padding: "8px 16px",
            borderRadius: "999px",
            fontWeight: "600",
          }}
        >
          English 🇺🇸
        </div>

      </div>

      {/* ========================================== */}
      {/* Metadata */}
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
          label="HTML"
          value={isHtml ? "Yes" : "No"}
        />

      </div>

      {/* ========================================== */}
      {/* Editor */}
      {/* ========================================== */}

      <textarea
        rows={18}
        readOnly
        value={originalText}
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
      {/* Actions */}
      {/* ========================================== */}

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "20px",
        }}
      >

        <button
          onClick={copyContent}
          style={buttonStyle}
        >
          📋 Copy
        </button>

        <button
          onClick={downloadContent}
          style={buttonStyle}
        >
          ⬇ Download
        </button>

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
        color: "#64748B",
        fontSize: "12px",
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

  background: "#fff",

  cursor: "pointer",

  fontWeight: "600",

};

export default OriginalPanel;