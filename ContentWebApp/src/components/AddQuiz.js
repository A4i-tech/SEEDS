import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom";
import { contentService } from "../services/contentService";

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
    language: "kn",
    positiveMark: 1,
    negativeMark: 0,
  });

  useEffect(() => {
    if (quiz && Object.keys(quiz).length > 0) {
      setMetadata({
        title: quiz.title?.english,
        localTitle: quiz.title?.local,
        theme: quiz.theme?.english,
        localTheme: quiz.theme?.local,
        language: quiz.language,
        positiveMark: quiz.positiveMarks,
        negativeMark: quiz.negativeMarks,
      });
      const questions = quiz.questions;
      const inputFieldsData = questions.map((questionItem) => {
        const opts = questionItem.options;
        const optionTexts = opts.map((o) => o.text);
        while (optionTexts.length < 4) optionTexts.push("");
        const idx = opts.findIndex((o) => o.id === questionItem.correct_option_id);
        return {
          question: questionItem.question.text,
          optionA: optionTexts[0],
          optionB: optionTexts[1],
          optionC: optionTexts[2],
          optionD: optionTexts[3],
          correctAnswer: idx,
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

    const questions = inputFields.map((mcq) => mcq.question);
    const options = inputFields.map((mcq) => [
      mcq.optionA,
      mcq.optionB,
      mcq.optionC,
      mcq.optionD,
    ]);
    const correctAnswers = inputFields.map((mcq) =>
      mcq.correctAnswer !== undefined ? mcq.correctAnswer : 0
    );

    const payload = {
      ...metadata,
      questions,
      options,
      correctAnswers,
      // Theme fields expected by backend quiz creation (mirror AddStory behavior)
      theme: metadata.theme,
      localTheme:
        languageLower === "en" ? metadata.theme : metadata.localTheme,
      // Title fields expected by backend quiz creation (mirror AddStory behavior)
      title: metadata.title,
      localTitle:
        languageLower === "en" ? metadata.title : metadata.localTitle,
      type: "quiz",
      id: quiz ? (quiz._id || quiz.id) : uuidv4(),
    };

    return payload;
  };

  const isValid = () => {
    var valid = true;
    const languageLower = (metadata.language || "").toLowerCase();

    if (metadata.title.length === 0) {
      valid = false;
      alert("Title cannot be empty");
    } else if (
      languageLower !== "en" &&
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
      languageLower !== "en" &&
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
        } else if (mcq.correctAnswer < 0) {
          valid = false;
          alert(`Question ${index + 1} has no correct answer selected`);
        }
      });
    }
    return valid;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    console.log("inputFields", inputFields);
    console.log("metadata", metadata);
    const payload = createQuizJson();

    if (!isValid()) {
      return;
    }

    try {
      const quizId = quiz && (quiz._id || quiz.id);
      const isEditing = Boolean(quizId);
      let result;
      if (isEditing) {
        // PATCH existing quiz — backend requires _id in the body
        result = await contentService.updateContent({ ...payload, _id: quizId });
      } else {
        result = await contentService.createQuiz(payload);
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
      case "kn":
        return "Kannada";
      case "hi":
        return "Hindi";
      case "mr":
        return "Marathi";
      case "ta":
        return "Tamil";
      case "bn":
        return "Bengali";
      case "or":
        return "Odia";
      case "en":
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
              <option value="kn">Kannada</option>
              <option value="hi">Hindi</option>
              <option value="mr">Marathi</option>
              <option value="or">Odia</option>
              <option value="en">English</option>
              <option value="ta">Tamil</option>
              <option value="bn">Bengali</option>
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

        {metadata.language.toLowerCase() !== "en" && (
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
