const mongo = require('../../config/mongo')

module.exports = {
  async getTenantByName(tenantName) {
    const db = await mongo();
    const tenantsCollection = db.collection('tenants');
    return tenantsCollection.findOne({tenantName});
  },
  async getTenantByEmail(email) {
    const db = await mongo();
    return db.collection('tenants').findOne({email});
  },
  async insertTenant({email, passwordHash, tenantName}) {
    const db = await mongo();
    return db.collection('tenants').insertOne({email, passwordHash, tenantName});
  },
  async getTeacherByTenantNameAndPhoneNumber(tenantName, phoneNumber) {
    const db = await mongo();
    const tenant = await this.getTenantByName(tenantName);
    if (!tenant) {
      return null;
    }
    return db.collection('teachers').findOne({tenantName, phoneNumber});
  },
  async insertTeacher({phoneNumber, password, tenantName}) {
    const db = await mongo();
    return db.collection('teachers').insertOne({phoneNumber, password, tenantName});
  }
}