"use strict";

const IIvrV2LogDao = require("../interfaces/IIvrV2LogDao");
const IvrV2Log = require("../../models/IvrV2Log");

class IvrV2LogMongoDao extends IIvrV2LogDao {
    async findBySchoolIdInDateRange(schoolId, startStr, endStr) {
        return IvrV2Log.find({
            school_id: schoolId,
            created_at: { $gte: startStr, $lte: endStr },
        }).lean();
    }

    async findByTenantIdInDateRange(tenantId, startStr, endStr) {
        return IvrV2Log.find({
            tenant_id: tenantId,
            created_at: { $gte: startStr, $lte: endStr },
        }).lean();
    }
}

module.exports = new IvrV2LogMongoDao();
