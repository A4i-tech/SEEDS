import React from "react";
import { transformQuizItem, extractQuestionText, extractQuestionOptions, getCorrectOptionIndex } from "../utils/quizDataTransform";

const QuizDetails = ({ quiz }) => {
  const transformed = transformQuizItem(quiz);
  const title = typeof transformed.title === "object" ? transformed.title.english : transformed.title;
  const questions = transformed.questions || [];

  return (
    <>
      <h2>Quiz</h2>
      <div className="metadataGrid">
        <div>
          <div>Title</div>
          <p>
            <b>{title}</b>
          </p>
        </div>

        <div>
          <div>Language</div>
          <p>
            <b>{transformed.language}</b>
          </p>
        </div>

        <div>
          <label>Positive Marks</label>
          <br />
          <p className="mintgreen" style={{ width: "100px", textAlign: "center" }}>
            {transformed.positiveMarks ?? transformed.positiveMark}
          </p>
        </div>

        <div>
          <label>Negative Marks</label>
          <br />
          <p className="mintgreen" style={{ width: "100px", textAlign: "center" }}>
            {transformed.negativeMarks ?? transformed.negativeMark}
          </p>
        </div>
      </div>
      {questions.map((questionItem, index) => {
        const questionText = extractQuestionText(questionItem);
        const options = extractQuestionOptions(questionItem);
        const correctIndex = getCorrectOptionIndex(questionItem, options);
        const optionLabels = ["A", "B", "C", "D"];
        return (
          <div key={index} style={{ marginTop: "1%" }}>
            <div>
              <label>Question {index + 1}</label>
              <br />
              <p style={{ fontWeight: "700" }}>{questionText}</p>
            </div>
            <div className="optionsDetailsGrid">
              {options.map((opt, optIdx) => (
                <div key={optIdx}>
                  <label>Option {optionLabels[optIdx]}{optIdx === correctIndex ? " (Correct Answer)" : ""}</label>
                  <br />
                  <p className="mintgreen">{opt}</p>
                </div>
              ))}
            </div>
            <br />
          </div>
        );
      })}
    </>
  );
};

export default QuizDetails;
