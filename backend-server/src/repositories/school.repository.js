"use strict";

const schoolDao = require("../dao/mongodb/SchoolMongoDao");

exports.getSchoolByEmail = async (email) => {
    return schoolDao.getSchoolByEmail(email);
};

exports.createSchool = async (name, email, tenantId, hashedPassword) => {
    return schoolDao.createSchool(name, email, tenantId, hashedPassword);
};

exports.getSchools = async (tenantId) => {
    return schoolDao.getSchools(tenantId);
};

exports.getSchoolById = async (schoolId, tenantId) => {
    return schoolDao.getSchoolById(schoolId, tenantId);
};

exports.updateSchool = async (school) => {
    return schoolDao.updateSchool(school);
};

exports.deleteSchool = async (schoolId, tenantId) => {
    return schoolDao.deleteSchool(schoolId, tenantId);
};

exports.setSchoolPassword = async (schoolId, tenantId, hashedPassword) => {
    return schoolDao.setSchoolPassword(schoolId, tenantId, hashedPassword);
};
