import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuizDetails from "./QuizDetails";
import StoryDetails from "./StoryDetails";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import "./ContentDetails.css";

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

      // Fetch from main endpoint - now includes quiz data
      const headers = getAuthHeaders();
      const response = await fetch(`${SEEDS_URL}/content/${id}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch content" }));
        throw new Error(errorData.error || `Failed to fetch content: ${response.status}`);
      }

      const data = await response.json();
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
  }, [id]);

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
              style={{
                marginTop: "24px",
                padding: "12px 24px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
              }}
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
              style={{
                marginTop: "24px",
                padding: "12px 24px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Back to Content
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check if content is processed (for non-quiz content)
  // Quiz content doesn't have isProcessed field, so we check if it has questions
  const isProcessed = content.isProcessed !== false && (content.type === "quiz" ? content.questions?.length > 0 : true);

  if (!isProcessed && content.type !== "quiz") {
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
              style={{
                marginTop: "24px",
                padding: "12px 24px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
              }}
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
          style={{
            marginBottom: "16px",
            padding: "10px 20px",
            background: "white",
            color: "#3b82f6",
            border: "2px solid #3b82f6",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s ease",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "#3b82f6";
            e.target.style.color = "white";
            e.target.style.transform = "translateX(-4px)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "white";
            e.target.style.color = "#3b82f6";
            e.target.style.transform = "translateX(0)";
          }}
        >
          ← Back to Content
        </button>
        <div className="content-details-card">
          {content.type === "quiz" ? (
            <QuizDetails quiz={content} />
          ) : (
            <StoryDetails type={content.type} story={content} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentDetails;
