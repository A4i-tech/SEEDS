"use strict";

const IClassDao = require("../interfaces/IClassDao");
const Class = require("../../models/Class");

class ClassMongoDao extends IClassDao {
    async getClassCountBySchoolId(schoolId) {
        return Class.countDocuments({ schoolId });
    }

    async deleteClassesByTeacherAndSchool(teacherId, schoolId) {
        return Class.deleteMany({ teacher: teacherId, schoolId });
    }
}

module.exports = new ClassMongoDao();
