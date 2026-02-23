import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom";
import { contentService } from "../services/contentService";
import { transformQuizItem, extractQuestionText, extractQuestionOptions, getCorrectOptionIndex } from "../utils/quizDataTransform";

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
      const transformedQuiz = transformQuizItem(quiz);
      const title = typeof transformedQuiz.title === "object" ? transformedQuiz.title.english : transformedQuiz.title;
      const quizMetadata = {
        title: title,
        language: transformedQuiz.language,
        positiveMark: transformedQuiz.positiveMarks ?? 1,
        negativeMark: transformedQuiz.negativeMarks ?? 0,
      };
      setMetadata(quizMetadata);
      const questions = transformedQuiz.questions || [];
      const inputFieldsData = questions.map((questionItem) => {
        const questionText = extractQuestionText(questionItem);
        const options = extractQuestionOptions(questionItem);
        const optionTexts = [...options];
        while (optionTexts.length < 4) optionTexts.push("");
        const correctIndex = getCorrectOptionIndex(questionItem, optionTexts);
        return {
          question: questionText,
          optionA: optionTexts[0] || "",
          optionB: optionTexts[1] || "",
          optionC: optionTexts[2] || "",
          optionD: optionTexts[3] || "",
          correctAnswer: correctIndex,
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
    const correctAnswers = inputFields.map((mcq) => mcq.correctAnswer !== undefined ? mcq.correctAnswer : 0);
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

  const onSubmit = async (e) => {
    e.preventDefault();
    console.log("inputFields", inputFields);
    console.log("metadata", metadata);
    createQuizJson();

    if (!isValid()) {
      return;
    }

    try {
      const isEditing = quiz && quiz.id;
      let result;
      if (isEditing) {
        // PATCH existing quiz — backend requires _id in the body
        result = await contentService.updateContent({ ...metadata, _id: quiz.id });
      } else {
        result = await contentService.createQuiz(metadata);
      }
      console.log("Quiz saved successfully:", result);
      alert("Saved successfully.");
      navigate("/content");
    } catch (err) {
      console.error("Error saving quiz:", err);
      alert(`Failed to save quiz: ${err.message || "Unknown error"}`);
    }
  };

  const addFields = () => {
    let newfield = {
      question: "",
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctAnswer: 0,
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
    <form onSubmit={onSubmit}>
      <div className="metadataGrid">
        <div>
          <label>Title</label>
          <br />
          <input
            className="mintgreen"
            type="text"
            name="title"
            placeholder=" Add Title"
            value={metadata.title || ""}
            onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
          />
        </div>

        <div>
          <label>
            Language
            <br />
            <select
              value={metadata.language || ""}
              onChange={(event) => setMetadata({ ...metadata, language: event.target.value })}
              className="mintgreen"
              style={{ width: "200px" }}
            >
              <option value="kannada">Kannada</option>
              <option value="hindi">Hindi</option>
              <option value="marathi">Marathi</option>
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="bengali">Bengali</option>
            </select>
          </label>
        </div>

        <div>
          <label>Positive Marks</label>
          <br />
          <input
            type="number"
            className="mintgreen"
            name="positiveMark"
            placeholder="Add Positive Marks"
            value={metadata.positiveMark || 1}
            onChange={(event) => setMetadata({ ...metadata, positiveMark: event.target.value })}
          />
        </div>

        <div>
          <label>Negative Marks</label>
          <br />
          <input
            type="number"
            className="mintgreen"
            name="negativeMark"
            placeholder="Add Negative Marks"
            value={metadata.negativeMark || 0}
            onChange={(event) => setMetadata({ ...metadata, negativeMark: event.target.value })}
          />
        </div>
      </div>
      {inputFields.map((input, index) => {
        return (
          <div key={index} style={{ marginTop: "1%" }}>
            <div className="optionsGrid">
              <div>
                <label>Question {index + 1}</label>
                <br />
                <input
                  type="text"
                  className="mintgreen"
                  name="question"
                  placeholder=" Add Question"
                  value={input.question}
                  onChange={(event) => handleFormChange(index, event)}
                />
              </div>
              <div>
                <button
                  className="btn"
                  type="button"
                  style={{ backgroundColor: "#28574F", color: "white" }}
                  onClick={() => removeFields(index)}
                >
                  Remove
                </button>
              </div>
              {[
                { name: "optionA", label: "Option A", idx: 0 },
                { name: "optionB", label: "Option B", idx: 1 },
                { name: "optionC", label: "Option C", idx: 2 },
                { name: "optionD", label: "Option D", idx: 3 },
              ].map(({ name, label, idx }) => (
                <div key={name}>
                  <label>
                    <input
                      type="radio"
                      name={`correctAnswer-${index}`}
                      checked={input.correctAnswer === idx}
                      onChange={() => handleCorrectAnswerChange(index, idx)}
                      style={{ marginRight: "4px" }}
                    />
                    {label} {input.correctAnswer === idx ? "(Correct Answer)" : ""}
                  </label>
                  <br />
                  <input
                    type="text"
                    name={name}
                    className="mintgreen"
                    placeholder={` Add ${label}`}
                    value={input[name]}
                    onChange={(event) => handleFormChange(index, event)}
                  />
                </div>
              ))}
            </div>
            <br />
          </div>
        );
      })}
      <button
        type="button"
        className="btn"
        style={{ backgroundColor: "#28574F", color: "white" }}
        onClick={addFields}
      >
        + Question
      </button>
      <br />
      <br />
      <input
        type="submit"
        style={{ backgroundColor: "#E5A83B", color: "white" }}
        value="Save"
        className="btn btn-block"
      />
    </form>
  );
};

export default AddQuiz;
