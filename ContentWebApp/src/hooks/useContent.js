import { useState, useCallback, useEffect, useRef } from "react";
import { contentService } from "../services/contentService";
import { subodhaService } from "../services/subodhaService";

const PAGE_SIZE = 50;

const mapSubodhaCourse = (course) => ({
  id: course.id,
  source: "subodha",
  title: { english: course.name, local: "" },
  theme: { english: "", local: "" },
  language: course.language,
  type: "subodha-course",
  is_teacher_app: false,
  is_pull_model: false,
  hidden: course.hidden,
  synced: course.synced,
  lastSyncedAt: course.lastSyncedAt,
});

export const useContent = () => {
  const [content, setContent] = useState([]);
  const [allContent, setAllContent] = useState([]);
  const [paginationInfo, setPaginationInfo] = useState({
    nextCursor: null,
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);
  const isFilteredRef = useRef(isFiltered);
  isFilteredRef.current = isFiltered;

  /**
   * Fetch Subodha courses and merge them into the content list (source: "subodha").
   * Safe to call repeatedly (e.g. after a sync completes) — replaces the prior
   * Subodha slice each time rather than appending duplicates.
   */
  const loadSubodhaCourses = useCallback(async () => {
    try {
      const courses = await subodhaService.getCourses();
      const mapped = courses.map(mapSubodhaCourse);
      setAllContent((prevAll) => {
        const merged = [...prevAll.filter((item) => item.source !== "subodha"), ...mapped];
        if (!isFilteredRef.current) setContent(merged);
        return merged;
      });
    } catch (error) {
      console.error("Error loading Subodha courses:", error);
    }
  }, []);

  useEffect(() => {
    loadSubodhaCourses();
  }, [loadSubodhaCourses]);

  /**
   * Fetch content with optional cursor for pagination
   * Error handling is delegated to contentService
   */
  const fetchContent = useCallback(async (cursor = null, signal = null) => {
    const page = await contentService.getContent(cursor, PAGE_SIZE, signal);
    return { data: page.items, nextCursor: page.next_cursor, hasMore: page.has_more };
  }, []);

  /**
   * Load initial content
   */
  useEffect(() => {
    const loadInitialContent = async () => {
      setIsLoading(true);
      try {
        const { data, nextCursor, hasMore } = await fetchContent(null);
        setAllContent(data);
        setContent(data);
        setPaginationInfo({ nextCursor, hasMore });
        setIsFiltered(false);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error loading initial content:", error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialContent();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load more content (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!paginationInfo.hasMore || !paginationInfo.nextCursor || isLoading) {
      return;
    }

    setIsLoading(true);
    const ac = new AbortController();

    try {
      const { data, nextCursor, hasMore } = await fetchContent(paginationInfo.nextCursor, ac.signal);

      if (!data.length) {
        setPaginationInfo({ nextCursor: null, hasMore: false });
        return;
      }

      setAllContent((prevAll) => {
        const existingIds = new Set(prevAll.map((c) => c.id));
        const merged = [...prevAll];
        data.forEach((item) => {
          if (!existingIds.has(item.id)) {
            merged.push(item);
          }
        });
        if (!isFiltered) {
          setContent(merged);
        }
        return merged;
      });

      setPaginationInfo({ nextCursor, hasMore });
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error loading more content:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [paginationInfo, fetchContent, isFiltered, isLoading]);

  /**
   * Delete content item
   */
  const deleteContent = useCallback(
    async (type, id) => {
      const contentType = type === "quiz" ? "quiz" : "content";
      const confirmMessage = `Are you sure you want to delete this ${contentType}? This action cannot be undone.`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }

      try {
        await contentService.deleteContent(type, id);
        // Remove from both content and allContent (backend always provides id field)
        setContent((prev) => prev.filter((item) => item.id !== id));
        setAllContent((prev) => prev.filter((item) => item.id !== id));
        // Show success message
        alert(`${contentType.charAt(0).toUpperCase() + contentType.slice(1)} deleted successfully.`);
      } catch (error) {
        console.error("Error deleting content:", error);
        let errorMessage = error.response?.data?.error || error.message || "Failed to delete content";
        try {
          const parsed = JSON.parse(errorMessage);
          errorMessage = parsed?.error || parsed?.message || errorMessage;
        } catch (_) {}
        if (errorMessage === "Content not found" || errorMessage === "Unauthorized") {
          errorMessage = "You do not have permission to delete this item.";
        }
        alert(`Error deleting ${contentType}: ${errorMessage}`);
      }
    },
    []
  );

  /**
   * Delete a Subodha course's local synced copy (does not touch Subodha itself)
   */
  const deleteSubodhaCourse = useCallback(async (courseId, name) => {
    if (!window.confirm(`Remove the synced copy of "${name || courseId}"? It can be re-synced later.`)) {
      return;
    }
    try {
      await subodhaService.deleteCourse(courseId);
      setContent((prev) => prev.filter((item) => item.id !== courseId));
      setAllContent((prev) => prev.filter((item) => item.id !== courseId));
      alert("Course removed successfully.");
    } catch (error) {
      console.error("Error deleting Subodha course:", error);
      alert(`Error deleting course: ${error.message}`);
    }
  }, []);

  /**
   * Reset filters to show all content
   */
  const resetFilters = useCallback(() => {
    setIsFiltered(false);
    setContent(allContent);
  }, [allContent]);

  return {
    content,
    allContent,
    isLoading,
    paginationInfo,
    isFiltered,
    loadMore,
    deleteContent,
    deleteSubodhaCourse,
    resetFilters,
    refreshSubodhaCourses: loadSubodhaCourses,
    setContent,
    setAllContent,
    setIsFiltered,
  };
};
