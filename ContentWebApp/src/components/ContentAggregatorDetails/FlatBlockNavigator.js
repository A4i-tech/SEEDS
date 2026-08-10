import React, { useState, useMemo } from "react";
import { disambiguateLabels } from "./disambiguateLabels";
import { BlockCard } from "./BlockContent";

export function FlatBlockNavigator({ blocks, courseId, onBlockChange, onBack }) {
  const [index, setIndex] = useState(null);
  const labels = useMemo(() => disambiguateLabels(blocks), [blocks]);

  if (blocks.length === 0) {
    return <p>No content blocks synced for this course.</p>;
  }

  if (index === null) {
    return (
      <>
        <div className="content-details-actions">
          <button onClick={onBack} className="primary-button">
            ← Back
          </button>
        </div>
        <ul className="content-aggregator-section-list">
          {blocks.map((b, i) => (
            <li key={b.block_id}>
              <button type="button" className="content-aggregator-section-list-item" onClick={() => setIndex(i)}>
                {i + 1}. {labels[i]}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const block = blocks[index];

  return (
    <div>
      <div className="content-details-actions">
        <button type="button" className="primary-button" onClick={() => setIndex(null)}>
          ← Back to list
        </button>
      </div>
      <div className="content-aggregator-pager">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← Previous
        </button>
        <span className="content-aggregator-pager-position">
          {index + 1} / {blocks.length}: {labels[index]}
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setIndex((i) => Math.min(blocks.length - 1, i + 1))}
          disabled={index === blocks.length - 1}
        >
          Next →
        </button>
      </div>
      <BlockCard key={block.block_id} block={block} courseId={courseId} onBlockChange={onBlockChange} />
    </div>
  );
}
