import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuizDetails from "./QuizDetails";
import StoryDetails from "./StoryDetails";
import { contentService } from "../services/contentService";
import "./ContentDetails.css";
import "./AllContent/shared/buttons.css";

const ContentDetails = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const contentById = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await contentService.getContentById(id);
      setContent(data);
      return data;
    } catch (err) {
      console.error("Error fetching content:", err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [id]);

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
  const isProcessed = content.isProcessed !== false && (isQuiz ? (content.questions?.length > 0) : true);

  if (!isProcessed && !isQuiz) {
    const titleEnglish = content.title?.english ?? content.title;
    const titleLocal = content.title?.local ?? content.localTitle;
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
    <div className="content-details-page">
      <div className="content-details-actions">
        <button onClick={() => navigate("/content")} className="primary-button">
          ← Back
        </button>
        <button
          onClick={() => navigate(`/content/edit/${type}/${id}`)}
          className="secondary-button"
        >
          ✏️ Edit
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
