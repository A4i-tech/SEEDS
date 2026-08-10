import React, { useState, useEffect, useCallback } from "react";
import { contentAggregatorService } from "../../services/contentAggregatorService";
import { CourseContentSkeleton } from "./CourseContentSkeleton";
import { FlatBlockNavigator } from "./FlatBlockNavigator";
import { OutlineNavigator } from "./OutlineNavigator";
import "./ContentAggregatorDetails.css";

const ContentAggregatorDetails = ({ courseId, onBack }) => {
  const [course, setCourse] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await contentAggregatorService.getCourse(courseId);
      setCourse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBlockChange = useCallback((updatedBlock) => {
    setCourse((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.block_id === updatedBlock.block_id ? updatedBlock : b)),
    }));
  }, []);

  if (isLoading) {
    return <CourseContentSkeleton />;
  }

  if (error) {
    return (
      <>
        <div className="content-details-actions">
          <button onClick={onBack} className="primary-button">
            ← Back
          </button>
        </div>
        <p className="content-details-error">Error: {error}</p>
      </>
    );
  }

  if (!course) {
    return (
      <>
        <div className="content-details-actions">
          <button onClick={onBack} className="primary-button">
            ← Back
          </button>
        </div>
        <p>Course not found.</p>
      </>
    );
  }

  const blockMap = Object.fromEntries((course.blocks).map((b) => [b.block_id, b]));
  const hasOutline = Array.isArray(course.outline) && course.outline.length > 0;

  return (
    <div className="content-aggregator-course-details">
      <h2>{course.title}</h2>
      {course.hidden && <span className="content-aggregator-badge-hidden">Hidden</span>}
      {course.description && <p>{course.description}</p>}

      {hasOutline ? (
        <OutlineNavigator
          outline={course.outline}
          blockMap={blockMap}
          courseId={courseId}
          onBlockChange={handleBlockChange}
          onBackToContent={onBack}
        />
      ) : (
        <div className="content-aggregator-blocks">
          <FlatBlockNavigator
            blocks={course.blocks}
            courseId={courseId}
            onBlockChange={handleBlockChange}
            onBack={onBack}
          />
        </div>
      )}
    </div>
  );
};

export default ContentAggregatorDetails;
