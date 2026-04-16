const Tenant = require("../../models/Tenant");
const Teacher = require("../../models/Teacher");

function toTeacherRecord(doc) {
  if (!doc) {
    return null;
  }

  const record = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...record,
    id: String(record._id),
  };
}

module.exports = {
  async getAllTenants() {
    const docs = await Tenant.find({});
    return docs.map((d) => ({ id: d._id, tenantName: d.tenantName }));
  },
  async getTenantById(tenantId) {
    return Tenant.findById(tenantId);
  },
  async getTenantByEmail(email) {
    return Tenant.findOne({ email });
  },
  async insertTenant({ email, password, tenantName }) {
    return Tenant.create({ email, password, tenantName });
  },
  async getTeacherByTenantIdAndPhoneNumber(tenantId, phoneNumber) {
    const doc = await Teacher.findOne({ tenantId, phoneNumber });
    return toTeacherRecord(doc);
  },
  async getTeacherByPhoneNumber(phoneNumber) {
    const doc = await Teacher.findOne({ phoneNumber });
    return toTeacherRecord(doc);
  },
  async insertTeacher({ phoneNumber, password, tenantId, name, role }) {
    return Teacher.create({ phoneNumber, password, tenantId, name, role });
  },
  async updateTenantPassword(tenantId, newPassword) {
    return Tenant.findByIdAndUpdate(tenantId, { password: newPassword });
  },
};
