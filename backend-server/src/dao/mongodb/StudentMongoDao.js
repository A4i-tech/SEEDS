"use strict";

const IStudentDao = require("../interfaces/IStudentDao");
const Student = require("../../models/Student");

class StudentMongoDao extends IStudentDao {
  async findByPhones(phones) {
    return Student.find({ phoneNumber: { $in: phones } }).lean();
  }

  async findOneByPhone(phoneNumber) {
    return Student.findOne({ phoneNumber }).lean();
  }

  async findByIds(ids) {
    return Student.find({ _id: { $in: ids } }, "name phoneNumber").lean();
  }

  async updateById(id, data) {
    return Student.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
  }

  async bulkUpdateNames(updates) {
    await Student.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u._id },
          update: { $set: { name: u.name } },
        },
      }))
    );
  }

  async insertMany(data) {
    try {
      return await Student.insertMany(data, { ordered: false });
    } catch (err) {
      if (err.code === 11000) {
        return Student.find({ phoneNumber: { $in: data.map((d) => d.phoneNumber) } }).lean();
      }
      throw err;
    }
  }

  async createStudent({ name, phoneNumber, schoolId }) {
    return Student.create({ name, phoneNumber, schoolId });
  }

  async getStudentsBySchoolId(schoolId) {
    return Student.find({ schoolId }, "_id name phoneNumber").sort({ name: 1 }).lean();
  }

  async getStudentById(studentId) {
    return Student.findById(studentId).lean();
  }

  async updateStudent(studentId, schoolId, updates) {
    return Student.findOneAndUpdate(
      { _id: studentId, schoolId },
      updates,
      { new: true }
    ).lean();
  }

  async deleteStudent(studentId, schoolId) {
    return Student.findOneAndDelete({ _id: studentId, schoolId });
  }

  async getStudentCountBySchoolId(schoolId) {
    return Student.countDocuments({ schoolId });
  }
}

module.exports = new StudentMongoDao();
