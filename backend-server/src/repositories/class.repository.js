"use strict";

const classDao = require("../dao/mongodb/ClassMongoDao");

exports.getClassCountBySchoolId = async (schoolId) => {
    return classDao.getClassCountBySchoolId(schoolId);
};

exports.deleteClassesByTeacherAndSchool = async (teacherId, schoolId) => {
    return classDao.deleteClassesByTeacherAndSchool(teacherId, schoolId);
};
