import React from "react";

const QuizDetails = ({ quiz }) => {
  const optionLabels = ["A", "B", "C", "D"];

  return (
    <>
      <h2>Quiz</h2>
      <div className="metadataGrid">
        <div>
          <div>Title</div>
          <p>
            <b>{quiz.title.english}</b>
            <br />
            <b>{quiz.title.local}</b>
          </p>
        </div>

        <div>
          <div>Language</div>
          <p><b>{quiz.language}</b></p>
        </div>

        <div>
          <div>Theme</div>
          <p>
            <b>{quiz.theme.english}</b>
            <br />
            <b>{quiz.theme.local}</b>
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

      {quiz.questions.map((q, i) => {
        const correctIdx = q.options.findIndex((o) => o.id === q.correct_option_id);
        return (
          <div key={i} className="quiz-question-block">
            <div>
              <label>Question {i + 1}</label>
              <br />
              <p className="quiz-question-text">{q.question.text}</p>
            </div>
            <div className="optionsDetailsGrid">
              {q.options.map((opt, optIdx) => (
                <div key={optIdx}>
                  <label>Option {optionLabels[optIdx]}{optIdx === correctIdx ? " (Correct Answer)" : ""}</label>
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
