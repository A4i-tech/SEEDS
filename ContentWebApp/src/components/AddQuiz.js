import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom";
import { getAuthHeaders } from "../utils/authHelpers";
import { transformQuizItem, extractQuestionText, extractQuestionOptions, getCorrectOptionIndex } from "../utils/quizDataTransform";
import { SEEDS_URL } from "../Constants";
import "./AddQuiz.css";

const AddQuiz = ({ quiz }) => {
  const navigate = useNavigate();
  const [inputFields, setInputFields] = useState([
    { question: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: 0 },
  ]);

  const [metadata, setMetadata] = useState({
    title: "",
    language: "kannada",
    positiveMark: 1,
    negativeMark: 0,
  });

  useEffect(() => {
    if (quiz && Object.keys(quiz).length > 0) {
      // Transform quiz data to ensure consistent structure
      const transformedQuiz = transformQuizItem(quiz);
      
      // Handle title - already normalized by transformQuizItem
      const title = typeof transformedQuiz.title === "object" ? transformedQuiz.title.english : transformedQuiz.title;
      
      // Handle marks - already normalized by transformQuizItem
      const positiveMark = transformedQuiz.positiveMarks ?? 1;
      const negativeMark = transformedQuiz.negativeMarks ?? 0;

      const quizMetadata = {
        title: title,
        language: transformedQuiz.language,
        positiveMark: positiveMark,
        negativeMark: negativeMark,
      };
      setMetadata(quizMetadata);

      // Handle questions - use utility functions to extract data
      const questions = transformedQuiz.questions || [];
      const inputFieldsData = questions.map((questionItem) => {
        // Use utility functions to extract question and options
        const questionText = extractQuestionText(questionItem);
        const options = extractQuestionOptions(questionItem);

        // Ensure we have at least 4 options
        const optionTexts = [...options];
        while (optionTexts.length < 4) {
          optionTexts.push("");
        }

        // Get correct answer index (for preserving when editing)
        const correctIndex = getCorrectOptionIndex(questionItem, optionTexts);

        return {
          question: questionText,
          optionA: optionTexts[0] || "",
          optionB: optionTexts[1] || "",
          optionC: optionTexts[2] || "",
          optionD: optionTexts[3] || "",
          correctAnswer: correctIndex, // Store correct answer index
        };
      });

      setInputFields(
        inputFieldsData.length > 0
          ? inputFieldsData
          : [{ question: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: 0 }]
      );
    }
  }, [quiz]);

  const handleFormChange = (index, event) => {
    let data = [...inputFields];
    data[index][event.target.name] = event.target.value;
    setInputFields(data);
  };

  const createQuizJson = () => {
    metadata["questions"] = inputFields.map((mcq) => mcq.question);
    const options = inputFields.map((mcq) => [mcq.optionA, mcq.optionB, mcq.optionC, mcq.optionD]);
    // Preserve correct answers from form (default to 0 if not set)
    const correctAnswers = inputFields.map((mcq) => mcq.correctAnswer !== undefined ? mcq.correctAnswer : 0);
    metadata["correctAnswers"] = correctAnswers;
    metadata["options"] = options;
    metadata["type"] = "quiz";
    if (quiz) {
      metadata["id"] = quiz.id || quiz._id;
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

  const onSubmit = async (e) => {
    e.preventDefault();
    console.log("inputFields", inputFields);
    console.log("metadata", metadata);
    createQuizJson();

    if (!isValid()) {
      return;
    }

    try {
      const response = await fetch(`${SEEDS_URL}/content/quiz`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to save quiz" }));
        throw new Error(errorData.error || `Failed to save quiz: ${response.status}`);
      }

      const result = await response.json();
      console.log("Quiz saved successfully:", result);
      alert("Quiz saved successfully.");
      navigate("/content");
    } catch (err) {
      console.error("Error saving quiz:", err);
      alert(`Failed to save quiz: ${err.message}`);
    }
  };

  const addFields = () => {
    let newfield = {
      question: "",
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctAnswer: 0, // Default to first option
    };
    setInputFields([...inputFields, newfield]);
  };

  const handleCorrectAnswerChange = (questionIndex, optionIndex) => {
    const updated = [...inputFields];
    updated[questionIndex].correctAnswer = optionIndex;
    setInputFields(updated);
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
              <div className="question-simple-header">
                <span className="question-simple-title">Question {index + 1}</span>
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
                {["optionA", "optionB", "optionC", "optionD"].map((field, optionIdx) => {
                  const labels = ["Option A", "Option B", "Option C", "Option D"];
                  const isCorrect = input.correctAnswer === optionIdx;
                  return (
                    <div className={`option-group ${isCorrect ? "option-group-correct" : ""}`} key={field}>
                      <div className="option-label-row">
                        <label className={`option-label ${isCorrect ? "option-label-correct" : ""}`}>
                          {labels[optionIdx]} {isCorrect ? "(Correct Answer)" : ""}
                        </label>
                        <label className="option-radio">
                          <input
                            type="radio"
                            name={`correct-${index}`}
                            checked={isCorrect}
                            onChange={() => handleCorrectAnswerChange(index, optionIdx)}
                          />
                          <span>Select correct</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        name={field}
                        className="form-input"
                        placeholder={`Enter ${labels[optionIdx]}`}
                        value={input[field]}
                        onChange={(event) => handleFormChange(index, event)}
                      />
                    </div>
                  );
                })}
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
