import React from "react";
import "./css/ContentCreatorsList.css";
import "../shared/cards.css";
import "../shared/utilities.css";

const ContentCreatorsList = ({ creators }) => {
  return (
    <div className="creator-list-pane">
      <h3 className="creator-list-title">Content Creators</h3>
      {creators.length === 0 ? (
        <div className="placeholder-text">No content creators added yet.</div>
      ) : (
        <ul className="creator-list">
          {creators.map((creator) => (
            <li className="creator-list-item" key={creator.id}>
              <div className="creator-name">{creator.name}</div>
              <div className="creator-email">{creator.email}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ContentCreatorsList;
