"use strict";

const ivrV2LogDao = require("../dao/mongodb/IvrV2LogMongoDao");

exports.findBySchoolIdInDateRange = async (schoolId, startStr, endStr) => {
    return ivrV2LogDao.findBySchoolIdInDateRange(schoolId, startStr, endStr);
};

exports.findByTenantIdInDateRange = async (tenantId, startStr, endStr) => {
    return ivrV2LogDao.findByTenantIdInDateRange(tenantId, startStr, endStr);
};

exports.findForAnalytics = async (params) => {
    return ivrV2LogDao.findForAnalytics(params);
};
