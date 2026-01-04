"use strict";

const mongoose = require("mongoose");
const tenantSchema = new (require("mongoose").Schema)(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    tenantName: { type: String, required: true },
  },
  { timestamps: true }
);

const Tenant = mongoose.model("Tenant", tenantSchema);
module.exports = Tenant;
