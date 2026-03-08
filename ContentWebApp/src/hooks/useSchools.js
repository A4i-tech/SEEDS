import { useState, useCallback, useEffect } from "react";
import { schoolService } from "../services/schoolService";
import { getRole } from "../utils/authHelpers";

export const useSchools = (activeTab) => {
  const [schools, setSchools] = useState([]);
  const [message, setMessage] = useState("");

  const fetchSchools = useCallback(async () => {
    try {
      const data = await schoolService.getSchools();
      setSchools(data);
    } catch (error) {
      console.error("Error fetching schools:", error);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "registration" && getRole() === "tenant") {
      fetchSchools();
    }
  }, [activeTab, fetchSchools]);

  const createSchool = useCallback(
    async (name, email, password) => {
      if (!name || !email || !password) {
        setMessage("Name, email, and password are required.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
      try {
        await schoolService.createSchool(name, email, password);
        setMessage("School created successfully!");
        await fetchSchools();
        setTimeout(() => setMessage(""), 3000);
        return true;
      } catch (error) {
        setMessage(error.message || "Failed to create school.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
    },
    [fetchSchools]
  );

  const updateSchool = useCallback(
    async (schoolId, name, email, password) => {
      if (!name || !email) {
        setMessage("Name and email are required.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
      try {
        const updated = await schoolService.updateSchool(schoolId, name, email, password);
        setSchools((prev) => prev.map((s) => (String(s._id) === String(schoolId) ? updated : s)));
        setMessage("School updated successfully!");
        setTimeout(() => setMessage(""), 3000);
        return true;
      } catch (error) {
        setMessage(error.message || "Failed to update school.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
    },
    []
  );

  const deleteSchool = useCallback(async (schoolId) => {
    if (!window.confirm("Delete this school?")) return;
    try {
      await schoolService.deleteSchool(schoolId);
      setSchools((prev) => prev.filter((s) => String(s._id) !== String(schoolId)));
    } catch (error) {
      setMessage(error.message || "Failed to delete school.");
      setTimeout(() => setMessage(""), 3000);
    }
  }, []);

  return { schools, message, createSchool, updateSchool, deleteSchool };
};
