import { useCallback, useEffect, useState } from "react";
import { contentCreatorService } from "../services/contentCreatorService";
import { useAuth } from "./useAuth";

const isValidEmail = (email) => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

export const useContentCreators = (activeTab) => {
  const [contentCreators, setContentCreators] = useState([]);
  const [creatorMessage, setCreatorMessage] = useState("");
  const { getAuthHeaders } = useAuth();

  const fetchContentCreators = useCallback(
    async (signal = null) => {
      try {
        const creators = await contentCreatorService.getContentCreators(getAuthHeaders(), signal);
        setContentCreators(Array.isArray(creators) ? creators : []);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Fetch content creators error:", error);
        }
      }
    },
    [getAuthHeaders]
  );

  useEffect(() => {
    const ac = new AbortController();
    if (activeTab === "registration") {
      fetchContentCreators(ac.signal);
    }
    return () => ac.abort();
  }, [activeTab, fetchContentCreators]);

  const registerContentCreator = useCallback(
    async ({ name, email, password }) => {
      if (!name || !email || !password) {
        setCreatorMessage("Name, email, and password are required.");
        setTimeout(() => setCreatorMessage(""), 3000);
        return false;
      }

      if (!isValidEmail(email)) {
        setCreatorMessage("Please provide a valid email.");
        setTimeout(() => setCreatorMessage(""), 3000);
        return false;
      }

      try {
        await contentCreatorService.registerContentCreator(
          {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
          },
          getAuthHeaders()
        );
        setCreatorMessage("Content creator added successfully.");
        await fetchContentCreators();
        setTimeout(() => setCreatorMessage(""), 3000);
        return true;
      } catch (error) {
        console.error("Content creator registration error:", error);
        const message = error?.message || "Failed to register content creator.";
        setCreatorMessage(message);
        setTimeout(() => setCreatorMessage(""), 3000);
        return false;
      }
    },
    [fetchContentCreators, getAuthHeaders]
  );

  return {
    contentCreators,
    registerContentCreator,
    creatorMessage,
  };
};
