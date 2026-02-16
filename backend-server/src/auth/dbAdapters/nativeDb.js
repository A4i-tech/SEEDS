const Tenant = require("../../models/Tenant");
const Teacher = require("../../models/Teacher");
const ContentCreator = require("../../models/ContentCreator");

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
  async insertTeacher({ phoneNumber, password, tenantId, name }) {
    return Teacher.create({ phoneNumber, password, tenantId, name });
  },
  async updateTenantPassword(tenantId, newPassword) {
    return Tenant.findByIdAndUpdate(tenantId, { password: newPassword });
  },
  async getContentCreatorByEmail(email) {
    return ContentCreator.findOne({ email });
  },
  async getContentCreatorById(id) {
    return ContentCreator.findById(id);
  },
  async getContentCreatorsByTenantId(tenantId) {
    return ContentCreator.find({ tenantId }).lean().exec();
  },
  async insertContentCreator({ email, password, name, tenantId }) {
    return ContentCreator.create({ email, password, name, tenantId });
  },
};
