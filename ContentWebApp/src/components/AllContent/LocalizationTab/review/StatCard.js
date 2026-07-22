import React from "react";

const StatCard = ({
  icon,
  title,
  value,
  color = "#4F46E5",
}) => {

  return (

    <div
      style={{
        background: "#ffffff",
        border: "1px solid #E5E7EB",
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "0 8px 20px rgba(0,0,0,.05)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >

      <div
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "14px",
          background: color,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: "24px",
          color: "#fff",
        }}
      >
        {icon}
      </div>

      <div>

        <div
          style={{
            fontSize: "13px",
            color: "#6B7280",
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: "24px",
            fontWeight: "700",
            marginTop: "4px",
          }}
        >
          {value}
        </div>

      </div>

    </div>

  );

};

export default StatCard;