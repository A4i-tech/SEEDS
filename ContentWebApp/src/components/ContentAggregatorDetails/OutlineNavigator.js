import React, { useState, useMemo } from "react";
import { SequentialPlayer } from "./SequentialPlayer";

export function OutlineNavigator({ outline, blockMap, courseId, onBlockChange, onBackToContent }) {
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const flatSequentials = useMemo(
    () => outline.flatMap((chapter, chapterIdx) => chapter.sequentials.map((_, seqIdx) => ({ chapterIdx, seqIdx }))),
    [outline]
  );

  if (selected) {
    const chapter = outline[selected.chapterIdx];
    const sequential = chapter.sequentials[selected.seqIdx];
    const flatIndex = flatSequentials.findIndex(
      (s) => s.chapterIdx === selected.chapterIdx && s.seqIdx === selected.seqIdx
    );
    return (
      <SequentialPlayer
        key={sequential.block_id}
        chapter={chapter}
        sequential={sequential}
        seqIndex={flatIndex}
        seqCount={flatSequentials.length}
        onNavigateSequential={(newFlatIndex) => setSelected(flatSequentials[newFlatIndex])}
        blockMap={blockMap}
        courseId={courseId}
        onBlockChange={onBlockChange}
        onBack={(expandChapterId) => {
          setSelected(null);
          if (expandChapterId) setCollapsed((prev) => ({ ...prev, [expandChapterId]: false }));
        }}
      />
    );
  }

  const allCollapsed = outline.length > 0 && outline.every((chapter) => collapsed[chapter.block_id]);

  const toggleAll = () => {
    setCollapsed(allCollapsed ? {} : Object.fromEntries(outline.map((chapter) => [chapter.block_id, true])));
  };

  const toggleChapter = (blockId) => {
    setCollapsed((prev) => ({ ...prev, [blockId]: !prev[blockId] }));
  };

  return (
    <div className="content-aggregator-outline-list">
      <div className="content-details-actions">
        <button onClick={onBackToContent} className="primary-button">
          ← Back
        </button>
        <button type="button" className="secondary-button" onClick={toggleAll}>
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>
      {outline.map((chapter, chapterIdx) => {
        const isCollapsed = Boolean(collapsed[chapter.block_id]);
        return (
          <div key={chapter.block_id} className="content-aggregator-outline-chapter-card">
            <button
              type="button"
              className="content-aggregator-outline-chapter-header"
              onClick={() => toggleChapter(chapter.block_id)}
            >
              <span className="content-aggregator-outline-check" aria-hidden="true">✓</span>
              <span className="content-aggregator-outline-chapter-title">{chapter.display_name}</span>
              <span className="content-aggregator-outline-toggle" aria-hidden="true">{isCollapsed ? "+" : "−"}</span>
            </button>
            {!isCollapsed && (
              <ul className="content-aggregator-outline-sequential-list">
                {chapter.sequentials.map((seq, seqIdx) => (
                  <li key={seq.block_id}>
                    <button
                      type="button"
                      className="content-aggregator-outline-sequential-item"
                      onClick={() => setSelected({ chapterIdx, seqIdx })}
                    >
                      <span className="content-aggregator-outline-check" aria-hidden="true">✓</span>
                      {seq.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
