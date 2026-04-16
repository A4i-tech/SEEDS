import { useState, useCallback, useEffect } from "react";
import { teacherService } from "../services/teacherService";
import { useAuth } from "./useAuth";
import { getRole } from "../utils/authHelpers";
import { isValidPhoneNumber } from "../utils/phoneUtils";
import { useFlashMessage } from "./useFlashMessage";

const emptyStudentRow = () => ({ name: "", phoneNumber: "" });

const prepareTeacher = (teacher) => ({
  ...teacher,
  students: Array.isArray(teacher.students) ? teacher.students : [],
  newStudents:
    Array.isArray(teacher.newStudents) && teacher.newStudents.length > 0
      ? teacher.newStudents
      : [emptyStudentRow()],
});

export const useTeachers = (activeTab) => {
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { message, messageType, flashMessage } = useFlashMessage();

  const { getAuthHeaders } = useAuth();

  const fetchTeachers = useCallback(
    async (signal = null) => {
      setIsLoading(true);
      try {
        const data = await teacherService.getTeachers(getAuthHeaders(), signal);

        const preparedTeachers = (Array.isArray(data) ? data : []).map(prepareTeacher);

        setTeachers((prevTeachers) => {
          setSelectedTeacherId((currentId) => {
            const activeId = currentId || selectedTeacherId;
            if (preparedTeachers.some((teacher) => String(teacher._id) === String(activeId))) {
              return activeId;
            }
            if (prevTeachers.length === 0 && preparedTeachers.length > 0) {
              return preparedTeachers[0]._id || preparedTeachers[0].id;
            }
            return preparedTeachers[0]?._id || preparedTeachers[0]?.id || null;
          });
          return preparedTeachers;
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error fetching teachers:", error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders, selectedTeacherId]
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

  useEffect(() => {
    const ac = new AbortController();
    if (activeTab === "registration" && getRole() === "school_admin") {
      fetchTeachers(ac.signal);
      fetchStudents(ac.signal);
    }
    return () => ac.abort();
  }, [activeTab, fetchTeachers, fetchStudents]);

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
        flashMessage(
          role === "content_creator"
            ? "Content creator registered successfully!"
            : "Teacher registered successfully!",
          "success"
        );
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

  const updateTeacherState = useCallback((id, patch) => {
    setTeachers((prev) =>
      prev.map((t) => (String(t._id) === String(id) ? { ...t, ...patch } : t))
    );
  }, []);

  const updateTeacherWith = useCallback((id, updater) => {
    setTeachers((prev) =>
      prev.map((teacher) =>
        String(teacher._id) === String(id) ? updater(prepareTeacher(teacher)) : teacher
      )
    );
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
        const updated = await teacherService.updateStudentById(
          studentId,
          name,
          phoneNumber,
          getAuthHeaders()
        );
        setStudents((prev) =>
          prev.map((s) => (String(s._id) === String(studentId) ? updated : s))
        );
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

  const addStudentRow = useCallback(
    (teacherId) => {
      updateTeacherWith(teacherId, (teacher) => ({
        ...teacher,
        newStudents: [...teacher.newStudents, emptyStudentRow()],
      }));
    },
    [updateTeacherWith]
  );

  const removeStudentRow = useCallback(
    (teacherId, rowIndex) => {
      updateTeacherWith(teacherId, (teacher) => {
        const nextRows = teacher.newStudents.filter((_, index) => index !== rowIndex);
        return {
          ...teacher,
          newStudents: nextRows.length > 0 ? nextRows : [emptyStudentRow()],
        };
      });
    },
    [updateTeacherWith]
  );

  const setNewStudentValue = useCallback(
    (teacherId, rowIndex, field, value) => {
      updateTeacherWith(teacherId, (teacher) => ({
        ...teacher,
        newStudents: teacher.newStudents.map((student, index) =>
          index === rowIndex ? { ...student, [field]: value } : student
        ),
      }));
    },
    [updateTeacherWith]
  );

  const submitNewStudents = useCallback(
    async (teacher) => {
      const validRows = (teacher.newStudents || [])
        .map((student) => ({
          name: student.name.trim(),
          phoneNumber: student.phoneNumber.trim(),
        }))
        .filter((student) => student.name || student.phoneNumber);

      if (validRows.length === 0) {
        flashMessage("Add at least one student.", "error");
        return false;
      }

      const invalidPhone = validRows.some((student) => !isValidPhoneNumber(student.phoneNumber));
      const missingName = validRows.some((student) => !student.name);
      if (missingName || invalidPhone) {
        flashMessage("Each student needs a name and a valid 10-digit phone number.", "error");
        return false;
      }

      updateTeacherState(teacher._id, { submitting: true });

      try {
        const result = await teacherService.addStudentsToTeacher(
          teacher.phoneNumber,
          validRows,
          getAuthHeaders()
        );
        await fetchTeachers();
        updateTeacherState(teacher._id, { newStudents: [emptyStudentRow()] });

        if (Array.isArray(result.duplicates) && result.duplicates.length > 0) {
          flashMessage("Some students already exist with different names.", "error");
          return false;
        }

        flashMessage("Students added successfully.", "success");
        return true;
      } catch (error) {
        flashMessage(error.message || "Failed to add students.", "error");
        return false;
      } finally {
        updateTeacherState(teacher._id, { submitting: false });
      }
    },
    [fetchTeachers, flashMessage, getAuthHeaders, updateTeacherState]
  );

  const removeStudentFromTeacher = useCallback(
    async (teacher, studentPhoneNumber) => {
      try {
        await teacherService.removeStudentsFromTeacher(
          teacher.phoneNumber,
          [{ phoneNumber: studentPhoneNumber }],
          getAuthHeaders()
        );
        updateTeacherWith(teacher._id, (currentTeacher) => ({
          ...currentTeacher,
          students: currentTeacher.students.filter(
            (student) => student.phoneNumber !== studentPhoneNumber
          ),
        }));
        flashMessage("Student removed successfully.", "success");
      } catch (error) {
        flashMessage(error.message || "Failed to remove student.", "error");
      }
    },
    [flashMessage, getAuthHeaders, updateTeacherWith]
  );

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
    addStudentRow,
    removeStudentRow,
    setNewStudentValue,
    submitNewStudents,
    removeStudentFromTeacher,
  };
};
