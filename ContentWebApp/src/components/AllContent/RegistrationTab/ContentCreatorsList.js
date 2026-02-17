import React from "react";
import "./css/ContentCreatorsList.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const ContentCreatorsList = ({ creators }) => {
  const totalCreators = creators.length;

  return (
    <div className="creator-list-pane">
      <div className="creator-list-header">
        <h3 className="creator-list-title">Creator Directory</h3>
        <span className="creator-count-pill">{totalCreators} Total</span>
      </div>
      {creators.length === 0 ? (
        <div className="placeholder-text">No content creators added yet.</div>
      ) : (
        <ul className="creator-list">
          {creators.map((creator) => (
            <li className="creator-list-item" key={creator.id}>
              <div className="creator-avatar">
                {(creator.name || creator.email || "C").slice(0, 2).toUpperCase()}
              </div>
              <div className="creator-meta">
                <div className="creator-name-row">
                  <div className="creator-name">{creator.name || "Unnamed Creator"}</div>
                  <span className="role-badge creator-role-badge">Creator</span>
                </div>
                <div className="creator-email">{creator.email}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ContentCreatorsList;
