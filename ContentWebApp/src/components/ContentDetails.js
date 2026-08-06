import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuizDetails from "./QuizDetails";
import StoryDetails from "./StoryDetails";
import SubodhaCourseDetails from "./SubodhaCourseDetails";
import { contentService } from "../services/contentService";
import "./ContentDetails.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/pageShell.css";

const ContentDetails = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isSubodhaCourse = type === "subodha-course";

  const contentById = useCallback(async () => {
    if (isSubodhaCourse) {
      setIsLoading(false);
      return null;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await contentService.getContentById(id, type);
      setContent(data);
      return data;
    } catch (err) {
      console.error("Error fetching content:", err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [id, type, isSubodhaCourse]);

  useEffect(() => {
    contentById();
  }, [contentById]);

  if (isLoading) {
    return (
      <div className="content-details-message">
        <p>Loading content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-details-message">
        <p className="content-details-error">Error: {error}</p>
        <button onClick={() => navigate("/content")} className="primary-button">
          ← Back to Content
        </button>
      </div>
    );
  }

  if (isSubodhaCourse) {
    return (
      <div className="page-shell">
        <SubodhaCourseDetails courseId={id} onBack={() => navigate("/content")} />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="content-details-message">
        <p>Content not found.</p>
        <button onClick={() => navigate("/content")} className="primary-button">
          ← Back to Content
        </button>
      </div>
    );
  }

  const contentType = content.type.toLowerCase();
  const isQuiz = contentType === "quiz";
  const isProcessed = isQuiz ? true : content.is_processed;

  if (!isProcessed && !isQuiz) {
    const titleEnglish = content.title.english;
    const titleLocal = content.title.local;
    return (
      <div className="content-details-message">
        <button onClick={() => navigate("/content")} className="primary-button">
          ← Back
        </button>
        <h3>
          Title: {titleEnglish}
          {titleLocal ? ` / ${titleLocal}` : ""}
        </h3>
        <p>Content is being processed, try again later!</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="content-details-actions">
        <button onClick={() => navigate("/content")} className="primary-button">
          ← Back
        </button>
        <button
          onClick={() => navigate(`/content/edit/${type}/${id}`)}
          className="secondary-button"
        >
          Edit
        </button>
      </div>
      {isQuiz ? (
        <QuizDetails quiz={content} />
      ) : (
        <StoryDetails type={contentType} story={content} />
      )}
    </div>
  );
};

export default ContentDetails;
