import React from "react";
import "./QuizDetails.css";

const QuizDetails = ({ quiz }) => {
  const getTitle = () => {
    if (typeof quiz.title === 'object') {
      return quiz.title.english || quiz.title.local || 'Quiz';
    }
    return quiz.title || 'Quiz';
  };

  return (
    <div className="quiz-details">
      {/* Header Section */}
      <div className="quiz-header">
        <div className="quiz-title-section">
          <span className="quiz-type-badge">Quiz</span>
          <h1 className="quiz-title-main">{getTitle()}</h1>
        </div>
      </div>

      {/* Content Section */}
      <div className="quiz-content">
        {/* Metadata Grid */}
        <div className="quiz-metadata-grid">
          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Language</p>
            <p className="quiz-metadata-value" style={{ fontSize: '18px', color: '#0f172a' }}>
              {quiz.language || 'N/A'}
            </p>
          </div>

          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Positive Marks</p>
            <p className="quiz-metadata-value">+{quiz.positiveMark || 0}</p>
          </div>

          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Negative Marks</p>
            <p className="quiz-metadata-value" style={{ color: '#dc2626' }}>
              -{quiz.negativeMark || 0}
            </p>
          </div>

          <div className="quiz-metadata-item">
            <p className="quiz-metadata-label">Total Questions</p>
            <p className="quiz-metadata-value" style={{ fontSize: '18px', color: '#0f172a' }}>
              {quiz.questions?.length || 0}
            </p>
          </div>
        </div>

        {/* Questions Section */}
        <div className="questions-section">
          {quiz.questions?.map((question, index) => {
            const options = quiz.options?.[index] || [];
            const correctAnswer = options[0]; // Option A is the correct answer

            return (
              <div key={index} className="question-card">
                <div className="question-header">
                  <div className="question-number">{index + 1}</div>
                  <p className="question-text">{question}</p>
                </div>

                <div className="options-grid">
                  {options.map((option, optIndex) => {
                    const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, D
                    const isCorrect = optIndex === 0; // Option A is correct

                    return (
                      <div
                        key={optIndex}
                        className={`option-card ${isCorrect ? 'correct' : ''}`}
                      >
                        <p className={`option-label ${isCorrect ? 'correct-label' : ''}`}>
                          Option {optionLabel} {isCorrect && '(Correct Answer)'}
                        </p>
                        <p className={`option-value ${isCorrect ? 'correct-value' : ''}`}>
                          {option}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QuizDetails;
