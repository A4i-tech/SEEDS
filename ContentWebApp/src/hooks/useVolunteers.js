import { useState, useCallback, useEffect, useRef } from "react";
import { volunteerService } from "../services/volunteerService";
import { getRole } from "../utils/authHelpers";

export const useVolunteers = (activeTab) => {
  const [volunteers, setVolunteers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const flashTimeoutRef = useRef(null);

  const flash = useCallback((msg, type = "success") => {
    setMessage(msg);
    setMessageType(type);
    clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      setMessage("");
      setMessageType("success");
    }, 3000);
  }, []);

  useEffect(() => () => clearTimeout(flashTimeoutRef.current), []);

  const fetchVolunteers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await volunteerService.getVolunteers();
      setVolunteers(data);
    } catch (error) {
      console.error("Error fetching volunteers:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "registration" && getRole() === "tenant") {
      fetchVolunteers();
    }
  }, [activeTab, fetchVolunteers]);

  const createVolunteer = useCallback(
    async (name, email, password) => {
      if (!name || !email || !password) {
        flash("Name, email, and password are required.", "error");
        return false;
      }
      try {
        await volunteerService.createVolunteer(name, email, password);
        flash("Volunteer created successfully!", "success");
        await fetchVolunteers();
        return true;
      } catch (error) {
        flash(error.message || "Failed to create volunteer.", "error");
        return false;
      }
    },
    [fetchVolunteers, flash]
  );

  return { volunteers, isLoading, message, messageType, createVolunteer };
};
