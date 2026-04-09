"use strict";

const ITeacherDao = require("../interfaces/ITeacherDao");
const Teacher = require("../../models/Teacher");

class TeacherMongoDao extends ITeacherDao {
  async getTeacherById(teacherId) {
    return Teacher.findById(teacherId).select("-password").lean();
  }

  async getTeachersBySchoolId(schoolId) {
    return Teacher.find({ schoolId }, "_id name phoneNumber role").sort({ name: 1 }).lean();
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

  async insertTeacher({ phoneNumber, password, schoolId, name, role }) {
    return Teacher.create({ phoneNumber, password, schoolId, name, role });
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
