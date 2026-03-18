const teacherRepo = require("../repositories/teacher.repository");
const studentRepo = require("../repositories/student.repository");
const { STATUS } = require("../config/constants");

exports.addStudents = async ({ students = [], phoneNumber, tenantId }) => {
  // Validate input
  if (!Array.isArray(students) || !students.length) {
    const err = new Error("Students array is required and cannot be empty");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  // Load Teacher
  const teacher = await teacherRepo.findByPhoneAndTenant(phoneNumber, tenantId);

  if (!teacher) {
    const err = new Error("Teacher not found with the provided phone number");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  // Normalize and prepare student data
  const normalized = normalizeStudents(students);
  if (!normalized.length) {
    const err = new Error("No valid student entries provided");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  // fetch existing students
  const existingStudents = await studentRepo.findByPhones(normalized.map((s) => s.phoneNumber));

  const existingMap = new Map(existingStudents.map((s) => [s.phoneNumber, s]));

  const toInsert = [];
  const toUpdate = [];
  const duplicates = [];
  const resolved = [];

  for (const s of normalized) {
    const existing = existingMap.get(s.phoneNumber);
    if (!existing) {
      toInsert.push({ name: s.name, phoneNumber: s.phoneNumber });
      continue;
    }

    if (existing.name === s.name) {
      resolved.push(existing);
      continue;
    }

    if (s.updateName) {
      toUpdate.push({ _id: existing._id, name: s.name });
      resolved.push({ ...existing, name: s.name });
      continue;
    }

    duplicates.push({
      phoneNumber: s.phoneNumber,
      existingName: existing.name,
      submittedName: s.name,
    });
  }

  // apply updates
  if (toUpdate.length) {
    await studentRepo.bulkUpdateNames(toUpdate);
  }

  // insert new
  const inserted = toInsert.length ? await studentRepo.insertManySafe(toInsert) : [];

  const allStudents = [...resolved, ...inserted];

  // link to teacher
  const { newlyAdded, alreadyLinked } = await teacherRepo.linkStudents(teacher._id, allStudents);

  // Return result
  return {
    students: newlyAdded.map((s) => ({ name: s.name, phoneNumber: s.phoneNumber })),
    ...(duplicates.length && { duplicates }),
    ...(alreadyLinked.length && {
      alreadyLinked: alreadyLinked.map((s) => ({ name: s.name, phoneNumber: s.phoneNumber })),
    }),
  };
};

exports.getStudents = async ({ phoneNumber, tenantId }) => {
  const teacher = await teacherRepo.findByPhoneAndTenant(phoneNumber, tenantId);
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const studentIds = Array.isArray(teacher.studentId) ? teacher.studentId : [];
  if (studentIds.length === 0) return [];

  const students = await studentRepo.findManyByIds(studentIds);
  return students.map((s) => ({ name: s.name, phoneNumber: s.phoneNumber }));
};

exports.getTeachers = async ({ tenantId }) => {
  const teachers = await teacherRepo.findByTenant(tenantId);
  if (!teachers || teachers.length === 0) return [];

  const studentIdSet = new Set();
  for (const t of teachers) {
    if (Array.isArray(t.studentId)) {
      for (const sid of t.studentId) {
        if (sid) studentIdSet.add(String(sid));
      }
    }
  }

  const studentIds = Array.from(studentIdSet);
  const students = studentIds.length > 0 ? await studentRepo.findManyByIds(studentIds) : [];

  const studentMap = {};
  for (const s of students) {
    studentMap[String(s._id)] = s;
  }

  return teachers.map((t) => ({
    _id: t._id,
    name: t.name,
    phoneNumber: t.phoneNumber,
    students: (t.studentId || [])
      .map((id) => {
        const s = studentMap[String(id)];
        return s ? { name: s.name, phoneNumber: s.phoneNumber } : null;
      })
      .filter(Boolean),
  }));
};

exports.removeStudents = async ({ phoneNumber, students, tenantId }) => {
  if (!Array.isArray(students) || students.length === 0) {
    const err = new Error("Students array is required and cannot be empty");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  const teacher = await teacherRepo.findByPhoneAndTenant(phoneNumber, tenantId);
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const phoneNumbers = students.map((s) => s.phoneNumber).filter(Boolean);
  const foundStudents = await studentRepo.findByPhones(phoneNumbers);

  if (foundStudents.length > 0) {
    await teacherRepo.removeStudentLinks(
      teacher._id,
      foundStudents.map((s) => s._id)
    );
  }

  return { message: "Students removed successfully", removedCount: foundStudents.length };
};

exports.updateStudent = async ({
  teacherPhoneNumber,
  currentPhoneNumber,
  name,
  studentPhoneNumber,
  tenantId,
}) => {
  const teacher = await teacherRepo.findByPhoneAndTenant(teacherPhoneNumber, tenantId);
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const student = await studentRepo.findOneByPhone(currentPhoneNumber);
  if (!student) {
    const err = new Error("Student not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const ownsStudent = (teacher.studentId || []).some((id) => String(id) === String(student._id));
  if (!ownsStudent) {
    const err = new Error("Student does not belong to this teacher");
    err.status = STATUS.FORBIDDEN;
    throw err;
  }

  const newPhone = studentPhoneNumber.trim();
  const newName = name.trim();

  if (!newName || !newPhone) {
    const err = new Error("Name and phone number are required");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  if (newPhone !== currentPhoneNumber) {
    const existing = await studentRepo.findOneByPhone(newPhone);
    if (existing && String(existing._id) !== String(student._id)) {
      const err = new Error("A phone number already exists");
      err.status = STATUS.CONFLICT;
      throw err;
    }
  }

  const updated = await studentRepo.updateById(student._id, {
    name: newName,
    phoneNumber: newPhone,
  });
  return { name: updated.name, phoneNumber: updated.phoneNumber };
};

function normalizeStudents(students) {
  const result = [];
  for (const s of students) {
    if (!s?.name || !s?.phoneNumber) continue; // Skip invalid entries
    const name = s.name.trim();
    const phone = s.phoneNumber.trim();
    if (!name || !phone) continue; // Skip if name or phone is empty after trimming
    result.push({ name, phoneNumber: phone, updateName: !!s.updateName });
  }
  return result;
}
