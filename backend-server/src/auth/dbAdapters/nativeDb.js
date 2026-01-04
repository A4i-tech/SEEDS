const Tenant = require("../../models/Tenant");
const Teacher = require("../../models/Teacher");
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
  async insertTenant({ email, password, tenantName }) {
    return Tenant.create({ email, password, tenantName });
  },
  async getTeacherByTenantIdAndPhoneNumber(tenantId, phoneNumber) {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      return null;
    }
    return Teacher.findOne({ tenantId, phoneNumber });
  },
  async insertTeacher({ phoneNumber, password, tenantId }) {
    return Teacher.create({ phoneNumber, password, tenantId });
  },
};
