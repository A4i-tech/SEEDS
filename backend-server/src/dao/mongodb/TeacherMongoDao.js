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
    return Teacher.find({ tenantId }, "_id name phoneNumber role studentId").lean();
  }

  async addStudentIds(teacherId, studentIds) {
    await Teacher.updateOne(
      { _id: teacherId },
      { $addToSet: { studentId: { $each: studentIds } } }
    );
  }

  async removeStudentIds(teacherId, studentIds) {
    await Teacher.updateOne(
      { _id: teacherId },
      { $pull: { studentId: { $in: studentIds } } }
    );
  }

  async getTeacherById(teacherId) {
    return Teacher.findById(teacherId).select("-password").lean();
  }

  async getTeacherByPhoneNumber(phoneNumber) {
    return Teacher.findOne({ phoneNumber }).lean();
  }

  async getTeachersBySchoolId(schoolId) {
    return Teacher.find({ schoolId }, "_id name phoneNumber role studentId").sort({ name: 1 }).lean();
  }

  async transferTeacher(teacherId, currentSchoolId, targetSchoolId) {
    return Teacher.findOneAndUpdate(
      { _id: teacherId, schoolId: currentSchoolId },
      { schoolId: targetSchoolId },
      { new: true }
    )
      .select("-password")
      .lean();
  }

  async getTeacherCountBySchoolId(schoolId) {
    return Teacher.countDocuments({ schoolId });
  }

  async getTeacherBySchoolIdAndPhoneNumber(schoolId, phoneNumber) {
    return Teacher.findOne({ schoolId, phoneNumber }).lean();
  }

  async insertTeacher({ phoneNumber, password, schoolId, tenantId, name, role }) {
    return Teacher.create({ phoneNumber, password, schoolId, tenantId, name, role });
  }

  async updateTeacher(teacherId, schoolId, updates) {
    return Teacher.findOneAndUpdate({ _id: teacherId, schoolId }, updates, { new: true })
      .select("-password")
      .lean();
  }

  async deleteTeacher(teacherId, schoolId) {
    return Teacher.findOneAndDelete({ _id: teacherId, schoolId }).select("-password").lean();
  }
}

module.exports = new TeacherMongoDao();
