"use strict";

/**
 * ITeacherDao — abstract interface for Teacher data access.
 * All implementations (MongoDB, MySQL, …) must extend this class.
 */
class ITeacherDao {
  /**
   * Find a single teacher by phone number and tenant.
   * @param {string} phoneNumber
   * @param {string} tenantId
   * @returns {Promise<object|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async findByPhoneAndTenant(phoneNumber, tenantId) {
    throw new Error("ITeacherDao.findByPhoneAndTenant() not implemented");
  }

  /**
   * Find a single teacher by its primary key.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async findById(id) {
    throw new Error("ITeacherDao.findById() not implemented");
  }

  /**
   * Find all teachers belonging to a tenant.
   * Returned objects include a `studentId` array of linked student IDs.
   * @param {string} tenantId
   * @returns {Promise<object[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async findByTenant(tenantId) {
    throw new Error("ITeacherDao.findByTenant() not implemented");
  }

  /**
   * Link student IDs to a teacher (idempotent — duplicates are ignored).
   * @param {string} teacherId
   * @param {string[]} studentIds
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async addStudentIds(teacherId, studentIds) {
    throw new Error("ITeacherDao.addStudentIds() not implemented");
  }

  /**
   * Remove student IDs from a teacher.
   * @param {string} teacherId
   * @param {string[]} studentIds
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async removeStudentIds(teacherId, studentIds) {
    throw new Error("ITeacherDao.removeStudentIds() not implemented");
  }

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
