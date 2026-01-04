import { useState, useCallback, useEffect } from "react";
import { teacherService } from "../services/teacherService";
import { useAuth } from "./useAuth";

export const useTeachers = (activeTab) => {
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

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
    [getAuthHeaders],
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
    async (phoneNumber, password) => {
      if (!phoneNumber || !password) {
        setMessage("Phone and password are required.");
        return false;
      }

      if (phoneNumber.length !== 10) {
        setMessage("Phone number must be exactly 10 digits.");
        return false;
      }

      try {
        await teacherService.registerTeacher(
          phoneNumber,
          password,
          getAuthHeaders(),
        );

        setMessage("Teacher registered successfully!");
        await fetchTeachers();

        // Clear message after 3 seconds
        setTimeout(() => setMessage(""), 3000);
        return true;
      } catch (error) {
        console.error("Teacher registration error:", error);
        setMessage(error.message || "Failed to register teacher.");
        setTimeout(() => setMessage(""), 3000);
        return false;
      }
    },
    [getAuthHeaders, fetchTeachers],
  );

  /**
   * Update teacher state
   */
  const updateTeacherState = useCallback((id, patch) => {
    setTeachers((prev) =>
      prev.map((t) => (String(t._id) === String(id) ? { ...t, ...patch } : t)),
    );
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
              newStudents: [
                ...(t.newStudents || []),
                { name: "", phoneNumber: "" },
              ],
            },
      ),
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
      }),
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
          i === index ? { ...s, [field]: value } : s,
        );
        return { ...t, newStudents: arr };
      }),
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
        .filter((s) => s.name && s.phoneNumber);

      if (payloadStudents.length === 0) {
        setMessage(
          "Please enter at least one student with name and phone number.",
        );
        setTimeout(() => setMessage(""), 3000);
        return;
      }

      updateTeacherState(teacher._id, { submitting: true });
      try {
        const added = await teacherService.addStudents(
          teacher.phoneNumber,
          payloadStudents,
          getAuthHeaders(),
        );

        // Append returned students to local list and reset form
        updateTeacherState(teacher._id, {
          students: [...(teacher.students || []), ...added],
          newStudents: [{ name: "", phoneNumber: "" }],
        });

        setMessage("Students added successfully.");
        setTimeout(() => setMessage(""), 3000);
      } catch (error) {
        console.error("Add students error:", error);
        setMessage(error.message || "Failed to add students.");
        setTimeout(() => setMessage(""), 3000);
      } finally {
        updateTeacherState(teacher._id, { submitting: false });
      }
    },
    [getAuthHeaders, updateTeacherState],
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
          getAuthHeaders(),
        );

        updateTeacherState(teacher._id, {
          students: (teacher.students || []).filter(
            (st) => st.phoneNumber !== studentPhoneNumber,
          ),
        });
      } catch (error) {
        console.error("Remove student error:", error);
      }
    },
    [getAuthHeaders, updateTeacherState],
  );

  /**
   * Get selected teacher object
   */
  const selectedTeacher = teachers.find(
    (t) => String(t._id) === String(selectedTeacherId),
  );

  return {
    teachers,
    selectedTeacher,
    selectedTeacherId,
    setSelectedTeacherId,
    isLoading,
    message,
    registerTeacher,
    addStudentRow,
    removeStudentRow,
    setNewStudentValue,
    submitNewStudents,
    removeStudent,
    setMessage,
  };
};
