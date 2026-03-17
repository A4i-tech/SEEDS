"use strict";

/**
 * IStudentDao — abstract interface for Student data access.
 * All implementations (MongoDB, MySQL, …) must extend this class.
 */
class IStudentDao {
  /**
   * Find students whose phone numbers are in the given list.
   * @param {string[]} phones
   * @returns {Promise<object[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async findByPhones(phones) {
    throw new Error("IStudentDao.findByPhones() not implemented");
  }

  /**
   * Find a single student by phone number.
   * @param {string} phoneNumber
   * @returns {Promise<object|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async findOneByPhone(phoneNumber) {
    throw new Error("IStudentDao.findOneByPhone() not implemented");
  }

  /**
   * Find students whose primary keys are in the given list.
   * @param {string[]} ids
   * @returns {Promise<object[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async findByIds(ids) {
    throw new Error("IStudentDao.findByIds() not implemented");
  }

  /**
   * Update a student's fields by primary key.
   * @param {string} id
   * @param {object} data  — key/value pairs to set
   * @returns {Promise<object>}  — updated student
   */
  // eslint-disable-next-line no-unused-vars
  async updateById(id, data) {
    throw new Error("IStudentDao.updateById() not implemented");
  }

  /**
   * Batch-rename students.
   * @param {{ _id: string, name: string }[]} updates
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async bulkUpdateNames(updates) {
    throw new Error("IStudentDao.bulkUpdateNames() not implemented");
  }

  /**
   * Insert multiple students.
   * Duplicate phone numbers are handled gracefully (no hard error).
   * @param {{ name: string, phoneNumber: string }[]} data
   * @returns {Promise<object[]>}  — all students (inserted + pre-existing)
   */
  // eslint-disable-next-line no-unused-vars
  async insertMany(data) {
    throw new Error("IStudentDao.insertMany() not implemented");
  }
}

module.exports = IStudentDao;
