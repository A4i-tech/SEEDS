import { useState, useEffect, useCallback } from "react";
import { generateFilterOptions, applyFilters } from "../utils/filterHelpers";

export const useContentFilters = (allContent, setContent, setIsFiltered) => {
  const [options, setOptions] = useState([]);

  /**
   * Generate filter options when content changes
   */
  useEffect(() => {
    if (allContent.length > 0) {
      setOptions(generateFilterOptions(allContent));
    }
  }, [allContent]);

  /**
   * Apply selected filters to content
   */
  const handleFilterChange = useCallback(
    (selectedList) => {
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
