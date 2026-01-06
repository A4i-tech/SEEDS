import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AddQuiz from "./AddQuiz";
import AddStory from "./AddStory";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import "./ContentDetails.css";

const ContentEdit = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [experience, setExperience] = useState(type || "quiz");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const contentById = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch from main endpoint - now includes quiz data
      // Ensure ID is a string and encode it for URL safety
      const contentId = String(id || "").trim();
      if (!contentId) {
        throw new Error("Content ID is required");
      }
      const headers = getAuthHeaders();
      const response = await fetch(`${SEEDS_URL}/content/${encodeURIComponent(contentId)}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch content" }));
        throw new Error(errorData.error || `Failed to fetch content: ${response.status}`);
      }

      const data = await response.json();
      console.log("ContentEdit data", data);
      return data;
    } catch (error) {
      console.error("Error fetching content for edit:", error);
      setError(error.message || "Failed to load content");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const getContentById = async () => {
      const contentFromServer = await contentById();
      if (contentFromServer) {
        setContent(contentFromServer);
        // Set experience based on content type, handling both object and string formats
        const contentType = contentFromServer.type || type || "quiz";
        // Normalize to handle case variations
        const normalizedType = typeof contentType === "string" 
          ? contentType.toLowerCase() 
          : contentType;
        setExperience(normalizedType);
      } else {
        // If content fetch fails, still set experience from URL param
        if (type) {
          setExperience(type.toLowerCase());
        }
      }
    };
    getContentById();
  }, [contentById, type]);

  const handleChange = (event) => {
    setExperience(event.target.value);
  };

  if (isLoading) {
    return (
      <div className="content-details-container">
        <div className="content-details-wrapper">
          <div className="content-details-loading">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading content for editing...</p>
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

  if (!content || Object.keys(content).length === 0) {
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

  // Check if content is processed
  // Quiz content doesn't have isProcessed field, so we check if it has questions
  const isProcessed =
    content.isProcessed !== false && (content.type === "quiz" ? content.questions?.length > 0 : true);

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
            <p className="processing-message">Content is being processed and cannot be edited yet. Please try again later!</p>
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

  // Get content type - handle both object and string formats
  const contentType = content.type || experience || type || "quiz";
  const normalizedType = typeof contentType === "string" 
    ? contentType.toLowerCase() 
    : (contentType || "quiz");

  return (
    <div className="content-details-container">
      <div className="content-details-wrapper">
        <button
          onClick={() => navigate("/content")}
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

        {/* Render appropriate edit component */}
        {normalizedType === "quiz" ? (
          <AddQuiz quiz={content} />
        ) : (
          <AddStory content={content} contentType={experience} onContentTypeChange={handleChange} />
        )}
      </div>
    </div>
  );
};

export default ContentEdit;
