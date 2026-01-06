/**
 * Quiz Data Transformation Utility
 * 
 * Standardizes quiz data structure transformation from MongoDB/API format
 * to UI-expected format. Handles both single quiz and array of quizzes.
 */

/**
 * Transform a single quiz item to UI-expected structure
 * @param {Object} quiz - Quiz data from MongoDB/API
 * @returns {Object} Transformed quiz data
 */
export const transformQuizItem = (quiz) => {
  if (!quiz) {
    return null;
  }

  // Ensure id field exists (use _id if id not present)
  const id = quiz.id || quiz._id || null;

  // Handle title - can be string or object
  let title = quiz.title;
  if (typeof title === "string") {
    // If title is string, create object structure
    title = {
      english: title,
      local: quiz.localTitle || "",
      audioUrl: quiz.titleAudio || "",
    };
  } else if (title && typeof title === "object") {
    // Ensure all fields exist
    title = {
      english: title.english || "",
      local: title.local || quiz.localTitle || "",
      audioUrl: title.audioUrl || quiz.titleAudio || "",
    };
  } else {
    // Fallback
    title = {
      english: "",
      local: "",
      audioUrl: "",
    };
  }

  // Handle theme - can be string or object
  let theme = quiz.theme;
  if (typeof theme === "string") {
    // If theme is string, create object structure
    theme = {
      english: theme,
      local: quiz.localTheme || "",
      audioUrl: quiz.themeAudio || "",
    };
  } else if (theme && typeof theme === "object") {
    // Ensure all fields exist
    theme = {
      english: theme.english || "",
      local: theme.local || quiz.localTheme || "",
      audioUrl: theme.audioUrl || quiz.themeAudio || "",
    };
  } else {
    // Fallback
    theme = {
      english: "",
      local: "",
      audioUrl: "",
    };
  }

  // Handle marks - check for both singular and plural field names
  const positiveMarks = quiz.positiveMarks ?? quiz.positiveMark ?? 0;
  const negativeMarks = quiz.negativeMarks ?? quiz.negativeMark ?? 0;

  // Build transformed quiz object
  const transformed = {
    ...quiz,
    id,
    _id: quiz._id || id,
    type: quiz.type || "quiz",
    title,
    theme,
    positiveMarks,
    negativeMarks,
    language: quiz.language || "",
    isPullModel: quiz.isPullModel ?? false,
    isTeacherApp: quiz.isTeacherApp ?? false,
    isDeleted: quiz.isDeleted ?? false,
    creation_time: quiz.creation_time || 0,
    questions: quiz.questions || [],
  };

  // Remove old format fields if they exist (to avoid confusion)
  if (transformed.localTitle) {
    delete transformed.localTitle;
  }
  if (transformed.localTheme) {
    delete transformed.localTheme;
  }
  if (transformed.titleAudio) {
    delete transformed.titleAudio;
  }
  if (transformed.themeAudio) {
    delete transformed.themeAudio;
  }
  if (transformed.positiveMark && transformed.positiveMarks) {
    delete transformed.positiveMark;
  }
  if (transformed.negativeMark && transformed.negativeMarks) {
    delete transformed.negativeMark;
  }

  return transformed;
};

/**
 * Transform quiz data (single item or array) to UI-expected structure
 * @param {Object|Array} quizData - Quiz data from MongoDB/API
 * @returns {Object|Array} Transformed quiz data
 */
export const transformQuizData = (quizData) => {
  if (!quizData) {
    return null;
  }

  // Handle array of quizzes
  if (Array.isArray(quizData)) {
    return quizData.map((quiz) => transformQuizItem(quiz)).filter((quiz) => quiz !== null);
  }

  // Handle single quiz
  return transformQuizItem(quizData);
};

/**
 * Extract question text from a question object
 * Handles different question structures (old and new format)
 * @param {Object|String} questionItem - Question item (can be object or string)
 * @returns {String} Question text
 */
