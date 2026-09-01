import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Select from "./AllContent/shared/Select";
import { CONTENT_TYPE_OPTIONS, renderContentEditor } from "./contentTypeRegistry";
import "./AddContent.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/pageShell.css";

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
            <Select id="experience-select" value={experience} onChange={setExperience} options={CONTENT_TYPE_OPTIONS} />
          </div>
        </div>
        {renderContentEditor(experience)}
      </div>
    </div>
  );
};

export default AddContent;
