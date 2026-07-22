import React from "react";

const cardStyle = {
  background: "#FFFFFF",
  borderRadius: "16px",
  padding: "24px",
  border: "1px solid #E5E7EB",
  boxShadow: "0 8px 20px rgba(0,0,0,.05)",
  textAlign: "center",
};

const ReviewAnalytics = ({
  translationVersions,
  reviewEvents,
  reviewStage,
  confidence,
}) => {
  return (
    <div
      style={{
        marginTop: "40px",
      }}
    >
      <h2
        style={{
          marginBottom: "25px",
        }}
      >
        📊 Review Analytics
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: "20px",
        }}
      >
        <div style={cardStyle}>
          <h1>{translationVersions.length}</h1>
          <p>Total Versions</p>
        </div>

        <div style={cardStyle}>
          <h1>{reviewEvents.length}</h1>
          <p>Workflow Events</p>
        </div>

        <div style={cardStyle}>
          <h1>{confidence}%</h1>
          <p>Confidence</p>
        </div>

        <div style={cardStyle}>
          <h1>{reviewStage}</h1>
          <p>Current Stage</p>
        </div>
      </div>
    </div>
  );
};

export default ReviewAnalytics;