"use strict";

class ISchoolDao {
    async getSchoolByEmail(email) {
        throw new Error("Not implemented");
    }
    async createSchool(name, email, tenantId, hashedPassword) {
        throw new Error("Not implemented");
    }
    async getSchools(tenantId) {
        throw new Error("Not implemented");
    }
    async getSchoolById(schoolId, tenantId) {
        throw new Error("Not implemented");
    }
    async updateSchool(school) {
        throw new Error("Not implemented");
    }
    async deleteSchool(schoolId, tenantId) {
        throw new Error("Not implemented");
    }
    async setSchoolPassword(schoolId, tenantId, hashedPassword) {
        throw new Error("Not implemented");
    }
}

module.exports = ISchoolDao;
