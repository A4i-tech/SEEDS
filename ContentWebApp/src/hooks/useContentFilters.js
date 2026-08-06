import { useState, useEffect, useRef } from "react";
import { generateFilterOptions, applyFilters } from "../utils/filterHelpers";
import { fuzzyMatch } from "../utils/fuzzyMatch";

const matchesTitleQuery = (item, query) =>
  fuzzyMatch(item.title?.english || "", query) || fuzzyMatch(item.title?.local || "", query);

export const useContentFilters = (allContent, setContent, setIsFiltered) => {
  const [selectedValues, setSelectedValues] = useState([]);
  const [titleQuery, setTitleQuery] = useState("");
  const optionsRef = useRef([]);

  useEffect(() => {
    optionsRef.current = allContent.length > 0 ? generateFilterOptions(allContent) : [];
  }, [allContent]);

  useEffect(() => {
    const hasChipFilters = selectedValues.length > 0;
    const hasTitleQuery = titleQuery.trim().length > 0;

    if (!hasChipFilters && !hasTitleQuery) {
      setIsFiltered(false);
      setContent(allContent);
      return;
    }

    let list = hasChipFilters ? applyFilters(allContent, selectedValues, optionsRef.current) : allContent;
    if (hasTitleQuery) {
      list = list.filter((item) => matchesTitleQuery(item, titleQuery));
    }
    setIsFiltered(true);
    setContent(list);
  }, [allContent, selectedValues, titleQuery, setContent, setIsFiltered]);

  return {
    options: optionsRef.current,
    selectedValues,
    handleFilterChange: setSelectedValues,
    titleQuery,
    setTitleQuery,
  };
};
