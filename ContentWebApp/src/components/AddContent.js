import { useState } from "react";
import AddQuiz from "./AddQuiz";
import AddStory from "./AddStory";

const AddContent = () => {
  const [experience, setExperience] = useState("Story");

  const handleChange = (event) => {
    setExperience(event.target.value);
  };

  return (
    <>
      <div style={{ margin: "20px" }}>
        <h3>Add Content</h3>
        <form>
          <label>
            Pick your experience:
            <br />
            <select
              value={experience}
              onChange={(event) => handleChange(event)}
              className="mintgreen"
              style={{ width: "150px" }}
            >
              <option value="Story">Story</option>
              <option value="Poem">Poem</option>
              <option value="Song">Song</option>
              <option value="Snippet">Snippet</option>
              {/* <option value="Riddle">Riddle</option> */}
              <option value="quiz">Quiz</option>
            </select>
          </label>
        </form>
        {experience === "quiz" && <AddQuiz />}
        {experience !== "quiz" && <AddStory contentType={experience} />}
      </div>
    </>
  );
};

export default AddContent;
