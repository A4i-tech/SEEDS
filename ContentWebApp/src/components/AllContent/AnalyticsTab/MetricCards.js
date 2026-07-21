import React from "react";
import "./css/AnalyticsStats.css";

/**
 * Grid of metric cards.
 * @param {{label: string, value: React.ReactNode, color?: string}[]} cards
 */
const MetricCards = ({ cards }) => (
  <div className="stat-cards">
    {cards.map((card) => (
      <div
        key={card.label}
        className="stat-card"
        style={card.color ? { borderLeftColor: card.color } : undefined}
      >
        <div className="stat-label">{card.label}</div>
        <div className="stat-value">{card.value}</div>
      </div>
    ))}
  </div>
);

export default MetricCards;
