import React, { useState } from "react";
import { ChevronLeft, LayoutGrid } from "lucide-react";
import { UnitBlocks } from "./UnitBlocks";

export function SequentialPlayer({
  chapter,
  sequential,
  seqIndex,
  seqCount,
  onNavigateSequential,
  blockMap,
  courseId,
  onBlockChange,
  onBack,
}) {
  const [unitIndex, setUnitIndex] = useState(0);
  const verticals = sequential.verticals;
  const lastUnitIndex = Math.max(verticals.length - 1, 0);
  const vertical = verticals[unitIndex];
  const verticalBlocks = vertical ? vertical.block_ids.map((id) => blockMap[id]).filter(Boolean) : [];
  const unitLmsUrl = verticalBlocks.find((b) => b.lms_url)?.lms_url;

  return (
    <div>
      <div className="content-aggregator-pager">
        <button
          type="button"
          className="secondary-button"
          onClick={() => onNavigateSequential(seqIndex - 1)}
          disabled={seqIndex === 0}
        >
          ← Previous
        </button>
        <span className="content-aggregator-pager-position">
          {seqIndex + 1} / {seqCount}: {sequential.display_name}
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onNavigateSequential(seqIndex + 1)}
          disabled={seqIndex === seqCount - 1}
        >
          Next →
        </button>
      </div>
      <nav className="content-aggregator-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="content-aggregator-breadcrumb-link" onClick={() => onBack()}>
          <LayoutGrid size={14} strokeWidth={2.5} />
          Course
        </button>
        <ChevronLeft size={16} strokeWidth={2.5} className="content-aggregator-breadcrumb-sep" aria-hidden="true" />
        <button type="button" className="content-aggregator-breadcrumb-link" onClick={() => onBack(chapter.block_id)}>
          {chapter.display_name}
        </button>
        <ChevronLeft size={16} strokeWidth={2.5} className="content-aggregator-breadcrumb-sep" aria-hidden="true" />
        <span className="content-aggregator-breadcrumb-current">{sequential.display_name}</span>
      </nav>
      <div className="content-aggregator-unit-title-row">
        <h4>{vertical ? vertical.display_name : "No content in this section"}</h4>
        {unitLmsUrl && (
          <a href={unitLmsUrl} target="_blank" rel="noreferrer" className="content-aggregator-external-link">
            Open in Subodha
          </a>
        )}
      </div>
      {vertical && (
        <UnitBlocks
          key={vertical.block_id}
          blocks={verticalBlocks}
          courseId={courseId}
          onBlockChange={onBlockChange}
        />
      )}
      <div className="content-aggregator-unit-tabs">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setUnitIndex((i) => Math.max(0, i - 1))}
          disabled={unitIndex === 0}
        >
          ← Previous
        </button>
        <div className="content-aggregator-unit-tab-list">
          {verticals.map((v, i) => (
            <button
              key={v.block_id}
              type="button"
              className={i === unitIndex ? "content-aggregator-unit-tab active" : "content-aggregator-unit-tab"}
              title={v.display_name}
              onClick={() => setUnitIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setUnitIndex((i) => Math.min(lastUnitIndex, i + 1))}
          disabled={unitIndex === lastUnitIndex}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
