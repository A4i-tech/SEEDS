"use strict";

const IConferenceStateDao = require("../interfaces/IConferenceStateDao");
const ConferenceState = require("../../models/ConferenceState");

class ConferenceStateMongoDao extends IConferenceStateDao {
    async findByTeacherPhonesInDateRange(phoneCandidates, startIso, endIso) {
        return ConferenceState.find({
            teacher_phone_number: { $in: phoneCandidates },
            "action_history.0.timestamp": { $gte: startIso, $lte: endIso },
        }).lean();
    }
}

module.exports = new ConferenceStateMongoDao();
