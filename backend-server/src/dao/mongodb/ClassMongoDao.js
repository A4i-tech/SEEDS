"use strict";

const IClassDao = require("../interfaces/IClassDao");
const Class = require("../../models/Class");

class ClassMongoDao extends IClassDao {
    async getClassCountBySchoolId(schoolId) {
        return Class.countDocuments({ schoolId });
    }
}

module.exports = new ClassMongoDao();
