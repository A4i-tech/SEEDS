import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AddQuiz from "./AddQuiz";
import AddStory from "./AddStory";
import Select from "./AllContent/shared/Select";
import "./AddContent.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/pageShell.css";

const EXPERIENCE_OPTIONS = [
  { value: "Story", label: "Story" },
  { value: "Poem", label: "Poem" },
  { value: "Song", label: "Song" },
  { value: "Snippet", label: "Snippet" },
  { value: "quiz", label: "Quiz" },
];

const AddContent = () => {
  const navigate = useNavigate();
  const [experience, setExperience] = useState("Story");

  return (
    <div className="page-shell">
      <div className="add-content-header">
        <button type="button" className="tertiary-button" onClick={() => navigate("/content")}>
          ← Back
        </button>
      </div>
      <h1 className="add-content-title">Add Content</h1>
      <div className="add-content-card">
        <div className="form-section">
          <div className="form-section-title">Pick your experience</div>
          <div className="form-group-narrow">
            <Select id="experience-select" value={experience} onChange={setExperience} options={EXPERIENCE_OPTIONS} />
          </div>
        </div>
        {experience === "quiz" && <AddQuiz />}
        {experience !== "quiz" && <AddStory contentType={experience} />}
      </div>
    </div>
  );
};

export default AddContent;
