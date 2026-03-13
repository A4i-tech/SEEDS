import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom";
import { contentService } from "../services/contentService";
import {
  transformQuizItem,
  extractQuestionText,
  extractQuestionOptions,
  getCorrectOptionIndex,
} from "../utils/quizDataTransform";

const ANSWER_OPTION_CONFIG = [
  { name: "optionA", label: "Option A", idx: 0 },
  { name: "optionB", label: "Option B", idx: 1 },
  { name: "optionC", label: "Option C", idx: 2 },
  { name: "optionD", label: "Option D", idx: 3 },
];

const AddQuiz = ({ quiz }) => {
  const navigate = useNavigate();
  const [inputFields, setInputFields] = useState([
    { question: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: 0 },
  ]);

  const [metadata, setMetadata] = useState({
    title: "",
    localTitle: "",
    theme: "",
    localTheme: "",
    language: "kannada",
    positiveMark: 1,
    negativeMark: 0,
  });

  useEffect(() => {
    if (quiz && Object.keys(quiz).length > 0) {
      const transformedQuiz = transformQuizItem(quiz);
      const titleSource = transformedQuiz.title;
      const themeSource = transformedQuiz.theme;

      const title =
        typeof titleSource === "object" ? titleSource.english : titleSource;
      const localTitle =
        typeof titleSource === "object" ? titleSource.local : undefined;
      const theme =
        typeof themeSource === "object" ? themeSource.english : themeSource;
      const localTheme =
        typeof themeSource === "object" ? themeSource.local : undefined;
      const quizMetadata = {
        title: title,
        localTitle: localTitle,
        theme: theme,
        localTheme: localTheme,
        language: transformedQuiz.language,
        positiveMark: transformedQuiz.positiveMarks ?? 1,
        negativeMark: transformedQuiz.negativeMarks ?? 0,
      };
      setMetadata(quizMetadata);
      const questions = transformedQuiz.questions;
      const inputFieldsData = questions.map((questionItem) => {
        const questionText = extractQuestionText(questionItem);
        const options = extractQuestionOptions(questionItem);
        const optionTexts = [...options];
        while (optionTexts.length < 4) optionTexts.push("");
        const correctIndex = getCorrectOptionIndex(questionItem, optionTexts);
        return {
          question: questionText,
          optionA: optionTexts[0],
          optionB: optionTexts[1],
          optionC: optionTexts[2],
          optionD: optionTexts[3],
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

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;
    setMetadata((prev) => ({
      ...prev,
      language: newLanguage,
      // When language changes, clear local-specific fields so the user re-enters them if needed
      localTitle: "",
      localTheme: "",
    }));
  };

  const createQuizJson = () => {
    const languageLower = (metadata.language || "").toLowerCase();

    metadata["questions"] = inputFields.map((mcq) => mcq.question);
    const options = inputFields.map((mcq) => [mcq.optionA, mcq.optionB, mcq.optionC, mcq.optionD]);
    const correctAnswers = inputFields.map((mcq) => mcq.correctAnswer !== undefined ? mcq.correctAnswer : 0);
    metadata["correctAnswers"] = correctAnswers;
    metadata["options"] = options;
    // Theme fields expected by backend quiz creation (mirror AddStory behavior)
    metadata["theme"] = metadata.theme;
    metadata["localTheme"] =
      languageLower === "english" ? metadata.theme : metadata.localTheme;

    // Title fields expected by backend quiz creation (mirror AddStory behavior)
    metadata["title"] = metadata.title;
    metadata["localTitle"] =
      languageLower === "english" ? metadata.title : metadata.localTitle;
    metadata["type"] = "quiz";
    if (quiz) {
      metadata["id"] = quiz.id;
    } else {
      metadata["id"] = uuidv4();
    }
  };

  const isValid = () => {
    var valid = true;
    const languageLower = (metadata.language || "").toLowerCase();

    if (metadata.title.length === 0) {
      valid = false;
      alert("Title cannot be empty");
    } else if (
      languageLower !== "english" &&
      metadata.localTitle.length === 0
    ) {
      valid = false;
      alert("Local title cannot be empty for non-English languages");
    } else if (metadata.theme.length === 0) {
      valid = false;
      alert("Theme cannot be empty");
    } else if (metadata.language.length === 0) {
      valid = false;
      alert("Language cannot be empty");
    } else if (
      languageLower !== "english" &&
      metadata.localTheme.length === 0
    ) {
      valid = false;
      alert("Local theme cannot be empty for non-English languages");
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

  const getLocalizedLabelPrefix = () => {
    const language = (metadata.language || "").toLowerCase();
    switch (language) {
      case "kannada":
        return "Kannada";
      case "hindi":
        return "Hindi";
      case "marathi":
        return "Marathi";
      case "tamil":
        return "Tamil";
      case "bengali":
        return "Bengali";
      case "english":
      default:
        return "Local";
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="metadataGrid">
        <div>
          <label>
            Language
            <br />
            <select
              value={metadata.language || ""}
              onChange={handleLanguageChange}
              className="mintgreen"
              style={{ width: "200px" }}
            >
              <option value="kannada">Kannada</option>
              <option value="hindi">Hindi</option>
              <option value="marathi">Marathi</option>
              <option value="odia">Odia</option>
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="bengali">Bengali</option>
            </select>
          </label>
        </div>

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
          <label>Theme</label>
          <br />
          <input
            className="mintgreen"
            type="text"
            name="theme"
            placeholder=" Add Theme"
            value={metadata.theme || ""}
            onChange={(event) => setMetadata({ ...metadata, theme: event.target.value })}
          />
        </div>

        {metadata.language.toLowerCase() !== "english" && (
          <>
            <div>
              <label>{`${getLocalizedLabelPrefix()} Title`}</label>
              <br />
              <input
                className="mintgreen"
                type="text"
                name="localTitle"
                placeholder=" Add Local Title"
                value={metadata.localTitle || ""}
                onChange={(event) => setMetadata({ ...metadata, localTitle: event.target.value })}
              />
            </div>

            <div>
              <label>{`${getLocalizedLabelPrefix()} Theme`}</label>
              <br />
              <input
                className="mintgreen"
                type="text"
                name="localTheme"
                placeholder=" Add Local Theme"
                value={metadata.localTheme || ""}
                onChange={(event) => setMetadata({ ...metadata, localTheme: event.target.value })}
              />
            </div>
          </>
        )}

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
              {ANSWER_OPTION_CONFIG.map(({ name, label, idx }) => (
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
