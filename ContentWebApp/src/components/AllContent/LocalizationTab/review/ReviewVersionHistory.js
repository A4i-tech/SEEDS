import React from "react";

import ReviewVersionCard from "./ReviewVersionCard";

const ReviewVersionHistory = ({
  translationVersions,
}) => {

  return (

    <div
      style={{
        marginTop: "45px",
      }}
    >

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "25px",
        }}
      >

        <div>

          <h2
            style={{
              margin: 0,
            }}
          >
            Translation Version History
          </h2>

          <p
            style={{
              color: "#6B7280",
              marginTop: "8px",
            }}
          >
            Every AI refinement creates a new version.
          </p>

        </div>

        <div
          style={{
            background: "#EEF2FF",
            color: "#4F46E5",
            padding: "8px 18px",
            borderRadius: "999px",
            fontWeight: "600",
          }}
        >
          {translationVersions.length} Versions
        </div>

      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "22px",
        }}
      >

        {translationVersions
          .slice()
          .reverse()
          .map((item, index) => (

            <ReviewVersionCard
              key={item.version}
              item={item}
              latest={index === 0}
            />

        ))}

      </div>

    </div>

  );

};

export default ReviewVersionHistory;