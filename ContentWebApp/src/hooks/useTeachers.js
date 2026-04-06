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
      if (isTeacherSubmitting(teacher._id)) {
        return;
      }

      const payloadStudents = (teacher.newStudents || [])
        .map((s) => ({
          name: (s.name || "").trim(),
          phoneNumber: (s.phoneNumber || "").trim(),
        }))
        .filter((s) => s.name && s.phoneNumber && isValidPhoneNumber(s.phoneNumber));

      if (payloadStudents.length === 0) {
        flashMessage(
          "Please enter at least one student with name and valid phone number.",
          "error"
        );
        return;
      }

      setTeacherSubmitting(teacher._id, true);
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
        setTeacherSubmitting(teacher._id, false);
      }
    },
    [getAuthHeaders, updateTeacherState, flashMessage, isTeacherSubmitting, setTeacherSubmitting]
  );

  /**
   * Update student name/phone
   */
  const updateStudent = useCallback(
    async (teacher, currentPhoneNumber, name, studentPhoneNumber) => {
      if (isTeacherSubmitting(teacher._id)) {
        return false;
      }

      setTeacherSubmitting(teacher._id, true);
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
      } finally {
        setTeacherSubmitting(teacher._id, false);
      }
    },
    [getAuthHeaders, updateTeacherState, isTeacherSubmitting, setTeacherSubmitting]
  );

  /**
   * Remove student
   */
  const removeStudent = useCallback(
    async (teacher, studentPhoneNumber) => {
      if (!window.confirm("Remove this student?")) return;

      if (isTeacherSubmitting(teacher._id)) {
        return;
      }

      setTeacherSubmitting(teacher._id, true);

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
      } finally {
        setTeacherSubmitting(teacher._id, false);
      }
    },
    [getAuthHeaders, updateTeacherState, flashMessage, isTeacherSubmitting, setTeacherSubmitting]
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

      if (isTeacherSubmitting(teacher._id)) {
        return;
      }

      setTeacherSubmitting(teacher._id, true);

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
        setTeacherSubmitting(teacher._id, false);
        setPendingDuplicates(null);
      }
    },
    [getAuthHeaders, updateTeacherState, flashMessage, isTeacherSubmitting, setTeacherSubmitting]
  );

  /**
   * Dismiss the duplicate modal without resolving
   */
  const dismissDuplicateModal = useCallback(() => {
    setPendingDuplicates(null);
  }, []);

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
              ? {
                  ...t,
                  ...updated,
                  // Preserve local UI fields added in this hook
                  newStudents: t.newStudents || [{ name: "", phoneNumber: "" }],
                  submitting: !!t.submitting,
                }
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
    addStudentRow,
    removeStudentRow,
    setNewStudentValue,
    submitNewStudents,
    removeStudent,
    updateStudent,
    updateTeacher,
    deleteTeacher,
    transferTeacher,
    pendingDuplicates,
    resolveDuplicates,
    dismissDuplicateModal,
  };
};
