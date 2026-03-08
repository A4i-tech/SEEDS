"use strict";

class ITeacherDao {
    async getTeacherById(teacherId) {
        throw new Error("Not implemented");
    }
    async getTeacherByPhoneNumber(phoneNumber) {
        throw new Error("Not implemented");
    }
    async getTeachersBySchoolId(schoolId) {
        throw new Error("Not implemented");
    }
    async transferTeacher(teacherId, targetSchoolId) {
        throw new Error("Not implemented");
    }
    async getTeacherCountBySchoolId(schoolId) {
        throw new Error("Not implemented");
    }
    async getTeacherBySchoolIdAndPhoneNumber(schoolId, phoneNumber) {
        throw new Error("Not implemented");
    }
    async insertTeacher(data) {
        throw new Error("Not implemented");
    }
    async updateTeacher(teacherId, schoolId, updates) {
        throw new Error("Not implemented");
    }
}

module.exports = ITeacherDao;
