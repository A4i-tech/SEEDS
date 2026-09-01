import React from "react";

const ReviewerPanel = ({
  reviewerTranslation,
  setReviewerTranslation,
  reviewerComments,
  setReviewerComments,
  handleImproveWithAI,
  isImproving,
  aiRefineDisabled,
  aiRefineMessage,
}) => {

  const wordCount =
    reviewerTranslation
      ? reviewerTranslation.trim().split(/\s+/).length
      : 0;

  return (

    <div>

      {/* ============================= */}
      {/* Header */}
      {/* ============================= */}

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
            Human Review
          </div>

          <h2
            style={{
              margin: "6px 0",
            }}
          >
            Reviewer Workspace
          </h2>

        </div>

        <div
          style={{
            background: "#FEF3C7",
            color: "#92400E",
            padding: "8px 16px",
            borderRadius: "999px",
            fontWeight: "600",
          }}
        >
          Manual Review
        </div>

      </div>

      {/* ============================= */}
      {/* Stats */}
      {/* ============================= */}

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "20px",
        }}
      >

        <Stat
          title="Words"
          value={wordCount}
        />

        <Stat
          title="Reviewer"
          value="1"
        />

        <Stat
          title="Status"
          value="Editing"
        />

      </div>

      {/* ============================= */}
      {/* Translation */}
      {/* ============================= */}

      <div
        style={{
          marginBottom: "20px",
        }}
      >

        <label
          style={{
            fontWeight: "600",
            marginBottom: "10px",
            display: "block",
          }}
        >
          Reviewer Translation
        </label>

        <textarea
          rows={9}
          value={reviewerTranslation}
          onChange={(e)=>
            setReviewerTranslation(e.target.value)
          }
          style={{
            width:"100%",
            padding:"16px",
            borderRadius:"12px",
            border:"1px solid #CBD5E1",
            background:"#F8FAFC",
            resize:"vertical",
            boxSizing:"border-box",
          }}
        />

      </div>

      {/* ============================= */}
      {/* Comments */}
      {/* ============================= */}

      <div>

        <label
          style={{
            fontWeight:"600",
            marginBottom:"10px",
            display:"block",
          }}
        >
          AI Instructions
        </label>

        <textarea
          rows={5}
          value={reviewerComments}
          placeholder="Example: Make the tone formal, preserve Login terminology, shorten long sentences..."
          onChange={(e)=>
            setReviewerComments(e.target.value)
          }
          style={{
            width:"100%",
            padding:"16px",
            borderRadius:"12px",
            border:"1px solid #CBD5E1",
            resize:"vertical",
            boxSizing:"border-box",
          }}
        />

      </div>

      {/* ============================= */}
      {/* Quick Prompts */}
      {/* ============================= */}

      <div
        style={{
          display:"flex",
          flexWrap:"wrap",
          gap:"10px",
          marginTop:"20px",
        }}
      >

        <Chip
          text="Formal"
          onClick={()=>
            setReviewerComments("Use formal tone.")
          }
        />

        <Chip
          text="Friendly"
          onClick={()=>
            setReviewerComments("Use friendly tone.")
          }
        />

        <Chip
          text="Short"
          onClick={()=>
            setReviewerComments("Shorten translation.")
          }
        />

        <Chip
          text="Preserve Login"
          onClick={()=>
            setReviewerComments("Preserve Login terminology.")
          }
        />

      </div>

      {/* ============================= */}
      {/* Button */}
      {/* ============================= */}

      <button
        onClick={handleImproveWithAI}
        disabled={isImproving || aiRefineDisabled}
        title={aiRefineDisabled ? aiRefineMessage : undefined}
        style={{
          marginTop:"24px",
          width:"100%",
          background: aiRefineDisabled ? "#9CA3AF" : "#4F46E5",
          color:"#fff",
          border:"none",
          padding:"16px",
          borderRadius:"12px",
          cursor: aiRefineDisabled ? "not-allowed" : "pointer",
          fontWeight:"600",
          fontSize:"15px",
        }}
      >
        {isImproving
          ? "AI Improving..."
          : "Improve Translation with AI"}
      </button>

      {aiRefineDisabled && (
        <p
          style={{
            marginTop: "8px",
            fontSize: "13px",
            color: "#6B7280",
          }}
        >
          {aiRefineMessage}
        </p>
      )}

    </div>

  );

};

const Stat = ({
  title,
  value,
}) => (

  <div
    style={{
      background:"#F8FAFC",
      border:"1px solid #E5E7EB",
      borderRadius:"10px",
      padding:"10px 14px",
    }}
  >
    <div
      style={{
        fontSize:"12px",
        color:"#64748B",
      }}
    >
      {title}
    </div>

    <strong>{value}</strong>

  </div>

);

const Chip = ({
  text,
  onClick,
}) => (

  <button
    onClick={onClick}
    style={{
      border:"1px solid #CBD5E1",
      background:"#FFFFFF",
      borderRadius:"999px",
      padding:"8px 14px",
      cursor:"pointer",
      fontSize:"13px",
      fontWeight:"600",
    }}
  >
    {text}
  </button>

);

export default ReviewerPanel;