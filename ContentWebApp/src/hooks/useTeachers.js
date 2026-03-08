import { useState, useCallback, useEffect } from "react";
import { teacherService } from "../services/teacherService";
import { getRole } from "../utils/authHelpers";

export const useTeachers = (activeTab) => {
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState("");

  const fetchTeachers = useCallback(async (signal = null) => {
    try {
      const data = await teacherService.getTeachers(signal);
      setTeachers(data);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error fetching teachers:", error);
      }
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const data = await teacherService.getStudents();
      setStudents(data);
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    if (activeTab === "registration" && getRole() === "school_admin") {
      fetchTeachers(ac.signal);
      fetchStudents();
    }
    return () => ac.abort();
  }, [activeTab, fetchTeachers, fetchStudents]);

  const registerTeacher = useCallback(
    async (phoneNumber, password, name) => {
      if (!phoneNumber || !password || !name) {
        setMessage("Phone number, password, and name are required.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
      if (phoneNumber.length !== 10) {
        setMessage("Phone number must be exactly 10 digits.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
      try {
        await teacherService.registerTeacher(phoneNumber, password, name);
        setMessage("Teacher registered successfully!");
        await fetchTeachers();
        setTimeout(() => setMessage(""), 3000);
        return true;
      } catch (error) {
        setMessage(error.message || "Failed to register teacher.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
    },
    [fetchTeachers]
  );

  const addStudent = useCallback(async (name, phoneNumber) => {
    if (!name || !phoneNumber) {
      setMessage("Name and phone number are required.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
    try {
      const created = await teacherService.createStudent(name, phoneNumber);
      setStudents((prev) => [...prev, created]);
      setMessage("Student added successfully.");
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (error) {
      setMessage(error.message || "Failed to add student.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
  }, []);

  const updateStudent = useCallback(async (studentId, name, phoneNumber) => {
    if (!name || !phoneNumber) {
      setMessage("Name and phone number are required.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
    try {
      const updated = await teacherService.updateStudent(studentId, name, phoneNumber);
      setStudents((prev) => prev.map((s) => (String(s._id) === String(studentId) ? updated : s)));
      setMessage("Student updated successfully.");
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (error) {
      setMessage(error.message || "Failed to update student.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
  }, []);

  const deleteStudent = useCallback(async (studentId) => {
    try {
      await teacherService.deleteStudent(studentId);
      setStudents((prev) => prev.filter((s) => String(s._id) !== String(studentId)));
    } catch (error) {
      setMessage(error.message || "Failed to delete student.");
      setTimeout(() => setMessage(""), 3000);
    }
  }, []);

  const updateTeacher = useCallback(async (teacherId, name, phoneNumber, password) => {
    if (!name || !phoneNumber) {
      setMessage("Name and phone number are required.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
    try {
      const updated = await teacherService.updateTeacher(teacherId, name, phoneNumber, password);
      setTeachers((prev) => prev.map((t) => (String(t._id) === String(teacherId) ? updated : t)));
      setMessage("Teacher updated successfully.");
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (error) {
      setMessage(error.message || "Failed to update teacher.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
  }, []);

  const deleteTeacher = useCallback(async (teacherId) => {
    if (!window.confirm("Delete this teacher?")) return;
    try {
      await teacherService.deleteTeacher(teacherId);
      setTeachers((prev) => prev.filter((t) => String(t._id) !== String(teacherId)));
    } catch (error) {
      setMessage(error.message || "Failed to delete teacher.");
      setTimeout(() => setMessage(""), 3000);
    }
  }, []);

  const transferTeacher = useCallback(async (teacherId, targetSchoolId) => {
    if (!targetSchoolId) {
      setMessage("Target school ID is required.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
    try {
      await teacherService.transferTeacher(teacherId, targetSchoolId);
      setTeachers((prev) => prev.filter((t) => String(t._id) !== String(teacherId)));
      setMessage("Teacher transferred successfully.");
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (error) {
      setMessage(error.message || "Failed to transfer teacher.");
      setTimeout(() => setMessage(""), 3000);
      return false;
    }
  }, []);

  return {
    teachers,
    students,
    message,
    registerTeacher,
    addStudent,
    updateStudent,
    deleteStudent,
    updateTeacher,
    deleteTeacher,
    transferTeacher,
  };
};
