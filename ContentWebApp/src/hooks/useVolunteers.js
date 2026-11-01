import { useState, useCallback, useEffect } from "react";
import { volunteerService } from "../services/volunteerService";
import { useFlashMessage } from "./useFlashMessage";

export const useVolunteers = (enabled) => {
  const [volunteers, setVolunteers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { message, messageType, flashMessage } = useFlashMessage();

  const fetchVolunteers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await volunteerService.getVolunteers();
      setVolunteers(data);
      return true;
    } catch (error) {
      flashMessage(error.message || "Failed to load volunteers.", "error");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [flashMessage]);

  useEffect(() => {
    if (enabled) fetchVolunteers();
  }, [enabled, fetchVolunteers]);

  const createVolunteer = useCallback(
    async (name, email, password) => {
      try {
        await volunteerService.createVolunteer(name, email, password);
      } catch (error) {
        flashMessage(error.message || "Failed to create volunteer.", "error");
        return false;
      }
      const refreshed = await fetchVolunteers();
      flashMessage(
        refreshed
          ? "Volunteer created successfully!"
          : "Volunteer created, but refreshing the list failed.",
        refreshed ? "success" : "error"
      );
      return true;
    },
    [fetchVolunteers, flashMessage]
  );

  return { volunteers, isLoading, message, messageType, createVolunteer };
};
