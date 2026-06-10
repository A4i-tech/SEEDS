"use strict";

class IIvrV2LogDao {
    async findBySchoolIdInDateRange(schoolId, startStr, endStr) {
        throw new Error("Not implemented");
    }

    async findByTenantIdInDateRange(tenantId, startStr, endStr) {
        throw new Error("Not implemented");
    }

    async findForAnalytics({ tenantId, startStr, endStr, phoneNumbers }) {
        throw new Error("Not implemented");
    }
}

module.exports = IIvrV2LogDao;
