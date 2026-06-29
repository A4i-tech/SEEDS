/**
 * Extract question text from a question object
 * @param {Object} questionItem
 * @returns {string}
 */
export const extractQuestionText = (questionItem) => {
  return questionItem.question.text;
};

/**
 * Extract option texts from a question object
 * @param {Object} questionItem
 * @returns {string[]}
 */
export const extractQuestionOptions = (questionItem) => {
  return questionItem.options.map((opt) => opt.text);
};

/**
 * Get index of correct option
 * @param {Object} questionItem
 * @returns {number}
 */
export const getCorrectOptionIndex = (questionItem) => {
  return questionItem.options.findIndex((opt) => opt.id === questionItem.correct_option_id);
};

/**
 * Check if an item is a quiz
 * @param {Object} item
 * @returns {boolean}
 */
export const isQuiz = (item) => item.type === "quiz";

export default { extractQuestionText, extractQuestionOptions, getCorrectOptionIndex, isQuiz };
