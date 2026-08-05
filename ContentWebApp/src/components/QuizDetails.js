import React from "react";

const QuizDetails = ({ quiz }) => {
  const titleEnglish = quiz.title.english;
  const titleLocal = quiz.title.local;
  const themeEnglish = quiz.theme.english;
  const themeLocal = quiz.theme.local;
  const questions = quiz.questions;

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
            <b>{quiz.language}</b>
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
          <p className="mintgreen marks-badge">{quiz.positive_marks}</p>
        </div>

        <div>
          <label>Negative Marks</label>
          <br />
          <p className="mintgreen marks-badge">{quiz.negative_marks}</p>
        </div>
      </div>
      {questions.map((q, index) => {
        const optionLabels = ["A", "B", "C", "D"];
        return (
          <div key={index} className="quiz-question-block">
            <div>
              <label>Question {index + 1}</label>
              <br />
              <p className="quiz-question-text">{q.question.text}</p>
            </div>
            <div className="optionsDetailsGrid">
              {q.options.map((opt, optIdx) => (
                <div key={opt.id}>
                  <label>Option {optionLabels[optIdx]}{opt.id === q.correct_option_id ? " (Correct Answer)" : ""}</label>
                  <br />
                  <p className="mintgreen">{opt.text}</p>
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
