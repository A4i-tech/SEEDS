"use strict";

const ITenantDao = require("../interfaces/ITenantDao");
const Tenant = require("../../models/Tenant");

class TenantMongoDao extends ITenantDao {
    async getTenantById(tenantId) {
        return Tenant.findById(tenantId).select("-password").lean();
    }
}

module.exports = new TenantMongoDao();
