import { useState, useEffect, useCallback } from "react";
import { generateFilterOptions, applyFilters } from "../utils/filterHelpers";

export const useContentFilters = (allContent, setContent, setIsFiltered) => {
  const [options, setOptions] = useState([]);

  /**
   * Generate filter options when content changes
   */
  useEffect(() => {
    if (Array.isArray(allContent) && allContent.length > 0) {
      setOptions(generateFilterOptions(allContent));
    } else {
      setOptions([]);
    }
  }, [allContent]);

  /**
   * Apply selected filters to content
   */
  const handleFilterChange = useCallback(
    (selectedList) => {
      if (!Array.isArray(allContent)) {
        console.warn("handleFilterChange: allContent is not an array", allContent);
        return;
      }
      const filteredList = applyFilters(allContent, selectedList, options);
      setIsFiltered(true);
      setContent(filteredList);
    },
    [allContent, options, setContent, setIsFiltered]
  );

  return {
    options,
    handleFilterChange,
  };
};