export const extractQuestionText = (questionItem) => {
  if (!questionItem) {
    return "";
  }

  if (typeof questionItem === "string") {
    return questionItem;
  }

  if (typeof questionItem === "object") {
    return (
      questionItem.question?.text ||
      questionItem.question ||
      questionItem.text ||
      ""
    );
  }

  return "";
};

/**
 * Extract options array from a question object
 * Handles different option structures (old and new format)
 * @param {Object} questionItem - Question item
 * @returns {Array} Array of option texts
 */
export const extractQuestionOptions = (questionItem) => {
  if (!questionItem || typeof questionItem !== "object") {
    return [];
  }

  const options = questionItem.options || [];

  // Transform options to array of strings
  return options.map((opt) => {
    if (typeof opt === "string") {
      return opt;
    }
    if (typeof opt === "object") {
      return opt.text || "";
    }
    return "";
  });
};

/**
 * Get correct option index from question object
 * @param {Object} questionItem - Question item
 * @param {Array} options - Options array (from extractQuestionOptions)
 * @returns {Number} Index of correct option (-1 if not found)
 */
export const getCorrectOptionIndex = (questionItem, options = []) => {
  if (!questionItem || typeof questionItem !== "object") {
    return 0; // Default to first option
  }

  const correctOptionId =
    questionItem.correct_option_id || questionItem.correctOptionId;

  if (!correctOptionId) {
    return 0; // Default to first option if no ID specified
  }

  // Find index by matching option ID
  const optionIds = questionItem.options || [];
  const index = optionIds.findIndex(
    (opt) =>
      (typeof opt === "object" ? opt.id : null) === correctOptionId
  );

  return index >= 0 ? index : 0;
};

/**
 * Normalize quiz data for display in table/list
 * Ensures all required fields for ContentTable are present
 * @param {Object} quiz - Quiz data
 * @returns {Object} Normalized quiz data
 */
export const normalizeQuizForTable = (quiz) => {
  const transformed = transformQuizItem(quiz);

  if (!transformed) {
    return null;
  }

  // Ensure all fields required by ContentTable are present
  return {
    ...transformed,
    id: transformed.id || transformed._id,
    type: "quiz",
    title: transformed.title || { english: "", local: "" },
    theme: transformed.theme || { english: "", local: "" },
    language: transformed.language || "",
  };
};

/**
 * Check if an item is a quiz
 * @param {Object} item - Content item
 * @returns {Boolean} True if item is a quiz
 */
export const isQuiz = (item) => {
  return item && (item.type === "quiz" || item._id || item.id);
};

/**
 * Validate quiz data structure
 * @param {Object} quiz - Quiz data to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
export const validateQuizData = (quiz) => {
  const errors = [];

  if (!quiz) {
    return { isValid: false, errors: ["Quiz data is null or undefined"] };
  }

  // Check required fields
  if (!quiz.id && !quiz._id) {
    errors.push("Quiz missing id or _id field");
  }

  const title = quiz.title;
  if (!title || (typeof title === "object" && !title.english && !title.local)) {
    errors.push("Quiz missing title");
  }

  if (!quiz.language) {
    errors.push("Quiz missing language field");
  }

  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push("Quiz missing questions or questions array is empty");
  }

  // Validate questions structure
  if (Array.isArray(quiz.questions)) {
    quiz.questions.forEach((q, index) => {
      const questionText = extractQuestionText(q);
      if (!questionText) {
        errors.push(`Question ${index + 1} missing text`);
      }

      const options = extractQuestionOptions(q);
      if (options.length < 2) {
        errors.push(`Question ${index + 1} has less than 2 options`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export default {
  transformQuizItem,
  transformQuizData,
  extractQuestionText,
  extractQuestionOptions,
  getCorrectOptionIndex,
  normalizeQuizForTable,
  isQuiz,
  validateQuizData,
};

