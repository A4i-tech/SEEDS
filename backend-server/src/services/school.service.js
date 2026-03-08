"use strict";

const bcrypt = require("bcryptjs");
const schoolRepository = require("../repositories/school.repository");
const teacherRepository = require("../repositories/teacher.repository");
const studentRepository = require("../repositories/student.repository");
const ivrV2LogRepository = require("../repositories/ivrV2Log.repository");
const { STATUS } = require("../config/constants");
const { passwordSaltRounds } = require("../config/env");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Class = require("../models/Class");

/**
 * Create a new school
 * @param {string} name - The name of the school
 * @param {string} email - The email of the school
 * @param {string} tenantId - The tenant id
 * @returns {Promise<Object>} - The new school
 */
exports.createSchool = async (name, email, tenantId, password) => {
    const existingSchool = await schoolRepository.getSchoolByEmail(email);

    if (existingSchool) {
        const err = new Error("School with this email already exists");
        err.status = STATUS.BAD_REQUEST;
        throw err;
    }

    const hashedPassword = await bcrypt.hash(password, parseInt(passwordSaltRounds) || 10);
    return await schoolRepository.createSchool(name, email, tenantId, hashedPassword);
}

/**
 * Get all schools for a tenant
 * @param {string} tenantId - The tenant id
 * @returns {Promise<Object[]>} - The schools
 */
exports.getSchools = async (tenantId) => {
    const schools = await schoolRepository.getSchools(tenantId);
    if (!schools) {
        const err = new Error("No schools found");
        err.status = STATUS.NOT_FOUND;
        throw err;
    }
    return schools;
}

/**
 * Get a school by ID
 * @param {string} schoolId - The school id
 * @param {string} tenantId - The tenant id
 * @returns {Promise<Object>} - The school
 */
exports.getSchoolById = async (schoolId, tenantId) => {
    const school = await schoolRepository.getSchoolById(schoolId, tenantId);
    if (!school) {
        const err = new Error("School not found");
        err.status = STATUS.NOT_FOUND;
        throw err;
    }
    return school;
}

/**
 * Update a school
 * @param {string} schoolId - The school id
 * @param {string} tenantId - The tenant id
 * @param {string} name - The name of the school
 * @param {string} email - The email of the school
 * @returns {Promise<Object>} - The updated school
 */
exports.updateSchool = async (schoolId, tenantId, name, email, password) => {
    const school = await schoolRepository.getSchoolById(schoolId, tenantId);
    if (!school) {
        const err = new Error("School not found");
        err.status = STATUS.NOT_FOUND;
        throw err;
    }
    if (name) {
        school.name = name;
    }
    if (email) {
        school.email = email;
    }
    if (password) {
        school.password = await bcrypt.hash(password, parseInt(passwordSaltRounds));
    }
    return await schoolRepository.updateSchool(school);
}

/**
 * Delete a school
 * @param {string} schoolId - The school id
 * @param {string} tenantId - The tenant id
 * @returns {Promise<Object>} - The deleted school
 */
exports.deleteSchool = async (schoolId, tenantId) => {
    const teacherCount = await teacherRepository.getTeacherCountBySchoolId(schoolId);
    if (teacherCount > 0) {
        const err = new Error("School has teachers");
        err.status = STATUS.BAD_REQUEST;
        throw err;
    }
    const studentCount = await studentRepository.getStudentCountBySchoolId(schoolId);
    if (studentCount > 0) {
        const err = new Error("School has students");
        err.status = STATUS.BAD_REQUEST;
        throw err;
    }
    return await schoolRepository.deleteSchool(schoolId, tenantId);
}

/**
 * Get school analytics for a date range
 * @param {string} schoolId
 * @param {Date} start
 * @param {Date} end
 * @returns {Promise<Object[]>}
 */
exports.getSchoolAnalytics = async (schoolId, start, end) => {
    return ivrV2LogRepository.findBySchoolIdInDateRange(
        schoolId,
        start.toISOString(),
        end.toISOString()
    );
}

/**
 * Get school dashboard
 * @param {string} schoolId - The school id
 * @param {string} tenantId - The tenant id
 * @returns {Promise<Object>} - The school dashboard
 */
exports.getSchoolDashboard = async (schoolId, tenantId) => {
    const school = await schoolRepository.getSchoolById(schoolId, tenantId);
    if (!school) {
        const err = new Error("School not found");
        err.status = STATUS.NOT_FOUND;
        throw err;
    }

    const [teacherCount, studentCount, classCount] = await Promise.all([
        Teacher.countDocuments({ schoolId }),
        Student.countDocuments({ schoolId }),
        Class.countDocuments({ schoolId }),
    ]);

    return {
        school,
        teachers: teacherCount,
        students: studentCount,
        classes: classCount,
    };
}