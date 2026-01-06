import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import QuizDetails from "./QuizDetails";
import StoryDetails from "./StoryDetails";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";

const ContentDetails = () => {
  const { type, id } = useParams();
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const contentById = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch from main endpoint - now includes quiz data
      const headers = getAuthHeaders();
      const response = await fetch(`${SEEDS_URL}/content/${id}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status}`);
      }

      const data = await response.json();
      console.log("ContentDetailsData", data);
      setContent(data);
      return data;
    } catch (error) {
      console.error("Error fetching content:", error);
      setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const fetchContent = async () => {
      await contentById();
    };
    fetchContent();
  }, [contentById]);

  if (loading) {
    return (
      <div style={{ margin: "20px" }}>
        <p>Loading content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ margin: "20px" }}>
        <h3>Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div style={{ margin: "20px" }}>
        <h3>Content not found</h3>
      </div>
    );
  }

  // Check if content is processed (for non-quiz content)
  // Quiz content doesn't have isProcessed field, so we check if it has questions
  const isProcessed = content.isProcessed !== false && (content.type === "quiz" ? content.questions?.length > 0 : true);

  if (!isProcessed && content.type !== "quiz") {
    const title = typeof content.title === "object" ? content.title.english : content.title;
    return (
      <div style={{ margin: "20px" }}>
        <h3>Title: {title}</h3>
        <p>Content is being processed, try again later!</p>
      </div>
    );
  }

  return (
    <div style={{ margin: "20px" }}>
      {content.type === "quiz" ? (
        <QuizDetails quiz={content} />
      ) : (
        <StoryDetails type={content.type} story={content} />
      )}
    </div>
  );
};

export default ContentDetails;
