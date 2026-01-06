import React from "react";

const QuizDetails = ({ quiz }) => {
  if (!quiz) {
    return <div>Loading quiz data...</div>;
  }

  // Handle title - can be string or object
  const title = typeof quiz.title === "object" ? quiz.title.english : quiz.title;
  const localTitle = typeof quiz.title === "object" ? quiz.title.local : quiz.localTitle;

  // Handle theme - can be string or object
  const theme = typeof quiz.theme === "object" ? quiz.theme.english : quiz.theme;
  const localTheme = typeof quiz.theme === "object" ? quiz.theme.local : quiz.localTheme;

  // Handle marks - check for both singular and plural field names
  const positiveMarks = quiz.positiveMarks ?? quiz.positiveMark ?? 0;
  const negativeMarks = quiz.negativeMarks ?? quiz.negativeMark ?? 0;

  // Handle questions - can be array of strings or array of objects
  const questions = quiz.questions || [];

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
            // Handle different question structures
            let questionText = "";
            let options = [];
            let correctOptionId = null;

            if (typeof questionItem === "string") {
              // Old format: question is a string
              questionText = questionItem;
              // Try to get options from quiz.options if it exists
              options = quiz.options?.[index] || [];
            } else if (questionItem && typeof questionItem === "object") {
              // New format: question is an object
              questionText =
                questionItem.question?.text ||
                questionItem.question ||
                questionItem.text ||
                "";
              options = questionItem.options || [];
              correctOptionId = questionItem.correct_option_id || questionItem.correctOptionId;
            }

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
                    {options.map((option, optIndex) => {
                      // Handle option as string or object
                      const optionText = typeof option === "object" ? option.text : option;
                      const optionId = typeof option === "object" ? option.id : null;
                      const isCorrect = correctOptionId
                        ? optionId === correctOptionId || optIndex === 0
                        : optIndex === 0; // Default: first option is correct if no ID provided

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
