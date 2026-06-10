"use strict";

const conferenceStateDao = require("../dao/mongodb/ConferenceStateMongoDao");

exports.findByTeacherPhonesInDateRange = async (phoneCandidates, startIso, endIso) => {
    return conferenceStateDao.findByTeacherPhonesInDateRange(phoneCandidates, startIso, endIso);
};
