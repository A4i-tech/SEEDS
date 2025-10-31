const admin = require('firebase-admin');
const {firebaseServiceAccount} = require('../../config/env');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(firebaseServiceAccount))
  });
}

const db = admin.firestore();

module.exports = {
  async getTenantByName(tenantName) {
    const tenantsRef = db.collection('Tenants');
    const snapshot = await tenantsRef.where('tenantName', '==', tenantName).get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data();
  },
  async getTenantByEmail(email) {
    const tenantsRef = db.collection('Tenants');
    const snapshot = await tenantsRef.where('email', '==', email).get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data();
  },
  async insertTenant({email, passwordHash, tenantName}) {
    const tenantsRef = db.collection('Tenants');
    const newTenantRef = tenantsRef.doc();
    await newTenantRef.set({email, passwordHash, tenantName});
    return {id: newTenantRef.id, email, passwordHash, tenantName};
  },
  async getTeacherByTenantNameAndPhoneNumber(tenantName, phoneNumber) {
    const tenantSnapshot = await this.getTenantByName(tenantName);
    if (!tenantSnapshot) {
      return null;
    }
    const teachersRef = db.collection('Teacher');
    const snapshot = await teachersRef.where('phoneNumber', '==', phoneNumber)
      .where('tenantName', '==', tenantName)
      .get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data();
  },
  async insertTeacher({phoneNumber, password, tenantName}) {
    const teachersRef = db.collection('Teacher');
    const newTeacherRef = teachersRef.doc();
    await newTeacherRef.set({phoneNumber, password, tenantName});
    return {id: newTeacherRef.id, phoneNumber, password, tenantName};
  }
}