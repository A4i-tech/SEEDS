"use strict";

/**
 * ITeacherDao — abstract interface for Teacher data access.
 * All implementations (MongoDB, MySQL, …) must extend this class.
 */
class ITeacherDao {
  // School-based methods
  async getTeacherById(teacherId) {
    throw new Error("ITeacherDao.getTeacherById() not implemented");
  }

  async getTeacherByPhoneNumber(phoneNumber) {
    throw new Error("ITeacherDao.getTeacherByPhoneNumber() not implemented");
  }

  async getTeachersBySchoolId(schoolId) {
    throw new Error("ITeacherDao.getTeachersBySchoolId() not implemented");
  }

  async transferTeacher(teacherId, targetSchoolId) {
    throw new Error("ITeacherDao.transferTeacher() not implemented");
  }

  async getTeacherCountBySchoolId(schoolId) {
    throw new Error("ITeacherDao.getTeacherCountBySchoolId() not implemented");
  }

  async getTeacherBySchoolIdAndPhoneNumber(schoolId, phoneNumber) {
    throw new Error("ITeacherDao.getTeacherBySchoolIdAndPhoneNumber() not implemented");
  }

  async insertTeacher(data) {
    throw new Error("ITeacherDao.insertTeacher() not implemented");
  }

  async updateTeacher(teacherId, schoolId, updates) {
    throw new Error("ITeacherDao.updateTeacher() not implemented");
  }

  async deleteTeacher(teacherId, schoolId) {
    throw new Error("ITeacherDao.deleteTeacher() not implemented");
  }
}

module.exports = ITeacherDao;
