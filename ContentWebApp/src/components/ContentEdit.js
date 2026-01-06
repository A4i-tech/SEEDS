import { useState } from "react";
import AddQuiz from "./AddQuiz";
import AddStory from "./AddStory";
import { useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";

const ContentEdit = () => {
  const { type, id } = useParams();
  const [content, setContent] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [experience, setExperience] = useState("quiz");

  useEffect(() => {
    const contentById = async () => {
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
      console.log("ContentEdit data", data);
      return data;
    };

    const getContentById = async () => {
      try {
        setLoading(true);
        setError(null);
        const contentFromServer = await contentById();
        if (contentFromServer) {
          setContent(contentFromServer);
          console.log("quizInEdit", contentFromServer);
          setExperience(contentFromServer.type || type);
        } else {
          setError("Failed to load content");
        }
      } catch (err) {
        console.error("Error loading content:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    getContentById();
  }, [id, type]);

  const location = useLocation();
  console.log("link props", location.state);

  const handleChange = (event) => {
    setExperience(event.target.value);
    console.log(event.target.value);
  };

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

  if (!content || Object.keys(content).length === 0) {
    return (
      <div style={{ margin: "20px" }}>
        <h3>Content not found</h3>
      </div>
    );
  }

  // Check if content is processed
  // Quiz content doesn't have isProcessed field, so we check if it has questions
  const isProcessed =
    content.isProcessed !== false && (content.type === "quiz" ? content.questions?.length > 0 : true);

  if (!isProcessed && content.type !== "quiz") {
    const title = typeof content.title === "object" ? content.title.english : content.title;
    return (
      <div style={{ margin: "20px" }}>
        <h3>{title}</h3>
        <p>Content is being processed, try again later!</p>
      </div>
    );
  }

  return (
    <div style={{ margin: "20px" }}>
      <h3>Edit Content</h3>
      {content &&
        (experience === "Story" || experience === "Poem" || experience === "Song") && (
          <form>
            <label>
              Experience:
              <select
                value={experience}
                onChange={(event) => handleChange(event)}
                className="mintgreen"
                style={{ width: "150px" }}
              >
                <option value="Story">Story</option>
                <option value="Poem">Poem</option>
                <option value="Song">Song</option>
              </select>
            </label>
          </form>
        )}
      {content && experience === "quiz" && isProcessed && <AddQuiz quiz={content} />}
      {content && experience !== "quiz" && isProcessed && (
        <AddStory content={content} contentType={experience} />
      )}
    </div>
  );
};

export default ContentEdit;
