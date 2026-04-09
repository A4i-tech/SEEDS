import { useState, useCallback, useEffect } from "react";
import { teacherService } from "../services/teacherService";
import { useAuth } from "./useAuth";
import { getRole } from "../utils/authHelpers";
import { isValidPhoneNumber } from "../utils/phoneUtils";
import { useFlashMessage } from "./useFlashMessage";

export const useTeachers = (activeTab) => {
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { message, messageType, flashMessage } = useFlashMessage();

  const { getAuthHeaders } = useAuth();

  /**
   * Fetch teachers list
   */
  const fetchTeachers = useCallback(
    async (signal = null) => {
      setIsLoading(true);
      try {
        const data = await teacherService.getTeachers(getAuthHeaders(), signal);

        setTeachers((prevTeachers) => {
          if (prevTeachers.length === 0 && data.length > 0) {
            setSelectedTeacherId(data[0]._id || data[0].id);
          }
          return data;
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error fetching teachers:", error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders]
  );

  const fetchStudents = useCallback(async (signal = null) => {
    try {
      const data = await teacherService.getStudents(getAuthHeaders(), signal);
      setStudents(data);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error fetching students:", error);
      }
    }
  }, [getAuthHeaders]);

  /**
   * Load teachers and students when registration tab is active
   */
  useEffect(() => {
    const ac = new AbortController();
    if (activeTab === "registration" && getRole() === "school_admin") {
      fetchTeachers(ac.signal);
      fetchStudents(ac.signal);
    }
    return () => ac.abort();
  }, [activeTab, fetchTeachers, fetchStudents]);

  /**
   * Register a new teacher
   */
  const registerTeacher = useCallback(
    async (phoneNumber, password, name, role) => {
      if (isLoading) {
        return false;
      }

      if (!phoneNumber || !password || !name || !role) {
        flashMessage("Phone number, password, name, and role are required.", "error");
        return false;
      }

      if (!isValidPhoneNumber(phoneNumber)) {
        flashMessage("Phone number must be exactly 10 digits.", "error");
        return false;
      }

      setIsLoading(true);
      try {
        await teacherService.registerTeacher(phoneNumber, password, name, role, getAuthHeaders());
        flashMessage("Teacher registered successfully!", "success");
        await fetchTeachers();
        return true;
      } catch (error) {
        console.error("Teacher registration error:", error);
        flashMessage(error.message || "Failed to register teacher.", "error");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, getAuthHeaders, fetchTeachers, flashMessage]
  );

  /**
   * Update teacher state
   */
  const updateTeacherState = useCallback((id, patch) => {
    setTeachers((prev) => prev.map((t) => (String(t._id) === String(id) ? { ...t, ...patch } : t)));
  }, []);

  const isTeacherSubmitting = useCallback(
    (teacherId) =>
      teachers.some((t) => String(t._id) === String(teacherId) && Boolean(t.submitting)),
    [teachers]
  );

  const setTeacherSubmitting = useCallback(
    (teacherId, submitting) => {
      updateTeacherState(teacherId, { submitting });
    },
    [updateTeacherState]
  );

  const updateTeacher = useCallback(
    async (teacherId, name, phoneNumber, password) => {
      if (isTeacherSubmitting(teacherId)) {
        return false;
      }

      if (!name || !phoneNumber) {
        flashMessage("Name and phone number are required.", "error");
        return false;
      }

      setTeacherSubmitting(teacherId, true);

      try {
        const updated = await teacherService.updateTeacher(
          teacherId,
          name,
          phoneNumber,
          password,
          getAuthHeaders()
        );

        setTeachers((prev) =>
          prev.map((t) =>
            String(t._id) === String(teacherId)
              ? { ...t, ...updated }
              : t
          )
        );

        flashMessage("Teacher updated successfully.", "success");
        return true;
      } catch (error) {
        flashMessage(error.message || "Failed to update teacher.", "error");
        return false;
      } finally {
        setTeacherSubmitting(teacherId, false);
      }
    },
    [getAuthHeaders, flashMessage, isTeacherSubmitting, setTeacherSubmitting]
  );

  const deleteTeacher = useCallback(
    async (teacherId) => {
      if (!window.confirm("Delete this teacher?")) return;

      if (isTeacherSubmitting(teacherId)) {
        return;
      }

      setTeacherSubmitting(teacherId, true);

      try {
        await teacherService.deleteTeacher(teacherId, getAuthHeaders());
        setTeachers((prev) => prev.filter((t) => String(t._id) !== String(teacherId)));
        if (String(selectedTeacherId) === String(teacherId)) {
          setSelectedTeacherId(null);
        }
        flashMessage("Teacher deleted successfully.", "success");
      } catch (error) {
        flashMessage(error.message || "Failed to delete teacher.", "error");
      } finally {
        setTeacherSubmitting(teacherId, false);
      }
    },
    [getAuthHeaders, selectedTeacherId, flashMessage, isTeacherSubmitting, setTeacherSubmitting]
  );

  const transferTeacher = useCallback(
    async (teacherId, targetSchoolId) => {
      if (isTeacherSubmitting(teacherId)) {
        return false;
      }

      if (!targetSchoolId) {
        flashMessage("Target school ID is required.", "error");
        return false;
      }

      setTeacherSubmitting(teacherId, true);

      try {
        await teacherService.transferTeacher(teacherId, targetSchoolId, getAuthHeaders());
        setTeachers((prev) => prev.filter((t) => String(t._id) !== String(teacherId)));
        if (String(selectedTeacherId) === String(teacherId)) {
          setSelectedTeacherId(null);
        }
        flashMessage("Teacher transferred successfully.", "success");
        return true;
      } catch (error) {
        flashMessage(error.message || "Failed to transfer teacher.", "error");
        return false;
      } finally {
        setTeacherSubmitting(teacherId, false);
      }
    },
    [getAuthHeaders, selectedTeacherId, flashMessage, isTeacherSubmitting, setTeacherSubmitting]
  );

  // --- School-level student CRUD (flat list via GET /student) ---

  const addStudent = useCallback(
    async (name, phoneNumber) => {
      if (!name || !phoneNumber) {
        flashMessage("Name and phone number are required.", "error");
        return false;
      }
      try {
        const created = await teacherService.createStudent(name, phoneNumber, getAuthHeaders());
        setStudents((prev) => [...prev, created]);
        flashMessage("Student added successfully.", "success");
        return true;
      } catch (error) {
        flashMessage(error.message || "Failed to add student.", "error");
        return false;
      }
    },
    [getAuthHeaders, flashMessage]
  );

  const updateStudentById = useCallback(
    async (studentId, name, phoneNumber) => {
      if (!name || !phoneNumber) {
        flashMessage("Name and phone number are required.", "error");
        return false;
      }
      try {
        const updated = await teacherService.updateStudentById(studentId, name, phoneNumber, getAuthHeaders());
        setStudents((prev) => prev.map((s) => (String(s._id) === String(studentId) ? updated : s)));
        flashMessage("Student updated successfully.", "success");
        return true;
      } catch (error) {
        flashMessage(error.message || "Failed to update student.", "error");
        return false;
      }
    },
    [getAuthHeaders, flashMessage]
  );

  const deleteStudentById = useCallback(
    async (studentId) => {
      try {
        await teacherService.deleteStudentById(studentId, getAuthHeaders());
        setStudents((prev) => prev.filter((s) => String(s._id) !== String(studentId)));
        flashMessage("Student deleted successfully.", "success");
      } catch (error) {
        flashMessage(error.message || "Failed to delete student.", "error");
      }
    },
    [getAuthHeaders, flashMessage]
  );

  /**
   * Get selected teacher object
   */
  const selectedTeacher = teachers.find((t) => String(t._id) === String(selectedTeacherId));

  return {
    teachers,
    students,
    selectedTeacher,
    selectedTeacherId,
    setSelectedTeacherId,
    isLoading,
    message,
    messageType,
    registerTeacher,
    addStudent,
    updateStudentById,
    deleteStudentById,
    updateTeacher,
    deleteTeacher,
    transferTeacher,
  };
};
