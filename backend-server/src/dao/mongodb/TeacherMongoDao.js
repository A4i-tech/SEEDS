"use strict";
const ITeacherDao = require("../interfaces/ITeacherDao");
const Teacher = require("../../models/Teacher");

class TeacherMongoDao extends ITeacherDao {
  async findByPhoneAndTenant(phoneNumber, tenantId) {
    return Teacher.findOne({ phoneNumber, tenantId }).lean();
  }

  async findById(id) {
    return Teacher.findById(id).lean();
  }

  async findByTenant(tenantId) {
    return Teacher.find({ tenantId }, "_id name phoneNumber studentId").lean();
  }

  async addStudentIds(teacherId, studentIds) {
    await Teacher.updateOne(
      { _id: teacherId },
      { $addToSet: { studentId: { $each: studentIds } } }
    );
  }

  async removeStudentIds(teacherId, studentIds) {
    await Teacher.updateOne({ _id: teacherId }, { $pull: { studentId: { $in: studentIds } } });
  }
}

module.exports = new TeacherMongoDao();
