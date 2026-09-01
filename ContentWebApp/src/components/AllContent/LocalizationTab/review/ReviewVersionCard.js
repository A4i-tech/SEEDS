import React from "react";

const buttonStyle = {
  padding: "10px 18px",
  borderRadius: "10px",
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  cursor: "pointer",
  fontWeight: "600",
};

const ReviewVersionCard = ({
  item,
  latest,
}) => {

  const handleCopy = () => {

    navigator.clipboard.writeText(item.content);

    alert("Version copied!");

  };

  return (

    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "18px",
        border: latest
          ? "2px solid #10B981"
          : "1px solid #E5E7EB",
        padding: "22px",
        boxShadow:
          "0 8px 24px rgba(0,0,0,.05)",
      }}
    >

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >

        <div>

          <h3
            style={{
              margin: 0,
            }}
          >
            Version {item.version}
          </h3>

          <div
            style={{
              color: "#6B7280",
              marginTop: "8px",
            }}
          >
            {item.label}
          </div>

        </div>

        <div
          style={{
            textAlign: "right",
          }}
        >

          <div
            style={{
              color: "#6B7280",
            }}
          >
            {item.createdAt}
          </div>

          {latest && (

            <div
              style={{
                marginTop: "10px",
                background: "#DCFCE7",
                color: "#166534",
                padding: "6px 12px",
                borderRadius: "999px",
                display: "inline-block",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              Current Version
            </div>

          )}

        </div>

      </div>

      <textarea
        readOnly
        rows={5}
        value={item.content}
        style={{
          width: "100%",
          marginTop: "20px",
          padding: "14px",
          borderRadius: "12px",
          border: "1px solid #CBD5E1",
          background: "#F8FAFC",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "20px",
        }}
      >

        <button style={buttonStyle}>
          View
        </button>

        <button
          style={buttonStyle}
          onClick={handleCopy}
        >
          Copy
        </button>

        <button style={buttonStyle}>
          Restore
        </button>

      </div>

    </div>

  );

};

export default ReviewVersionCard;