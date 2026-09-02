import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { contentService } from "../services/contentService";
import { LANGUAGE_OPTIONS } from "../utils/languageUtils";
import Select from "./AllContent/shared/Select";
import "./AddContent.css";

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
        title: quiz.title.english,
        localTitle: quiz.title.local,
        theme: quiz.theme.english,
        localTheme: quiz.theme.local,
        language: quiz.language,
        positiveMark: quiz.positive_marks,
        negativeMark: quiz.negative_marks,
      });
      const questions = quiz.questions;
      const inputFieldsData = questions.map((q) => {
        const optionTexts = q.options.map((o) => o.text);
        while (optionTexts.length < 4) optionTexts.push("");
        const correctIndex = q.options.findIndex((o) => o.id === q.correct_option_id);
        return {
          question: q.question.text,
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
      localTitle: "",
      localTheme: "",
    }));
  };

  const createQuizJson = () => {
    const languageLower = metadata.language.toLowerCase();

    const questions = inputFields.map((mcq, qIdx) => {
      const questionId = `q${qIdx + 1}`;
      const options = [mcq.optionA, mcq.optionB, mcq.optionC, mcq.optionD].map(
        (text, optIdx) => ({ id: `${questionId}-opt${optIdx + 1}`, text })
      );
      const correctIndex = mcq.correctAnswer !== undefined ? mcq.correctAnswer : 0;
      return {
        question: { id: questionId, text: mcq.question },
        options,
        correct_option_id: options[correctIndex].id,
      };
    });

    const titleObj = {
      english: metadata.title,
      local: languageLower === "en" ? metadata.title : metadata.localTitle,
    };
    const themeObj = {
      english: metadata.theme,
      local: languageLower === "en" ? metadata.theme : metadata.localTheme,
    };

    const payload = {
      type: "quiz",
      language: metadata.language,
      title: titleObj,
      theme: themeObj,
      positive_marks: metadata.positiveMark,
      negative_marks: metadata.negativeMark,
      questions,
    };

    return payload;
  };

  const isValid = () => {
    var valid = true;
    const languageLower = metadata.language.toLowerCase();

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
      const quizId = quiz && quiz.id;
      const isEditing = Boolean(quizId);
      let result;
      if (isEditing) {
        // PATCH existing quiz — backend requires id and the content fields it validates
        result = await contentService.updateContent({
          is_pull_model: quiz.is_pull_model,
          is_teacher_app: quiz.is_teacher_app,
          ...payload,
          id: quizId,
        });
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
  const removeFields = (index) => {
    let data = [...inputFields];
    data.splice(index, 1);
    setInputFields(data);
  };

  const getLocalizedLabelPrefix = () => {
    const language = metadata.language.toLowerCase();
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
    <form className="add-form" onSubmit={onSubmit}>
      <div className="form-section">
        <div className="form-section-title">Quiz Details</div>
        <div className="quiz-metadata-grid">
          <div>
            <label>Language</label>
            <Select
              value={metadata.language}
              onChange={(value) => handleLanguageChange({ target: { value } })}
              options={LANGUAGE_OPTIONS}
            />
          </div>

          <div>
            <label>Title</label>
            <input
              className="form-input"
              type="text"
              name="title"
              placeholder="Add Title"
              value={metadata.title}
              onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
            />
          </div>

          <div>
            <label>Theme</label>
            <input
              className="form-input"
              type="text"
              name="theme"
              placeholder="Add Theme"
              value={metadata.theme}
              onChange={(event) => setMetadata({ ...metadata, theme: event.target.value })}
            />
          </div>

          {metadata.language.toLowerCase() !== "en" && (
            <>
              <div>
                <label>{`${getLocalizedLabelPrefix()} Title`}</label>
                <input
                  className="form-input"
                  type="text"
                  name="localTitle"
                  placeholder="Add Local Title"
                  value={metadata.localTitle}
                  onChange={(event) => setMetadata({ ...metadata, localTitle: event.target.value })}
                />
              </div>

              <div>
                <label>{`${getLocalizedLabelPrefix()} Theme`}</label>
                <input
                  className="form-input"
                  type="text"
                  name="localTheme"
                  placeholder="Add Local Theme"
                  value={metadata.localTheme}
                  onChange={(event) => setMetadata({ ...metadata, localTheme: event.target.value })}
                />
              </div>
            </>
          )}

          <div className="quiz-marks-field">
            <label>Positive Marks</label>
            <input
              type="number"
              className="form-input"
              name="positiveMark"
              placeholder="Add Positive Marks"
              value={metadata.positiveMark}
              onChange={(event) => setMetadata({ ...metadata, positiveMark: event.target.value })}
            />
          </div>

          <div className="quiz-marks-field">
            <label>Negative Marks</label>
            <input
              type="number"
              className="form-input"
              name="negativeMark"
              placeholder="Add Negative Marks"
              value={metadata.negativeMark}
              onChange={(event) => setMetadata({ ...metadata, negativeMark: event.target.value })}
            />
          </div>
        </div>
      </div>

      {inputFields.map((input, index) => (
        <div key={index} className="quiz-question-card">
          <div className="quiz-options-grid">
            <div>
              <label>Question {index + 1}</label>
              <input
                type="text"
                className="form-input"
                name="question"
                placeholder="Add Question"
                value={input.question}
                onChange={(event) => handleFormChange(index, event)}
              />
            </div>
            <div className="quiz-remove-cell">
              <button className="btn-danger" type="button" onClick={() => removeFields(index)}>
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
                <input
                  type="text"
                  name={name}
                  className="form-input"
                  placeholder={`Add ${label}`}
                  value={input[name]}
                  onChange={(event) => handleFormChange(index, event)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={addFields}>
          + Question
        </button>
        <button type="submit" className="btn-primary">
          Save
        </button>
      </div>
    </form>
  );
};

export default AddQuiz;
