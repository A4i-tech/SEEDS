"use strict";

const classDao = require("../dao/mongodb/ClassMongoDao");

exports.getClassCountBySchoolId = async (schoolId) => {
    return classDao.getClassCountBySchoolId(schoolId);
};
