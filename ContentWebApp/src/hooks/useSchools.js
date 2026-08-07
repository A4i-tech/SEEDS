import { useState, useCallback, useEffect } from "react";
import { schoolService } from "../services/schoolService";
import { getRole } from "../utils/authHelpers";

export const useSchools = (activeTab) => {
  const [schools, setSchools] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const flash = useCallback((msg, type = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("success");
    }, 3000);
  }, []);

  const fetchSchools = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await schoolService.getSchools();
      setSchools(data);
    } catch (error) {
      console.error("Error fetching schools:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = getRole();
    if (activeTab === "registration" && (role === "tenant" || role === "school_admin")) {
      fetchSchools();
    }
  }, [activeTab, fetchSchools]);

  const createSchool = useCallback(
    async (name, email, password) => {
      if (!name || !email || !password) {
        flash("Name, email, and password are required.", "error");
        return false;
      }
      try {
        await schoolService.createSchool(name, email, password);
        flash("School created successfully!", "success");
        await fetchSchools();
        return true;
      } catch (error) {
        flash(error.message || "Failed to create school.", "error");
        return false;
      }
    },
    [fetchSchools]
  );

  const updateSchool = useCallback(async (schoolId, name, email, password) => {
    if (!name || !email) {
      flash("Name and email are required.", "error");
      return false;
    }
    try {
      const updated = await schoolService.updateSchool(schoolId, name, email, password);
      setSchools((prev) => prev.map((s) => (s.id === schoolId ? updated : s)));
      flash("School updated successfully!", "success");
      return true;
    } catch (error) {
      flash(error.message || "Failed to update school.", "error");
      return false;
    }
  }, []);

  const deleteSchool = useCallback(async (schoolId) => {
    if (!window.confirm("Delete this school?")) return;
    try {
      await schoolService.deleteSchool(schoolId);
      setSchools((prev) => prev.filter((s) => s.id !== schoolId));
      flash("School deleted successfully!", "success");
    } catch (error) {
      flash(error.message || "Failed to delete school.", "error");
    }
  }, []);

  return { schools, isLoading, message, messageType, createSchool, updateSchool, deleteSchool };
};
