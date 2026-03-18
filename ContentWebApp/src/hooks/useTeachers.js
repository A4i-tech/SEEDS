import { useState, useCallback, useEffect } from "react";
import { teacherService } from "../services/teacherService";
import { useAuth } from "./useAuth";
import { isValidPhoneNumber } from "../utils/phoneUtils";
import { useFlashMessage } from "./useFlashMessage";

export const useTeachers = (activeTab) => {
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState(null);
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

        // Augment teachers with local UI state for adding students
        const withState = data.map((t) => ({
          ...t,
          newStudents: [{ name: "", phoneNumber: "" }],
          submitting: false,
        }));

        setTeachers((prevTeachers) => {
          // Set default selection to first teacher if none selected and we have teachers
          if (prevTeachers.length === 0 && withState.length > 0) {
            setSelectedTeacherId(withState[0]._id || withState[0].id);
          }
          return withState;
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

  /**
   * Load teachers when registration tab is active
   */
  useEffect(() => {
    const ac = new AbortController();
    if (activeTab === "registration") {
      fetchTeachers(ac.signal);
    }
    return () => ac.abort();
  }, [activeTab, fetchTeachers]);

  /**
   * Register a new teacher
   */
  const registerTeacher = useCallback(
    async (phoneNumber, password, name) => {
      if (!phoneNumber || !password || !name) {
        flashMessage("Phone number, password, and name are required.", "error");
        return false;
      }

      if (!isValidPhoneNumber(phoneNumber)) {
        flashMessage("Phone number must be exactly 10 digits.", "error");
        return false;
      }

      try {
        await teacherService.registerTeacher(phoneNumber, password, name, getAuthHeaders());
        flashMessage("Teacher registered successfully!", "success");
        await fetchTeachers();
        return true;
      } catch (error) {
        console.error("Teacher registration error:", error);
        flashMessage(error.message || "Failed to register teacher.", "error");
        return false;
      }
    },
    [getAuthHeaders, fetchTeachers, flashMessage]
  );

  /**
   * Update teacher state
   */
  const updateTeacherState = useCallback((id, patch) => {
    setTeachers((prev) => prev.map((t) => (String(t._id) === String(id) ? { ...t, ...patch } : t)));
  }, []);

  /**
   * Add student row to form
   */
  const addStudentRow = useCallback((teacherId) => {
    setTeachers((prev) =>
      prev.map((t) =>
        String(t._id) !== String(teacherId)
          ? t
          : {
              ...t,
              newStudents: [...(t.newStudents || []), { name: "", phoneNumber: "" }],
            }
      )
    );
  }, []);

  /**
   * Remove student row from form
   */
  const removeStudentRow = useCallback((teacherId, index) => {
    setTeachers((prev) =>
      prev.map((t) => {
        if (String(t._id) !== String(teacherId)) return t;
        const arr = [...(t.newStudents || [])];
        arr.splice(index, 1);
        return {
          ...t,
          newStudents: arr.length ? arr : [{ name: "", phoneNumber: "" }],
        };
      })
    );
  }, []);

  /**
   * Update student form field value
   */
  const setNewStudentValue = useCallback((teacherId, index, field, value) => {
    setTeachers((prev) =>
      prev.map((t) => {
        if (String(t._id) !== String(teacherId)) return t;
        const arr = (t.newStudents || []).map((s, i) =>
          i === index ? { ...s, [field]: value } : s
        );
        return { ...t, newStudents: arr };
      })
    );
  }, []);

  /**
   * Submit new students
   */
  const submitNewStudents = useCallback(
    async (teacher) => {
      const payloadStudents = (teacher.newStudents || [])
        .map((s) => ({
          name: (s.name || "").trim(),
          phoneNumber: (s.phoneNumber || "").trim(),
        }))
        .filter((s) => s.name && s.phoneNumber && isValidPhoneNumber(s.phoneNumber));

      if (payloadStudents.length === 0) {
        flashMessage("Please enter at least one student with name and valid phone number.", "error");
        return;
      }

      updateTeacherState(teacher._id, { submitting: true });
      try {
        const result = await teacherService.addStudents(
          teacher.phoneNumber,
          payloadStudents,
          getAuthHeaders()
        );

        const newStudents = result.students || [];

        // Append successfully added students to local list and reset form
        if (newStudents.length > 0) {
          updateTeacherState(teacher._id, {
            students: [...(teacher.students || []), ...newStudents],
            newStudents: [{ name: "", phoneNumber: "" }],
          });
        }

        // Show duplicate modal when backend reports name conflicts
        if (result.duplicates && result.duplicates.length > 0) {
          setPendingDuplicates({ duplicates: result.duplicates, teacher });
        } else {
          updateTeacherState(teacher._id, {
            newStudents: [{ name: "", phoneNumber: "" }],
          });
          flashMessage("Students added successfully.", "success");
        }
      } catch (error) {
        console.error("Add students error:", error);
        flashMessage(error.message || "Failed to add students.", "error");
      } finally {
        updateTeacherState(teacher._id, { submitting: false });
      }
    },
    [getAuthHeaders, updateTeacherState, flashMessage]
  );

  /**
   * Update student name/phone
   */
  const updateStudent = useCallback(
    async (teacher, currentPhoneNumber, name, studentPhoneNumber) => {
      try {
        const updated = await teacherService.updateStudent(
          teacher.phoneNumber,
          currentPhoneNumber,
          name,
          studentPhoneNumber,
          getAuthHeaders()
        );

        updateTeacherState(teacher._id, {
          students: (teacher.students || []).map((st) =>
            st.phoneNumber === currentPhoneNumber
              ? { ...st, name: updated.name, phoneNumber: updated.phoneNumber }
              : st
          ),
        });
        return true;
      } catch (error) {
        return error.message || "Failed to update student.";
      }
    },
    [getAuthHeaders, updateTeacherState]
  );

  /**
   * Remove student
   */
  const removeStudent = useCallback(
    async (teacher, studentPhoneNumber) => {
      try {
        await teacherService.removeStudent(
          teacher.phoneNumber,
          studentPhoneNumber,
          getAuthHeaders()
        );

        updateTeacherState(teacher._id, {
          students: (teacher.students || []).filter((st) => st.phoneNumber !== studentPhoneNumber),
        });
      } catch (error) {
        flashMessage(error.message || "Failed to remove student.", "error");
      }
    },
    [getAuthHeaders, updateTeacherState, flashMessage]
  );

  /**
   * Resolve duplicate students from the modal.
   * Re-submits with updateName flag for students the user chose to update.
   */
  const resolveDuplicates = useCallback(
    async (resolution, pending) => {
      const teacher = pending?.teacher;
      if (!teacher || !resolution?.length) {
        setPendingDuplicates(null);
        return;
      }

      const resubmit = resolution.map((r) => ({
        phoneNumber: r.phoneNumber,
        name: r.keepName ? r.existingName : r.submittedName,
        updateName: !r.keepName,
      }));

      try {
        const result = await teacherService.addStudents(
          teacher.phoneNumber,
          resubmit,
          getAuthHeaders()
        );

        const newStudents = result.students || [];
        if (newStudents.length > 0) {
          updateTeacherState(teacher._id, {
            students: [...(teacher.students || []), ...newStudents],
          });
        }
        flashMessage("Students updated successfully.", "success");
      } catch (error) {
        flashMessage(error.message || "Failed to resolve duplicates.", "error");
      } finally {
        setPendingDuplicates(null);
      }
    },
    [getAuthHeaders, updateTeacherState, flashMessage]
  );

  /**
   * Dismiss the duplicate modal without resolving
   */
  const dismissDuplicateModal = useCallback(() => {
    setPendingDuplicates(null);
  }, []);

  /**
   * Get selected teacher object
   */
  const selectedTeacher = teachers.find((t) => String(t._id) === String(selectedTeacherId));

  return {
    teachers,
    selectedTeacher,
    selectedTeacherId,
    setSelectedTeacherId,
    isLoading,
    message,
    messageType,
    registerTeacher,
    addStudentRow,
    removeStudentRow,
    setNewStudentValue,
    submitNewStudents,
    removeStudent,
    updateStudent,
    pendingDuplicates,
    resolveDuplicates,
    dismissDuplicateModal,
  };
};
