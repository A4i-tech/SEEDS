"use strict";

class IStudentDao {
    async createStudent({ name, phoneNumber, schoolId }) {
        throw new Error("Not implemented");
    }

    async getStudentsBySchoolId(schoolId) {
        throw new Error("Not implemented");
    }

    async getStudentById(studentId) {
        throw new Error("Not implemented");
    }

    async updateStudent(studentId, schoolId, updates) {
        throw new Error("Not implemented");
    }

    async deleteStudent(studentId, schoolId) {
        throw new Error("Not implemented");
    }

    async getStudentCountBySchoolId(schoolId) {
        throw new Error("Not implemented");
    }
}

module.exports = IStudentDao;
