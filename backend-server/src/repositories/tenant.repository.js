"use strict";

const tenantDao = require("../dao/mongodb/TenantMongoDao");

exports.getTenantById = async (tenantId) => {
    return tenantDao.getTenantById(tenantId);
};
