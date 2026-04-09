"use strict";

const schoolRepository = require("../repositories/school.repository");
const teacherRepository = require("../repositories/teacher.repository");
const studentRepository = require("../repositories/student.repository");
const classRepository = require("../repositories/class.repository");
const ivrV2LogRepository = require("../repositories/ivrV2Log.repository");
const tenantRepository = require("../repositories/tenant.repository");
const { STATUS } = require("../config/constants");

/**
 * Get tenant by ID
 * @param {string} tenantId
 * @returns {Promise<Object|null>}
 */
exports.getTenantById = async (tenantId) => {
    return tenantRepository.getTenantById(tenantId);
};

/**
 * Get tenant analytics for a date range
 * @param {string} tenantId
 * @param {Date} start
 * @param {Date} end
 * @returns {Promise<Object[]>}
 */
exports.getTenantAnalytics = async (tenantId, start, end) => {
    return ivrV2LogRepository.findByTenantIdInDateRange(
        tenantId,
        start.toISOString(),
        end.toISOString()
    );
};

/**
 * Get dashboard statistics for a tenant
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
exports.getDashboard = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const schools = await schoolRepository.getSchools(tenantId);

        const schoolStats = await Promise.all(
            schools.map(async (school) => {
                const [teacherCount, studentCount, classCount] = await Promise.all([
                    teacherRepository.getTeacherCountBySchoolId(school._id),
                    studentRepository.getStudentCountBySchoolId(school._id),
                    classRepository.getClassCountBySchoolId(school._id),
                ]);
                return {
                    ...(school.toObject ? school.toObject() : school),
                    teacherCount,
                    studentCount,
                    classCount,
                };
            })
        );

        const totalTeachers = schoolStats.reduce((sum, s) => sum + s.teacherCount, 0);
        const totalStudents = schoolStats.reduce((sum, s) => sum + s.studentCount, 0);
        const totalClasses = schoolStats.reduce((sum, s) => sum + s.classCount, 0);

        return res.status(STATUS.OK).json({
            statistics: {
                totalSchools: schools.length,
                totalTeachers,
                totalStudents,
                totalClasses,
            },
            schools: schoolStats,
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};
