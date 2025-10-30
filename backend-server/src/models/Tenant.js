"use strict";

const mongoose = require("mongoose");
const tenantSchema = new (require("mongoose").Schema)({
    email: {type: String, required: true, unique: true, index: true},
    password: {type: String, required: true},
    tenantName: {type: String, required: true, index: true}
  }, {timestamps: true}
);

const Tenant = mongoose.model("Tenant", tenantSchema);
module.exports = Tenant;