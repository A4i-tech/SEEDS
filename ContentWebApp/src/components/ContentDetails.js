import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuizDetails from "./QuizDetails";
import StoryDetails from "./StoryDetails";
import { useAuth } from "../hooks/useAuth";
import { contentService } from "../services/contentService";
import "./ContentDetails.css";

const ContentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getAuthHeaders } = useAuth();
  const [content, setContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const contentById = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await contentService.getContentById(id, getAuthHeaders());
      console.log("ContentDetailsData", data);
      setContent(data);
      return data;
    } catch (error) {
      console.error("Error fetching content:", error);
      setError(error.message || "Failed to load content");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [id, getAuthHeaders]);

  useEffect(() => {
    const fetchContent = async () => {
      await contentById();
    };
    fetchContent();
  }, [contentById]);

  if (isLoading) {
    return (
      <div className="content-details-container">
        <div className="content-details-wrapper">
          <div className="content-details-loading">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading content...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-details-container">
        <div className="content-details-wrapper">
          <div className="content-details-error">
            <div className="error-icon">⚠️</div>
            <h3 className="error-title">Error Loading Content</h3>
            <p className="error-message">{error}</p>
            <button
              onClick={() => navigate("/content")}
              className="content-details-back-button"
            >
              Back to Content
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="content-details-container">
        <div className="content-details-wrapper">
          <div className="content-details-error">
            <div className="error-icon">🔍</div>
            <h3 className="error-title">Content Not Found</h3>
            <p className="error-message">The requested content could not be found.</p>
            <button
              onClick={() => navigate("/content")}
              className="content-details-back-button"
            >
              Back to Content
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normalize content type for comparison
  const contentType = typeof content.type === "string" ? content.type.toLowerCase() : (content.type || "");
  const isQuiz = contentType === "quiz";

  // Check if content is processed (for non-quiz content)
  // Quiz content doesn't have isProcessed field, so we check if it has questions
  const isProcessed = content.isProcessed !== false && (isQuiz ? content.questions?.length > 0 : true);

  if (!isProcessed && !isQuiz) {
    const titleText = typeof content.title === "object" 
      ? content.title.english || content.title.local 
      : content.title || "Unknown Title";
    
    return (
      <div className="content-details-container">
        <div className="content-details-wrapper">
          <div className="content-processing">
            <div className="processing-icon">⏳</div>
            <h3 className="processing-title">{titleText}</h3>
            <p className="processing-message">Content is being processed, please check back later!</p>
            <button
              onClick={() => navigate("/content")}
              className="content-details-back-button"
            >
              Back to Content
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-details-container">
      <div className="content-details-wrapper">
        <button
          onClick={() => navigate("/content")}
          className="back-button"
        >
          ← Back to Content
        </button>
        <div className="content-details-card">
          {isQuiz ? (
            <QuizDetails quiz={content} />
          ) : (
            <StoryDetails type={content.type || contentType} story={content} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentDetails;
