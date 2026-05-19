import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import AddQuiz from "./AddQuiz";
import AddStory from "./AddStory";
import SubodhaCourseEditor from "./SubodhaCourseEditor";
import { contentService } from "../services/contentService";

// Top-level dispatcher: imported third-party LMS content (any vendor) lives
// under the single generic type `imported_content`. Render the tree editor as
// its OWN route component so React hooks stay stable — `ContentEditFlat`
// below handles legacy story/quiz/poem and never sees imported types.
const ContentEdit = () => {
  const { type } = useParams();
  if (type === "imported_content") {
    return <SubodhaCourseEditor />;
  }
  return <ContentEditFlat />;
};

const ContentEditFlat = () => {
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

  const location = useLocation();

  const handleChange = (event) => {
    setExperience(event.target.value);
  };

  const experienceLower = (experience || "").toLowerCase();
  const isQuiz = experienceLower === "quiz";
  // Quiz content has no isProcessed/audioContent — treat it as always ready
  const isProcessed = isQuiz
    ? true
    : (content?.isProcessed ?? Boolean(content?.audioContent?.length));
  const titleText =
    typeof content?.title === "object"
      ? content.title.english || content.title.local || "Untitled"
      : content?.title || "Untitled";

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
      <>
        <div className="content-details-page">
          <h3>Edit Content</h3>
          {content && !isQuiz && (
            <form>
              <label>
                Experience:
                <select
                  value={experience}
                  onChange={(event) => handleChange(event)}
                  className="mintgreen"
                >
                  <option value="Story">Story</option>
                  <option value="Poem">Poem</option>
                  <option value="Song">Song</option>
                </select>
              </label>
            </form>
          )}
          {content && isQuiz && (
            <AddQuiz quiz={content} />
          )}
          {content && !isQuiz && isProcessed && (
            <AddStory content={content} contentType={experience} />
          )}
          <div />
        </div>
      </>
    );
  }
};

export default ContentEdit;
