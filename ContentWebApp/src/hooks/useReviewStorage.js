import { useEffect } from "react";

const STORAGE_KEY = "review_workspace_data";

const useReviewStorage = (reviewData, setReviewData) => {

  // ==========================================
  // Load Saved Data
  // ==========================================

  useEffect(() => {

    const saved =
      localStorage.getItem(STORAGE_KEY);

    if (saved) {

      try {

        const parsed = JSON.parse(saved);

        setReviewData(parsed);

      } catch (err) {

        console.error(
          "Failed to load review data",
          err
        );

      }

    }

  }, [setReviewData]);

  // ==========================================
  // Auto Save
  // ==========================================

  useEffect(() => {

    if (!reviewData) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(reviewData)
    );

  }, [reviewData]);

};

export default useReviewStorage;