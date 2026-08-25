import React from "react";
import { BlockCard } from "./BlockContent";

export function UnitBlocks({ blocks, courseId, source, onBlockChange }) {
  if (blocks.length === 0) return null;

  return (
    <div className="content-aggregator-unit-blocks">
      {blocks.map((block) => (
        <BlockCard key={block.block_id} block={block} courseId={courseId} source={source} onBlockChange={onBlockChange} />
      ))}
    </div>
  );
}
