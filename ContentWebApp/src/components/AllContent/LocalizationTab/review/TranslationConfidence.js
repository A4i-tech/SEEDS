import React from "react";

const TranslationConfidence = ({
  reviewerComments,
  reviewStage,
}) => {

  let confidence = 70;

  if (reviewerComments.trim()) confidence += 10;

  if (reviewStage === "AI Suggestion Ready") confidence += 10;

  if (reviewStage === "Approved") confidence += 10;

  const level =
    confidence >= 90
      ? "High"
      : confidence >= 80
      ? "Medium"
      : "Low";

  const progressColor =
    confidence >= 90
      ? "#10B981"
      : confidence >= 80
      ? "#3B82F6"
      : "#F59E0B";

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

      {/* ========================================== */}
      {/* Header */}
      {/* ========================================== */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
        }}
      >

        <div>

          <div
            style={{
              color: "#6B7280",
              fontSize: "13px",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            AI QUALITY
          </div>

          <h2
            style={{
              margin: "8px 0 0",
              color: "#111827",
            }}
          >
            🎯 Translation Confidence
          </h2>

          <p
            style={{
              marginTop: "10px",
              color: "#6B7280",
            }}
          >
            AI quality score after reviewer validation.
          </p>

        </div>

        {/* Score Circle */}

        <div
          style={{
            width: "95px",
            height: "95px",
            borderRadius: "50%",
            background: "#EEF2FF",
            border: `6px solid ${progressColor}`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: progressColor,
            fontSize: "30px",
            fontWeight: "700",
          }}
        >
          {confidence}%
        </div>

      </div>

      {/* ========================================== */}
      {/* Progress */}
      {/* ========================================== */}

      <div
        style={{
          height: "12px",
          background: "#E5E7EB",
          borderRadius: "999px",
          overflow: "hidden",
        }}
      >

        <div
          style={{
            width: `${confidence}%`,
            height: "100%",
            background: progressColor,
            transition: "0.5s",
          }}
        />

      </div>

      {/* ========================================== */}
      {/* Level */}
      {/* ========================================== */}

      <div
        style={{
          textAlign: "center",
          marginTop: "30px",
        }}
      >

        <h1
          style={{
            margin: 0,
            color: "#111827",
          }}
        >
          {level} Confidence
        </h1>

        <p
          style={{
            color: "#6B7280",
            marginTop: "8px",
          }}
        >
          Translation quality based on the complete review workflow.
        </p>

      </div>

      {/* ========================================== */}
      {/* Quality Checklist */}
      {/* ========================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px",
          marginTop: "35px",
        }}
      >

        <StatusCard
          active={true}
          text="AI Translation Generated"
        />

        <StatusCard
          active={reviewerComments.trim()}
          text="Reviewer Feedback Added"
        />

        <StatusCard
          active={
            reviewStage === "AI Suggestion Ready" ||
            reviewStage === "Approved"
          }
          text="AI Refinement Applied"
        />

        <StatusCard
          active={
            reviewStage === "Approved"
          }
          text="Ready for Publishing"
        />

      </div>

    </div>

  );

};

const StatusCard = ({
  active,
  text,
}) => (

  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "14px",
      borderRadius: "12px",
      background: active
        ? "#ECFDF5"
        : "#F9FAFB",
      border: active
        ? "1px solid #BBF7D0"
        : "1px solid #E5E7EB",
    }}
  >

    <div
      style={{
        fontSize: "20px",
      }}
    >
      {active ? "✅" : "⭕"}
    </div>

    <div
      style={{
        fontWeight: "600",
        color: active
          ? "#166534"
          : "#6B7280",
      }}
    >
      {text}
    </div>

  </div>

);

export default TranslationConfidence;