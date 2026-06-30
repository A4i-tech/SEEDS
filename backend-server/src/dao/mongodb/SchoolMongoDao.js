"use strict";
const ISchoolDao = require("../interfaces/ISchoolDao");
const School = require("../../models/School");

class SchoolMongoDao extends ISchoolDao {
    // Returns full document including password — used for login
    async getSchoolByEmail(email) {
        return School.findOne({ email }).lean();
    }

    async createSchool(name, email, tenantId, hashedPassword) {
        return School.create({ name, email, tenantId, password: hashedPassword });
    }

    async getSchools(tenantId) {
        return School.find({ tenantId }).select("-password").lean();
    }

    async getSchoolById(schoolId, tenantId) {
        return School.findOne({ _id: schoolId, tenantId }).select("-password").lean();
    }

    async updateSchool(school) {
        return School.findByIdAndUpdate(school._id, school, { new: true }).select("-password").lean();
    }

    async deleteSchool(schoolId, tenantId) {
        return School.findOneAndDelete({ _id: schoolId, tenantId }).lean();
    }

    async setSchoolPassword(schoolId, tenantId, hashedPassword) {
        return School.findOneAndUpdate(
            { _id: schoolId, tenantId },
            { $set: { password: hashedPassword, isActive: true } },
            { new: true }
        ).select("-password").lean();
    }
}

module.exports = new SchoolMongoDao();
