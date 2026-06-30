const Tenant = require("../../models/Tenant");
const Teacher = require("../../models/Teacher");
const School = require("../../models/School");

module.exports = {
  async getAllTenants() {
    const docs = await Tenant.find({}).lean().exec();
    return docs.map((d) => ({ id: d._id, tenantName: d.tenantName }));
  },
  async getTenantById(tenantId) {
    return Tenant.findById(tenantId);
  },
  async getTenantByEmail(email) {
    return Tenant.findOne({ email: email });
  },
  async insertTenant({ email, password, tenantName, role }) {
    return Tenant.create({ email, password, tenantName, role });
  },
  async getTeacherByPhoneNumber(phoneNumber) {
    return Teacher.findOne({ phoneNumber });
  },
  async getTeacherBySchoolIdAndPhoneNumber(schoolId, phoneNumber) {
    const school = await School.findById(schoolId);
    if (!school) {
      return null;
    }
    return Teacher.findOne({ schoolId, phoneNumber });
  },
  async insertTeacher({ phoneNumber, password, schoolId, name, role }) {
    return Teacher.create({ phoneNumber, password, schoolId, name, role });
  },
  async updateTenantPassword(tenantId, newPassword) {
    return Tenant.findByIdAndUpdate(tenantId, { password: newPassword });
  },
  async updateTeacher(teacherId, schoolId, updates) {
    return Teacher.findOneAndUpdate(
      { _id: teacherId, schoolId },
      updates,
      { new: true }
    ).select("-password").lean();
  },
};
