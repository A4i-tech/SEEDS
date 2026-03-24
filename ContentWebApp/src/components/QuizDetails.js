import React from "react";
import { transformQuizItem, extractQuestionText, extractQuestionOptions, getCorrectOptionIndex } from "../utils/quizDataTransform";

const QuizDetails = ({ quiz }) => {
  const transformed = transformQuizItem(quiz);
  const titleEnglish = transformed.title?.english ?? transformed.title;
  const titleLocal = transformed.title?.local ?? quiz.localTitle;
  const themeEnglish = transformed.theme?.english ?? transformed.theme;
  const themeLocal = transformed.theme?.local ?? quiz.localTheme;
  const questions = transformed.questions || [];

  return (
    <>
      <h2>Quiz</h2>
      <div className="metadataGrid">
        <div>
          <div>Title</div>
          <p>
            <b>{titleEnglish}</b>
            {titleLocal && (
              <>
                <br />
                <b>{titleLocal}</b>
              </>
            )}
          </p>
        </div>

        <div>
          <div>Language</div>
          <p>
            <b>{transformed.language}</b>
          </p>
        </div>

        <div>
          <div>Theme</div>
          <p>
            <b>{themeEnglish}</b>
            {themeLocal && (
              <>
                <br />
                <b>{themeLocal}</b>
              </>
            )}
          </p>
        </div>

        <div>
          <label>Positive Marks</label>
          <br />
          <p className="mintgreen marks-badge">{transformed.positiveMarks}</p>
        </div>

        <div>
          <label>Negative Marks</label>
          <br />
          <p className="mintgreen marks-badge">{transformed.negativeMarks}</p>
        </div>
      </div>
      {questions.map((questionItem, index) => {
        const questionText = extractQuestionText(questionItem);
        const options = extractQuestionOptions(questionItem);
        const correctIndex = getCorrectOptionIndex(questionItem, options);
        const optionLabels = ["A", "B", "C", "D"];
        return (
          <div key={index} className="quiz-question-block">
            <div>
              <label>Question {index + 1}</label>
              <br />
              <p className="quiz-question-text">{questionText}</p>
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
