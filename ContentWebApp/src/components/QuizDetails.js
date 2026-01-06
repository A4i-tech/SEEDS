import React from "react";
import {
  transformQuizItem,
  extractQuestionText,
  extractQuestionOptions,
  getCorrectOptionIndex,
} from "../utils/quizDataTransform";
import "./QuizDetails.css";

const QuizDetails = ({ quiz }) => {
  if (!quiz) {
    return (
      <div className="quiz-details">
        <div className="content-details-loading">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading quiz data...</p>
        </div>
      </div>
    );
  }

  // Transform quiz data to ensure consistent structure
  const transformedQuiz = transformQuizItem(quiz);

  // Handle title - can be string or object
  const getTitle = () => {
    if (typeof transformedQuiz.title === "object") {
      return transformedQuiz.title.english || transformedQuiz.title.local || "Quiz";
    }
    return transformedQuiz.title || "Quiz";
  };

  const getLocalTitle = () => {
    if (typeof transformedQuiz.title === "object") {
      return transformedQuiz.title.local;
    }
    return transformedQuiz.localTitle;
  };

  // Handle theme - can be string or object
  const getTheme = () => {
    if (typeof transformedQuiz.theme === "object") {
      return transformedQuiz.theme.english || transformedQuiz.theme.local || "";
    }
    return transformedQuiz.theme || "";
  };

  const getLocalTheme = () => {
    if (typeof transformedQuiz.theme === "object") {
      return transformedQuiz.theme.local;
    }
    return transformedQuiz.localTheme;
  };

  // Handle marks - already normalized by transformQuizItem
  const positiveMarks = transformedQuiz.positiveMarks ?? 0;
  const negativeMarks = transformedQuiz.negativeMarks ?? 0;

  // Handle questions - can be array of strings or array of objects
  const questions = transformedQuiz.questions || [];

  return (
    <div className="quiz-details">
      {/* Header Section */}
      <div className="quiz-header">
        <div className="quiz-title-section">
          <span className="quiz-type-badge">Quiz</span>
          <h1 className="quiz-title-main">{getTitle()}</h1>
          {getLocalTitle() && getLocalTitle() !== getTitle() && (
            <p className="quiz-title-local" style={{ marginTop: "8px", color: "#666", fontSize: "0.9em" }}>
              {getLocalTitle()}
            </p>
          )}
        </div>
      </div>

      {/* Content Section */}
      <div className="quiz-content">
        {/* Metadata Grid */}
        <div className="quiz-metadata-grid">
          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Language</p>
            <p className="quiz-metadata-value" style={{ fontSize: "18px", color: "#0f172a" }}>
              {transformedQuiz.language || "N/A"}
            </p>
          </div>

          {getTheme() && (
            <div className="quiz-metadata-item">
              <p className="quiz-metadata-label">Theme</p>
              <p className="quiz-metadata-value" style={{ fontSize: "18px", color: "#0f172a" }}>
                {getTheme()}
                {getLocalTheme() && getLocalTheme() !== getTheme() && (
                  <span style={{ display: "block", fontSize: "0.85em", color: "#666", marginTop: "4px" }}>
                    {getLocalTheme()}
                  </span>
                )}
              </p>
            </div>
          )}

          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Positive Marks</p>
            <p className="quiz-metadata-value">+{positiveMarks}</p>
          </div>

          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Negative Marks</p>
            <p className="quiz-metadata-value" style={{ color: "#dc2626" }}>
              -{negativeMarks}
            </p>
          </div>

          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Total Questions</p>
            <p className="quiz-metadata-value" style={{ fontSize: "18px", color: "#0f172a" }}>
              {questions.length}
            </p>
          </div>
        </div>

        {/* Questions Section */}
        <div className="questions-section">
          {questions.length > 0 ? (
            questions.map((questionItem, index) => {
              // Use utility functions to extract question data
              const questionText = extractQuestionText(questionItem);
              const options = extractQuestionOptions(questionItem);
              const correctOptionIndex = getCorrectOptionIndex(questionItem, options);
              const correctOptionId = questionItem.correct_option_id || questionItem.correctOptionId;

              return (
                <div key={index} className="question-card">
                  <div className="question-header">
                    <div className="question-number">{index + 1}</div>
                    <p className="question-text">{questionText}</p>
                  </div>

                  {options.length > 0 && (
                    <div className="options-grid">
                      {options.map((optionText, optIndex) => {
                        const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, D
                        // Check if this is the correct option
                        const isCorrect = correctOptionId
                          ? (questionItem.options?.[optIndex]?.id === correctOptionId)
                          : optIndex === correctOptionIndex;

                        return (
                          <div
                            key={optIndex}
                            className={`option-card ${isCorrect ? "correct" : ""}`}
                          >
                            <p className={`option-label ${isCorrect ? "correct-label" : ""}`}>
                              Option {optionLabel} {isCorrect && "(Correct Answer)"}
                            </p>
                            <p className={`option-value ${isCorrect ? "correct-value" : ""}`}>
                              {optionText}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="question-card">
              <p style={{ color: "#666", textAlign: "center", padding: "20px" }}>
                No questions available.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizDetails;
