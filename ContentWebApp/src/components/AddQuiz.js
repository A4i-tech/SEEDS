import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom";
import { getAuthHeaders } from "../utils/authHelpers";
import "./AddQuiz.css";

const AddQuiz = ({ quiz }) => {
  const navigate = useNavigate();
  const [inputFields, setInputFields] = useState([
    { question: "", optionA: "", optionB: "", optionC: "", optionD: "" },
  ]);

  const [metadata, setMetadata] = useState({
    title: "",
    language: "Kannada",
    positiveMark: 1,
    negativeMark: 0,
  });

  useEffect(() => {
    if (quiz && Object.keys(quiz).length > 0) {
      const quizMetadata = {
        title: quiz.title,
        language: quiz.language,
        positiveMark: quiz.positiveMark,
        negativeMark: quiz.negativeMark,
      };
      setMetadata(quizMetadata);
      // var a = []
      const a = quiz.options.map((option, index) => ({
        question: quiz.questions[index],
        optionA: option[0],
        optionB: option[1],
        optionC: option[2],
        optionD: option[3],
      }));
      setInputFields(a);
    } else {
    }
  }, [quiz]);

  const handleFormChange = (index, event) => {
    let data = [...inputFields];
    data[index][event.target.name] = event.target.value;
    setInputFields(data);
  };

  const createQuizJson = () => {
    // const newMetadata = {...metadata[0]}
    metadata["questions"] = inputFields.map((mcq) => mcq.question);
    const options = inputFields.map((mcq) => [
      mcq.optionA,
      mcq.optionB,
      mcq.optionC,
      mcq.optionD,
    ]);
    const correctAnswers = Array(options.length).fill(0);
    metadata["correctAnswers"] = correctAnswers;
    metadata["options"] = options;
    metadata["type"] = "quiz";
    if (quiz) {
      metadata["id"] = quiz.id;
    } else {
      metadata["id"] = uuidv4();
    }
  };

  const isValid = () => {
    var valid = true;
    if (metadata.title.length === 0) {
      valid = false;
      alert("Title cannot be empty");
    } else if (metadata.language.length === 0) {
      valid = false;
      alert("Language cannot be empty");
    } else if (metadata.positiveMark.length === 0) {
      valid = false;
      alert("Positive marks cannot be empty");
    } else if (metadata.negativeMark.length === 0) {
      valid = false;
      alert("Negative marks cannot be empty");
    } else {
      inputFields.forEach((mcq, index) => {
        if (
          mcq.question.length === 0 ||
          mcq.optionA.length === 0 ||
          mcq.optionB.length === 0 ||
          mcq.optionC.length === 0 ||
          mcq.optionD.length === 0
        ) {
          valid = false;
          alert(`Question ${index + 1} is incomplete`);
        }
      });
    }
    return valid;
  };

  const onSubmit = (e) => {
    e.preventDefault();
    console.log("inputFields", inputFields);
    console.log("metatdata", metadata);
    createQuizJson();

    if (isValid()) {
      console.log(JSON.stringify(metadata));
      fetch(`${process.env.REACT_APP_SEEDS_URL}/content/quiz`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      })
        .then((res) => {
          alert("Saved successfully.");
          navigate("/content");
        })
        .catch((err) => {
          console.log(err.message);
        });
    }
  };

  const addFields = () => {
    let newfield = {
      question: "",
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
    };
    setInputFields([...inputFields, newfield]);
  };
  //     "positiveMark" : 1,    "negativeMark" : 0,    "id" : "Ramayana quiz 2",    "language" : "Kannada",
  const removeFields = (index) => {
    let data = [...inputFields];
    data.splice(index, 1);
    setInputFields(data);
  };

  return (
    <form className="add-quiz-form" onSubmit={onSubmit}>
      <div className="form-section">
        <div className="form-section-title">Quiz Information</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label form-label-required">Title</label>
            <input
              className="form-input"
              type="text"
              name="title"
              placeholder="Enter quiz title"
              value={metadata.title || ""}
              onChange={(event) =>
                setMetadata({ ...metadata, title: event.target.value })
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Language</label>
            <select
              value={metadata.language || ""}
              onChange={(event) =>
                setMetadata({ ...metadata, language: event.target.value })
              }
              className="form-select"
            >
              <option value="kannada">Kannada</option>
              <option value="hindi">Hindi</option>
              <option value="marathi">Marathi</option>
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="bengali">Bengali</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Positive Marks</label>
            <input
              type="number"
              className="form-input"
              name="positiveMark"
              placeholder="Enter positive marks"
              value={metadata.positiveMark || 1}
              onChange={(event) =>
                setMetadata({ ...metadata, positiveMark: event.target.value })
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Negative Marks</label>
            <input
              type="number"
              className="form-input"
              name="negativeMark"
              placeholder="Enter negative marks"
              value={metadata.negativeMark || 0}
              onChange={(event) =>
                setMetadata({ ...metadata, negativeMark: event.target.value })
              }
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Questions</div>
        {inputFields.map((input, index) => {
          return (
            <div key={index} className="question-card">
              <div className="question-header">
                <div className="question-number">
                  <div className="question-number-badge">{index + 1}</div>
                  <div className="question-number-label">Question {index + 1}</div>
                </div>
                {inputFields.length > 1 && (
                  <button
                    className="btn-remove"
                    type="button"
                    onClick={() => removeFields(index)}
                  >
                    Remove Question
                  </button>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label className="form-label form-label-required">Question Text</label>
                <input
                  type="text"
                  className="form-input"
                  name="question"
                  placeholder="Enter your question"
                  value={input.question}
                  onChange={(event) => handleFormChange(index, event)}
                />
              </div>
              <div className="options-grid">
                <div className="option-group">
                  <label className="option-label option-label-correct">Option A (Correct Answer)</label>
                  <input
                    type="text"
                    name="optionA"
                    className="form-input"
                    placeholder="Enter option A"
                    value={input.optionA}
                    onChange={(event) => handleFormChange(index, event)}
                  />
                </div>
                <div className="option-group">
                  <label className="option-label">Option B</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter option B"
                    name="optionB"
                    value={input.optionB}
                    onChange={(event) => handleFormChange(index, event)}
                  />
                </div>
                <div className="option-group">
                  <label className="option-label">Option C</label>
                  <input
                    type="text"
                    className="form-input"
                    name="optionC"
                    placeholder="Enter option C"
                    value={input.optionC}
                    onChange={(event) => handleFormChange(index, event)}
                  />
                </div>
                <div className="option-group">
                  <label className="option-label">Option D</label>
                  <input
                    type="text"
                    className="form-input"
                    name="optionD"
                    placeholder="Enter option D"
                    value={input.optionD}
                    onChange={(event) => handleFormChange(index, event)}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="btn-add-question"
          onClick={addFields}
        >
          ➕ Add Question
        </button>
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="btn-primary"
        >
          💾 Save Quiz
        </button>
      </div>
    </form>
  );
};

export default AddQuiz;
