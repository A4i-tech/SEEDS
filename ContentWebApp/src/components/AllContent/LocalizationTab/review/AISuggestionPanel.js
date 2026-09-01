import React from "react";

const AISuggestionPanel = ({
  updatedTranslation,
  onApprove,
}) => {

  const wordCount =
    updatedTranslation
      ? updatedTranslation.trim().split(/\s+/).length
      : 0;

  const copyTranslation = () => {
    navigator.clipboard.writeText(updatedTranslation);
    alert("Translation copied successfully!");
  };

  const downloadTranslation = () => {

    const blob = new Blob(
      [updatedTranslation],
      {
        type: "text/plain",
      }
    );

    const url =
      window.URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download =
      "refined-translation.txt";

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
              fontSize: "13px",
              color: "#64748B",
              textTransform: "uppercase",
            }}
          >
            AI Assistant
          </div>

          <h2
            style={{
              margin: "6px 0",
            }}
          >
            AI Suggestions
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
          Ready
        </div>

      </div>

      {/* ========================================== */}
      {/* AI Summary */}
      {/* ========================================== */}

      <div
        style={{
          background: "#F8FAFC",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
        }}
      >

        <strong>
          AI Improvements Applied
        </strong>

        <ul
          style={{
            marginTop: "12px",
            lineHeight: "1.8",
          }}
        >

          <li>Grammar Improved</li>

          <li>Tone Optimized</li>

          <li>HTML Structure Preserved</li>

          <li>Translation Refined</li>

        </ul>

      </div>

      {/* ========================================== */}
      {/* Metadata */}
      {/* ========================================== */}

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >

        <MetaCard
          title="Words"
          value={wordCount}
        />

        <MetaCard
          title="Confidence"
          value="96%"
        />

        <MetaCard
          title="Model"
          value="GPT-5"
        />

      </div>

      {/* ========================================== */}
      {/* Translation */}
      {/* ========================================== */}

      <textarea
        rows={12}
        readOnly
        value={updatedTranslation}
        style={{
          width: "100%",
          padding: "16px",
          borderRadius: "12px",
          border: "1px solid #CBD5E1",
          background: "#F8FAFC",
          resize: "vertical",
          boxSizing: "border-box",
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
          flexWrap: "wrap",
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

        <button
          style={{
            ...buttonStyle,
            background: "#16A34A",
            color: "#fff",
            border: "none",
            marginLeft: "auto",
          }}
          onClick={() =>
            onApprove(updatedTranslation)
          }
        >
          Approve Translation
        </button>

      </div>

    </div>

  );

};

const MetaCard = ({
  title,
  value,
}) => (

  <div
    style={{
      background: "#F8FAFC",
      border: "1px solid #E5E7EB",
      borderRadius: "10px",
      padding: "10px 14px",
    }}
  >

    <div
      style={{
        color: "#64748B",
        fontSize: "12px",
      }}
    >
      {title}
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

export default AISuggestionPanel;