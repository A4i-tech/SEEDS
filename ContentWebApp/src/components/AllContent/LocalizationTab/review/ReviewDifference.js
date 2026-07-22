import React from "react";

const ReviewDifference = ({
  aiTranslation,
  updatedTranslation,
  reviewerComments,
}) => {
  const changed =
    aiTranslation.trim() !== updatedTranslation.trim();

  return (
    <div
      style={{
        marginTop: "40px",
        background: "#ffffff",
        borderRadius: "18px",
        padding: "30px",
        border: "1px solid #E5E7EB",
        boxShadow: "0 10px 30px rgba(0,0,0,.05)",
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        🔍 Translation Difference Summary
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginTop: "25px",
        }}
      >
        <div>
          <h4>Original AI Translation</h4>

          <textarea
            readOnly
            rows={8}
            value={aiTranslation}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid #CBD5E1",
              background: "#F8FAFC",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <h4>Final Translation</h4>

          <textarea
            readOnly
            rows={8}
            value={updatedTranslation}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid #CBD5E1",
              background: "#F8FAFC",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: "25px",
          padding: "18px",
          borderRadius: "12px",
          background: changed ? "#ECFDF5" : "#FEF3C7",
          color: changed ? "#166534" : "#92400E",
          fontWeight: "600",
        }}
      >
        {changed
          ? "✅ Reviewer modifications detected."
          : "ℹ️ No changes were made to the AI translation."}
      </div>

      {reviewerComments && (
        <div
          style={{
            marginTop: "20px",
            padding: "18px",
            background: "#F9FAFB",
            borderRadius: "12px",
            border: "1px solid #E5E7EB",
          }}
        >
          <strong>Reviewer Feedback</strong>

          <p
            style={{
              marginTop: "10px",
              color: "#4B5563",
            }}
          >
            {reviewerComments}
          </p>
        </div>
      )}
    </div>
  );
};

export default ReviewDifference;