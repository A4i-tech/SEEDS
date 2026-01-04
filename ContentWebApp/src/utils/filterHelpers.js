/**
 * Generate filter options from content list
 * @param {Array} contentList - Array of content items
 * @returns {Array} Array of filter options with category, name, and id
 */
export const generateFilterOptions = (contentList) => {
  const languageSet = new Set();
  const experienceSet = new Set();

  contentList.forEach((contentItem) => {
    if (contentItem.language) {
      languageSet.add(contentItem.language.charAt(0).toUpperCase() + contentItem.language.slice(1));
    }
    if (contentItem.type) {
      experienceSet.add(contentItem.type.charAt(0).toUpperCase() + contentItem.type.slice(1));
    }
  });

  const languageOptions = Array.from(languageSet).map((language, index) => ({
    category: "Language",
    name: language,
    id: index + 1,
  }));

  const experienceOptions = Array.from(experienceSet).map((experience, index) => ({
    category: "Experience",
    name: experience,
    id: index + 1 + languageSet.size,
  }));

  return [...languageOptions, ...experienceOptions];
};

/**
 * Apply filters to content list
 * @param {Array} allContent - Complete content list
 * @param {Array} selectedFilters - Selected filter options
 * @param {Array} allOptions - All available filter options
 * @returns {Array} Filtered content list
 */
export const applyFilters = (allContent, selectedFilters, allOptions) => {
  let langs = selectedFilters
    .filter((option) => option.category === "Language")
    .map((option) => option.name.toLowerCase());

  let exps = selectedFilters
    .filter((option) => option.category === "Experience")
    .map((option) => option.name.toLowerCase());

  // If no experience filters selected, include all
  if (exps.length === 0) {
    exps = allOptions
      .filter((value) => value.category === "Experience")
      .map((value) => value.name.toLowerCase());
  }

  // If no language filters selected, include all
  if (langs.length === 0) {
    langs = allOptions
      .filter((value) => value.category === "Language")
      .map((value) => value.name.toLowerCase());
  }

  return allContent.filter(
    (contentItem) =>
      langs.includes(contentItem.language.toLowerCase()) &&
      exps.includes(contentItem.type.toLowerCase())
  );
};
