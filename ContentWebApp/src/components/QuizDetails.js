import React from "react";
import {
  transformQuizItem,
  extractQuestionText,
  extractQuestionOptions,
  getCorrectOptionIndex,
} from "../utils/quizDataTransform";

const QuizDetails = ({ quiz }) => {
  if (!quiz) {
    return <div>Loading quiz data...</div>;
  }

  // Transform quiz data to ensure consistent structure
  const transformedQuiz = transformQuizItem(quiz);

  // Handle title - can be string or object
  const title = typeof transformedQuiz.title === "object" ? transformedQuiz.title.english : transformedQuiz.title;
  const localTitle = typeof transformedQuiz.title === "object" ? transformedQuiz.title.local : transformedQuiz.localTitle;

  // Handle theme - can be string or object
  const theme = typeof transformedQuiz.theme === "object" ? transformedQuiz.theme.english : transformedQuiz.theme;
  const localTheme = typeof transformedQuiz.theme === "object" ? transformedQuiz.theme.local : transformedQuiz.localTheme;

  // Handle marks - already normalized by transformQuizItem
  const positiveMarks = transformedQuiz.positiveMarks ?? 0;
  const negativeMarks = transformedQuiz.negativeMarks ?? 0;

  // Handle questions - can be array of strings or array of objects
  const questions = transformedQuiz.questions || [];

  return (
    <>
      <h2>Quiz Details</h2>
      <div className="metadataGrid">
        <div>
          <div>Title</div>
          <p>
            <b>{title}</b>
            {localTitle && (
              <>
                <br />
                <span style={{ color: "#666", fontSize: "0.9em" }}>{localTitle}</span>
              </>
            )}
          </p>
        </div>

        <div>
          <div>Theme</div>
          <p>
            <b>{theme}</b>
            {localTheme && (
              <>
                <br />
                <span style={{ color: "#666", fontSize: "0.9em" }}>{localTheme}</span>
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
          <label>Positive Marks</label>
          <br />
          <p className="mintgreen" style={{ width: "100px", textAlign: "center" }}>
            {positiveMarks}
          </p>
        </div>

        <div>
          <label>Negative Marks</label>
          <br />
          <p className="mintgreen" style={{ width: "100px", textAlign: "center" }}>
            {negativeMarks}
          </p>
        </div>

        <div>
          <label>Questions Count</label>
          <br />
          <p style={{ width: "100px", textAlign: "center" }}>{questions.length}</p>
        </div>
      </div>

      {questions.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <h3>Questions</h3>
          {questions.map((questionItem, index) => {
            // Use utility functions to extract question data
            const questionText = extractQuestionText(questionItem);
            const options = extractQuestionOptions(questionItem);
            const correctOptionIndex = getCorrectOptionIndex(questionItem, options);
            const correctOptionId = questionItem.correct_option_id || questionItem.correctOptionId;

            return (
              <div key={index} style={{ marginTop: "20px", padding: "15px", border: "1px solid #ddd", borderRadius: "8px" }}>
                <div>
                  <label style={{ fontWeight: "bold", fontSize: "1.1em" }}>
                    Question {index + 1}
                  </label>
                  <br />
                  <p style={{ fontWeight: "700", marginTop: "8px" }}>{questionText}</p>
                </div>
                {options.length > 0 && (
                  <div className="optionsDetailsGrid" style={{ marginTop: "15px" }}>
                    {options.map((optionText, optIndex) => {
                      // Check if this is the correct option
                      const isCorrect = correctOptionId
                        ? (questionItem.options?.[optIndex]?.id === correctOptionId)
                        : optIndex === correctOptionIndex;

                      return (
                        <div
                          key={optIndex}
                          style={{
                            padding: "10px",
                            backgroundColor: isCorrect ? "#d4edda" : "#f8f9fa",
                            borderRadius: "4px",
                            border: isCorrect ? "2px solid #28a745" : "1px solid #dee2e6",
                          }}
                        >
                          <label>
                            Option {String.fromCharCode(65 + optIndex)}
                            {isCorrect && (
                              <span style={{ color: "#28a745", marginLeft: "8px", fontWeight: "bold" }}>
                                ✓ Correct
                              </span>
                            )}
                          </label>
                          <br />
                          <p style={{ marginTop: "5px", color: isCorrect ? "#155724" : "#333" }}>
                            {optionText}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {questions.length === 0 && <p style={{ marginTop: "20px", color: "#666" }}>No questions available.</p>}
    </>
  );
};

export default QuizDetails;
