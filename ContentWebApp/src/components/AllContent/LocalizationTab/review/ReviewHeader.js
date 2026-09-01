import React from "react";

const statusColor = {
  Draft: "#64748B",
  "AI Improving...": "#F59E0B",
  "AI Suggestion Ready": "#3B82F6",
  Approved: "#22C55E",
};

const ReviewHeader = ({
  reviewStage,
  versionCount,
}) => {

  return (

    <div
      style={{
        background:
          "linear-gradient(135deg,#0F172A,#1E293B)",
        borderRadius: "20px",
        padding: "28px",
        color: "#fff",
        boxShadow:
          "0 12px 30px rgba(15,23,42,.25)",
        marginBottom: "30px",
      }}
    >

      {/* Top Row */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "20px",
        }}
      >

        {/* Left */}

        <div>

          <div
            style={{
              fontSize: "14px",
              color: "#94A3B8",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            AI Localization Platform
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "30px",
              fontWeight: "700",
            }}
          >
            Human Review Workspace
          </h1>

          <p
            style={{
              marginTop: "12px",
              color: "#CBD5E1",
              maxWidth: "700px",
              lineHeight: "1.6",
            }}
          >
            Review, refine and approve AI-generated
            translations before publishing to production.
          </p>

        </div>

        {/* Right */}

        <div
          style={{
            display: "flex",
            gap: "15px",
            alignItems: "center",
          }}
        >

          {/* Status */}

          <div
            style={{
              background:
                statusColor[reviewStage],
              padding: "10px 18px",
              borderRadius: "999px",
              color: "#fff",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            {reviewStage}
          </div>

          {/* Version */}

          <div
            style={{
              background: "#334155",
              padding: "10px 18px",
              borderRadius: "999px",
              color: "#fff",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            Version {versionCount}
          </div>

        </div>

      </div>

      {/* Divider */}

      <hr
        style={{
          border: 0,
          borderTop: "1px solid #334155",
          margin: "25px 0",
        }}
      />

      {/* Bottom Info */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(180px,1fr))",
          gap: "18px",
        }}
      >

        <InfoCard
          title="Project"
          value="SEEDS"
        />

        <InfoCard
          title="Source Language"
          value="English"
        />

        <InfoCard
          title="Target Language"
          value="French"
        />

        <InfoCard
          title="Review Status"
          value={reviewStage}
        />

      </div>

    </div>

  );

};

const InfoCard = ({
  title,
  value,
}) => (

  <div
    style={{
      background: "#1E293B",
      border: "1px solid #334155",
      borderRadius: "14px",
      padding: "18px",
    }}
  >

    <div
      style={{
        color: "#94A3B8",
        fontSize: "13px",
        marginBottom: "6px",
      }}
    >
      {title}
    </div>

    <div
      style={{
        color: "#fff",
        fontWeight: "600",
        fontSize: "17px",
      }}
    >
      {value}
    </div>

  </div>

);

export default ReviewHeader;