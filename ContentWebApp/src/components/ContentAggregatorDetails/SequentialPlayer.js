import React, { useState } from "react";
import { Breadcrumb } from "../AllContent/shared/Breadcrumb";
import { Pagination } from "./Pagination";
import { UnitBlocks } from "./UnitBlocks";

export function SequentialPlayer({
  chapter,
  sequential,
  seqIndex,
  seqCount,
  onNavigateSequential,
  blockMap,
  courseId,
  courseTitle,
  onBlockChange,
  onBackToContent,
  onBack,
}) {
  const [unitIndex, setUnitIndex] = useState(0);
  const verticals = sequential.verticals;
  const vertical = verticals[unitIndex];
  const verticalBlocks = vertical ? vertical.block_ids.map((id) => blockMap[id]).filter(Boolean) : [];
  const unitLmsUrl = verticalBlocks.find((b) => b.lms_url)?.lms_url;

  return (
    <div>
      <Breadcrumb
        className="breadcrumb-standalone"
        items={[
          { label: "Home", onClick: onBackToContent },
          { label: courseTitle, onClick: () => onBack() },
          { label: chapter.display_name, onClick: () => onBack(chapter.block_id) },
          { label: sequential.display_name },
        ]}
      />
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
      <div key={unitIndex} className="content-aggregator-unit-fade">
        <div className="content-aggregator-unit-title-row">
          <h4>{vertical ? vertical.display_name : "No content in this section"}</h4>
          {unitLmsUrl && (
            <a href={unitLmsUrl} target="_blank" rel="noreferrer" className="content-aggregator-external-link">
              Open in Subodha
            </a>
          )}
        </div>
        {vertical && <UnitBlocks blocks={verticalBlocks} courseId={courseId} onBlockChange={onBlockChange} />}
      </div>
      <Pagination current={unitIndex} total={verticals.length} onChange={setUnitIndex} />
    </div>
  );
}
