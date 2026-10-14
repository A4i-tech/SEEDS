import { useState, useCallback, useEffect } from "react";
import { volunteerService } from "../services/volunteerService";
import { useFlashMessage } from "./useFlashMessage";
import { getRole } from "../utils/authHelpers";
import { USER_ROLES } from "../Constants";

export const useVolunteers = () => {
  const [volunteers, setVolunteers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { message, messageType, flashMessage } = useFlashMessage();

  const fetchVolunteers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await volunteerService.getVolunteers();
      setVolunteers(data);
    } catch (error) {
      flashMessage(error.message || "Failed to load volunteers.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [flashMessage]);

  useEffect(() => {
    if (getRole() === USER_ROLES.TENANT) {
      fetchVolunteers();
    }
  }, [fetchVolunteers]);

  const createVolunteer = useCallback(
    async (name, email, password) => {
      if (!name || !email || !password) {
        flashMessage("Name, email, and password are required.", "error");
        return false;
      }
      try {
        await volunteerService.createVolunteer(name, email, password);
        flashMessage("Volunteer created successfully!", "success");
        await fetchVolunteers();
        return true;
      } catch (error) {
        flashMessage(error.message || "Failed to create volunteer.", "error");
        return false;
      }
    },
    [fetchVolunteers, flashMessage]
  );

  return { volunteers, isLoading, message, messageType, createVolunteer };
};
