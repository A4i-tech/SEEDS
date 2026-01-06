import { useState, useEffect, useCallback, useRef } from "react";
import { generateFilterOptions, applyFilters } from "../utils/filterHelpers";

export const useContentFilters = (allContent, setContent, setIsFiltered) => {
  const [selectedValues, setSelectedValues] = useState([]);
  const multiselectRef = useRef(null);
  const optionsRef = useRef([]);

  useEffect(() => {
    if (allContent.length > 0) {
      optionsRef.current = generateFilterOptions(allContent);
    }
  }, [allContent]);

  const handleFilterChange = useCallback(
    (selectedList) => {
      setSelectedValues(selectedList);
      const filteredList = applyFilters(allContent, selectedList, optionsRef.current);
      setIsFiltered(true);
      setContent(filteredList);
    },
    [allContent, setContent, setIsFiltered]
  );

  const resetFilters = useCallback(() => {
    setSelectedValues([]);
    multiselectRef.current?.resetSelectedValues();
    setIsFiltered(false);
    setContent(allContent);
  }, [allContent, setContent, setIsFiltered]);

  return {
    options: optionsRef.current,
    selectedValues,
    handleFilterChange,
    resetFilters,
    multiselectRef,
  };
};
