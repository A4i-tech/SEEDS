import React from "react";

const QuizDetails = ({ quiz }) => {
  const titleEnglish = quiz.title.english;
  const titleLocal = quiz.title.local;
  const themeEnglish = quiz.theme.english;
  const themeLocal = quiz.theme.local;
  const questions = quiz.questions;

  return (
    <div className="content-detail-card">
      <h2 className="content-detail-title">Quiz</h2>
      <div className="content-detail-grid">
        <div className="content-detail-field">
          <span className="content-detail-label">Title</span>
          <span className="content-detail-value">{titleEnglish}</span>
          {titleLocal && <span className="content-detail-value">{titleLocal}</span>}
        </div>
        <div className="content-detail-field">
          <span className="content-detail-label">Language</span>
          <span className="content-detail-value">{quiz.language}</span>
        </div>
        <div className="content-detail-field">
          <span className="content-detail-label">Theme</span>
          <span className="content-detail-value">{themeEnglish}</span>
          {themeLocal && <span className="content-detail-value">{themeLocal}</span>}
        </div>
        <div className="content-detail-field">
          <span className="content-detail-label">Positive Marks</span>
          <span className="content-detail-badge">{quiz.positive_marks}</span>
        </div>
        <div className="content-detail-field">
          <span className="content-detail-label">Negative Marks</span>
          <span className="content-detail-badge">{quiz.negative_marks}</span>
        </div>
      </div>

      {questions.map((q, index) => {
        const optionLabels = ["A", "B", "C", "D"];
        return (
          <div key={index} className="quiz-question-block">
            <span className="content-detail-label">Question {index + 1}</span>
            <p className="quiz-question-text">{q.question.text}</p>
            <div className="content-detail-options-grid">
              {q.options.map((opt, optIdx) => (
                <div key={opt.id} className="content-detail-field">
                  <span className="content-detail-label">
                    Option {optionLabels[optIdx]}
                    {opt.id === q.correct_option_id ? " (Correct Answer)" : ""}
                  </span>
                  <span className="content-detail-badge">{opt.text}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default QuizDetails;
