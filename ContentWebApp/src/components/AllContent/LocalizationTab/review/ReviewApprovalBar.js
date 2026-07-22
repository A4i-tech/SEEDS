import React from "react";

const buttonStyle = {
  padding: "12px 24px",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  color: "#fff",
  fontWeight: "600",
  fontSize: "15px",
  transition: "0.3s ease",
};

const ReviewApprovalBar = ({
  reviewStage,
  onApprove,
  onContinueReview,
}) => {
  return (
    <div
      style={{
        marginTop: "40px",
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: "18px",
        padding: "25px",
        boxShadow: "0 10px 30px rgba(0,0,0,.05)",
      }}
    >
      {/* Header */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "20px",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
            }}
          >
            ✅ Reviewer Decision
          </h2>

          <p
            style={{
              marginTop: "8px",
              color: "#6B7280",
              fontSize: "15px",
            }}
          >
            Review the refined translation and decide whether to approve it or continue the review cycle.
          </p>

          <div
            style={{
              marginTop: "12px",
              display: "inline-block",
              padding: "8px 16px",
              borderRadius: "999px",
              background: "#EEF2FF",
              color: "#4338CA",
              fontWeight: "600",
            }}
          >
            Current Status : {reviewStage}
          </div>
        </div>

        {/* Action Buttons */}

        <div
          style={{
            display: "flex",
            gap: "15px",
            flexWrap: "wrap",
          }}
        >
          <button
            style={{
              ...buttonStyle,
              background: "#10B981",
            }}
            onClick={onApprove}
          >
            ✅ Approve & Publish
          </button>

          <button
            style={{
              ...buttonStyle,
              background: "#3B82F6",
            }}
            onClick={onContinueReview}
          >
            🔄 Continue Review
          </button>
        </div>
      </div>

      {/* Workflow Hint */}

      <div
        style={{
          marginTop: "25px",
          padding: "18px",
          borderRadius: "12px",
          background: "#F8FAFC",
          border: "1px solid #E5E7EB",
        }}
      >
        <strong>Workflow</strong>

        <p
          style={{
            marginTop: "10px",
            color: "#6B7280",
            lineHeight: "1.7",
          }}
        >
          Reviewer → Comments → Manual Edit → Refine with AI → Updated
          Translation → Reviewer Decision → Approve & Publish / Continue
          Review
        </p>
      </div>
    </div>
  );
};

export default ReviewApprovalBar;