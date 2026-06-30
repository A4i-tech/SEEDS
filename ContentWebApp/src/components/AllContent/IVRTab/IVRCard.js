import React from "react";
import "../shared/cards.css";

const IVRCard = ({ title, description, onClick, variant = "default" }) => {
  const getClassName = () => {
    const baseClass = "ivr-card";
    if (variant === "blue") return `${baseClass} blue`;
    if (variant === "green") return `${baseClass} green`;
    return baseClass;
  };

  return (
    <div className={getClassName()} onClick={onClick}>
      <h3 className="registration-title">{title}</h3>
      <p className="placeholder-text">{description}</p>
    </div>
  );
};

export default IVRCard;
