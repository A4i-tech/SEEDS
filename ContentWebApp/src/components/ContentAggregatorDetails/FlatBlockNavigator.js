import React, { useState, useMemo } from "react";
import { Breadcrumb } from "../AllContent/shared/Breadcrumb";
import { disambiguateLabels } from "./disambiguateLabels";
import { BlockCard } from "./BlockContent";

export function FlatBlockNavigator({ blocks, courseId, courseTitle, onBlockChange, onBack }) {
  const [index, setIndex] = useState(null);
  const labels = useMemo(() => disambiguateLabels(blocks), [blocks]);

  if (blocks.length === 0) {
    return <p>No content blocks synced for this course.</p>;
  }

  if (index === null) {
    return (
      <>
        <div className="content-details-actions">
          <Breadcrumb items={[{ label: "Home", onClick: onBack }, { label: courseTitle }]} />
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
      <Breadcrumb
        className="breadcrumb-standalone"
        items={[
          { label: "Home", onClick: onBack },
          { label: courseTitle, onClick: () => setIndex(null) },
          { label: labels[index] },
        ]}
      />
      <div className="content-aggregator-pager">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setIndex(index - 1)}
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
          onClick={() => setIndex(index + 1)}
          disabled={index === blocks.length - 1}
        >
          Next →
        </button>
      </div>
      <div key={index} className="content-aggregator-unit-fade">
        <BlockCard block={block} courseId={courseId} onBlockChange={onBlockChange} />
      </div>
    </div>
  );
}
