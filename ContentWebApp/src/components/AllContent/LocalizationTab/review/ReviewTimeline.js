import React from "react";

const ReviewTimeline = ({
  events,
}) => {

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
          marginBottom: "30px",
        }}
      >

        <div
          style={{
            color: "#6B7280",
            fontSize: "13px",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          REVIEW HISTORY
        </div>

        <h2
          style={{
            margin: "8px 0 0",
          }}
        >
          🕒 Activity Timeline
        </h2>

        <p
          style={{
            marginTop: "10px",
            color: "#6B7280",
          }}
        >
          Complete history of reviewer and AI actions.
        </p>

      </div>

      {/* ========================================== */}
      {/* Timeline */}
      {/* ========================================== */}

      <div
        style={{
          position: "relative",
          marginLeft: "18px",
        }}
      >

        {/* Vertical Line */}

        <div
          style={{
            position: "absolute",
            left: "10px",
            top: "10px",
            bottom: "10px",
            width: "2px",
            background: "#E5E7EB",
          }}
        />

        {events.map((event, index) => (

          <div
            key={index}
            style={{
              position: "relative",
              display: "flex",
              marginBottom: "30px",
            }}
          >

            {/* Circle */}

            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#4F46E5",
                border: "4px solid #EEF2FF",
                zIndex: 2,
                flexShrink: 0,
              }}
            />

            {/* Card */}

            <div
              style={{
                marginLeft: "22px",
                flex: 1,
                background: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: "14px",
                padding: "18px",
                transition: ".25s",
              }}
            >

              <div
                style={{
                  fontWeight: "700",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {event.message}
              </div>

              <div
                style={{
                  color: "#6B7280",
                  fontSize: "13px",
                }}
              >
                {event.time}
              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

};

export default ReviewTimeline;