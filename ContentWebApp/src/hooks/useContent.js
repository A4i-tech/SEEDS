import { useState, useCallback, useEffect } from "react";
import { contentService } from "../services/contentService";

const PAGE_SIZE = 50;

export const useContent = () => {
  const [content, setContent] = useState([]);
  const [allContent, setAllContent] = useState([]);
  const [paginationInfo, setPaginationInfo] = useState({
    nextCursor: null,
    hasMore: false,
    limit: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);

  /**
   * Fetch content with optional cursor for pagination
   */
  const fetchContent = useCallback(async (cursor = null, signal = null) => {
    try {
      const { data, pagination } = await contentService.getContent(
        cursor,
        PAGE_SIZE,
        signal
      );
      return { data, pagination };
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error fetching content:", error);
      }
      throw error;
    }
  }, []);

  /**
   * Load initial content
   */
  useEffect(() => {
    const loadInitialContent = async () => {
      setIsLoading(true);
      try {
        const { data, pagination } = await fetchContent(null);
        setAllContent(data);
        setContent(data);
        setPaginationInfo({
          nextCursor: pagination?.nextCursor || null,
          hasMore: !!pagination?.hasMore,
          limit: pagination?.limit || 0,
        });
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
      const { data, pagination } = await fetchContent(paginationInfo.nextCursor, ac.signal);

      if (!data.length) {
        setPaginationInfo((prev) => ({
          nextCursor: null,
          hasMore: false,
          limit: prev.limit,
        }));
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

      setPaginationInfo({
        nextCursor: pagination?.nextCursor || null,
        hasMore: !!pagination?.hasMore,
        limit: pagination?.limit || paginationInfo.limit,
      });
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
        const errorMessage = error.response?.data?.error || error.message || "Failed to delete content";
        alert(`Error deleting ${contentType}: ${errorMessage}`);
        throw error;
      }
    },
    []
  );

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
    resetFilters,
    setContent,
    setAllContent,
    setIsFiltered,
  };
};
