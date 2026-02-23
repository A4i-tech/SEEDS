import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuizDetails from "./QuizDetails";
import StoryDetails from "./StoryDetails";
import { contentService } from "../services/contentService";

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
      console.log("ContentDetailsData", data);
      setContent(data);
      return data;
    } catch (err) {
      console.error("Error fetching content:", err);
      setError(err.message || "Failed to load content");
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
      <div style={{ margin: "20px" }}>
        <p>Loading content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ margin: "20px" }}>
        <p>Error: {error}</p>
        <button onClick={() => navigate("/content")} className="btn" style={{ backgroundColor: "#28574F", color: "white" }}>
          Back to Content
        </button>
      </div>
    );
  }

  if (!content) {
    return (
      <div style={{ margin: "20px" }}>
        <p>Content not found.</p>
        <button onClick={() => navigate("/content")} className="btn" style={{ backgroundColor: "#28574F", color: "white" }}>
          Back to Content
        </button>
      </div>
    );
  }

  const contentType = typeof content.type === "string" ? content.type.toLowerCase() : (content.type || "");
  const isQuiz = contentType === "quiz";
  const isProcessed = content.isProcessed !== false && (isQuiz ? (content.questions?.length > 0) : true);

  if (!isProcessed && !isQuiz) {
    const titleEnglish = content.title?.english ?? content.title;
    const titleLocal = content.title?.local ?? content.localTitle;
    return (
      <div style={{ margin: "20px" }}>
        <button
          onClick={() => navigate("/content")}
          className="btn"
          style={{ backgroundColor: "#28574F", color: "white", marginBottom: "12px" }}
        >
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
    <div style={{ margin: "20px" }}>
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <button
          onClick={() => navigate("/content")}
          className="btn"
          style={{ backgroundColor: "#28574F", color: "white" }}
        >
          ← Back
        </button>
        <button
          onClick={() => navigate(`/content/edit/${type}/${id}`)}
          className="btn"
          style={{ backgroundColor: "#E5A83B", color: "white" }}
        >
          ✏️ Edit
        </button>
      </div>
      {isQuiz ? (
        <QuizDetails quiz={content} />
      ) : (
        <StoryDetails type={content.type || contentType} story={content} />
      )}
    </div>
  );
};

export default ContentDetails;
