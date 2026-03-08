"use strict";
const mongoose = require("mongoose");

const SchoolSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, index: true, ref: "Tenant" },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

const School = mongoose.model("School", SchoolSchema);

module.exports = School;