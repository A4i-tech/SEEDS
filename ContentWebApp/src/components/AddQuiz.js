import { useState, useEffect } from "react";
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
    language: "kannada",
    positive_marks: 1,
    negative_marks: 0,
    is_pull_model: false,
  });

  useEffect(() => {
    if (quiz && Object.keys(quiz).length > 0) {
      setMetadata({
        title: quiz.title.english,
        localTitle: quiz.title.local,
        theme: quiz.theme.english,
        localTheme: quiz.theme.local,
        language: quiz.language,
        positive_marks: quiz.positive_marks,
        negative_marks: quiz.negative_marks,
        is_pull_model: quiz.is_pull_model,
      });
      setInputFields(quiz.questions.map((q) => {
        const opts = q.options.map((o) => o.text);
        const correctIdx = q.options.findIndex((o) => o.id === q.correct_option_id);
        return {
          question: q.question.text,
          optionA: opts[0],
          optionB: opts[1],
          optionC: opts[2],
          optionD: opts[3],
          correctAnswer: correctIdx >= 0 ? correctIdx : 0,
        };
      }));
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
    const languageLower = metadata.language.toLowerCase();
    const questions = inputFields.map((mcq, qi) => {
      const opts = [mcq.optionA, mcq.optionB, mcq.optionC, mcq.optionD].map((text, oi) => ({
        id: `q${qi + 1}-opt${oi + 1}`,
        text,
      }));
      return {
        question: { id: `q${qi + 1}`, text: mcq.question },
        options: opts,
        correct_option_id: opts[mcq.correctAnswer].id,
      };
    });
    return {
      type: "quiz",
      language: metadata.language,
      title: {
        english: metadata.title,
        local: languageLower === "english" ? metadata.title : metadata.localTitle,
      },
      theme: {
        english: metadata.theme,
        local: languageLower === "english" ? metadata.theme : metadata.localTheme,
      },
      is_pull_model: metadata.is_pull_model,
      is_teacher_app: false,
      positive_marks: metadata.positive_marks,
      negative_marks: metadata.negative_marks,
      questions,
    };
  };

  const isValid = () => {
    var valid = true;
    const languageLower = metadata.language.toLowerCase();

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
    } else if (metadata.positive_marks === "" || metadata.positive_marks === undefined) {
      valid = false;
      alert("Positive marks cannot be empty");
    } else if (metadata.negative_marks === "" || metadata.negative_marks === undefined) {
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
    const payload = createQuizJson();

    if (!isValid()) {
      return;
    }

    try {
      const quizId = quiz && quiz.id;
      const isEditing = Boolean(quizId);
      let result;
      if (isEditing) {
        result = await contentService.updateContent({ ...payload, id: quizId });
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
    const language = metadata.language.toLowerCase();
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
              value={metadata.language}
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
            value={metadata.title}
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
            value={metadata.theme}
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
                value={metadata.localTitle}
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
                value={metadata.localTheme}
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
            name="positive_marks"
            placeholder="Add Positive Marks"
            value={metadata.positive_marks}
            onChange={(event) => setMetadata({ ...metadata, positive_marks: Number(event.target.value) })}
          />
        </div>

        <div>
          <label>Negative Marks</label>
          <br />
          <input
            type="number"
            className="mintgreen"
            name="negative_marks"
            placeholder="Add Negative Marks"
            value={metadata.negative_marks}
            onChange={(event) => setMetadata({ ...metadata, negative_marks: Number(event.target.value) })}
          />
        </div>
        <div>
          <input
            type="checkbox"
            name="is_pull_model"
            id="is_pull_model"
            checked={metadata.is_pull_model}
            onChange={() => setMetadata({ ...metadata, is_pull_model: !metadata.is_pull_model })}
          />
          <label htmlFor="is_pull_model">Add to IVR</label>
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
