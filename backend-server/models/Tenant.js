"use strict";

const mongoose = require("mongoose");
const tenantSchema = new (require("mongoose").Schema)({
        email: {type: String, required: true, unique: true},
        password: {type: String, required: true},
        name: {type: String, required: true},
        created_at: {type: Date, default: Date.now}
    }, {timestamps: true}
);

const Tenant = mongoose.model("Tenant", tenantSchema);
module.exports = Tenant;