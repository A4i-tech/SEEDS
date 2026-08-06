import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AddQuiz from "./AddQuiz";
import AddStory from "./AddStory";
import Select from "./AllContent/shared/Select";
import { contentService } from "../services/contentService";
import "./AddContent.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/pageShell.css";

const EXPERIENCE_OPTIONS = [
  { value: "Story", label: "Story" },
  { value: "Poem", label: "Poem" },
  { value: "Song", label: "Song" },
];

const ContentEdit = () => {
  const { type, id } = useParams();
  const [content, setContent] = useState({});
  const [experience, setExperience] = useState("quiz");
  const [isLoading, setIsLoading] = useState(true);

  const contentById = useCallback(async () => {
    try {
      const data = await contentService.getContentById(id, type);
      return data;
    } catch (error) {
      console.error("Error fetching content for edit:", error);
      return null;
    }
  }, [id, type]);

  useEffect(() => {
    const getContentById = async () => {
      const contentFromServer = await contentById();
      if (contentFromServer) {
        setContent(contentFromServer);
        setExperience(contentFromServer.type);
      }
      setIsLoading(false);
    };
    getContentById();
  }, [contentById, type]);

  const navigate = useNavigate();

  const experienceLower = (experience || "").toLowerCase();
  const isQuiz = experienceLower === "quiz";
  // Quiz content has no is_processed — treat it as always ready
  const isProcessed = isQuiz ? true : content?.is_processed;
  const titleText = content?.display_title ?? "Untitled";

  if (isLoading) {
    return (
      <div className="content-details-message">
        <p>Loading...</p>
      </div>
    );
  }

  if (content && !isProcessed) {
    return (
      <>
        <div className="content-details-message">
          <h3>{titleText}</h3>
          <p>Content is being processed, try again later!</p>
        </div>
      </>
    );
  } else {
    return (
      <div className="page-shell">
        <div className="add-content-header">
          <button type="button" className="primary-button" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
        <h1 className="add-content-title">Edit Content</h1>
        <div className="add-content-card">
          {content && !isQuiz && (
            <div className="form-section">
              <div className="form-section-title">Experience</div>
              <div className="form-group-narrow">
                <Select value={experience} onChange={setExperience} options={EXPERIENCE_OPTIONS} />
              </div>
            </div>
          )}
          {content && isQuiz && <AddQuiz quiz={content} />}
          {content && !isQuiz && isProcessed && <AddStory content={content} contentType={experience} />}
        </div>
      </div>
    );
  }
};

export default ContentEdit;
