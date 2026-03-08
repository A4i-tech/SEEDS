"use strict";

const IStudentDao = require("../interfaces/IStudentDao");
const Student = require("../../models/Student");

class StudentMongoDao extends IStudentDao {
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
