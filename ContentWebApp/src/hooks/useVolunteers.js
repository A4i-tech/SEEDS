import { useState, useCallback, useEffect } from "react";
import { volunteerService } from "../services/volunteerService";
import { useFlashMessage } from "./useFlashMessage";

const fieldMessageFromValidationErrors = (details) => {
  const first = details?.validation_errors?.[0];
  if (!first) return null;
  const field = first.loc?.[first.loc.length - 1];
  return field ? `${field}: ${first.msg}` : first.msg;
};

export const useVolunteers = (enabled) => {
  const [volunteers, setVolunteers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const { message, messageType, flashMessage } = useFlashMessage();

  const fetchVolunteers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await volunteerService.getVolunteers();
      setVolunteers(data);
      setLoadError(null);
      return true;
    } catch (error) {
      const errorMessage = error.message || "Failed to load volunteers.";
      flashMessage(errorMessage, "error");
      setLoadError(errorMessage);
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
        const errorMessage =
          fieldMessageFromValidationErrors(error.details) ||
          error.message ||
          "Failed to create volunteer.";
        flashMessage(errorMessage, "error");
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

  return { volunteers, isLoading, loadError, message, messageType, createVolunteer };
};
