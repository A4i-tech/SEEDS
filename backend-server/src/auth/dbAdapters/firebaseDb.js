const admin = require("firebase-admin");
const { firebaseServiceAccount, authType } = require("../../config/env");

let db = null;

if (authType === "firebase") {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(firebaseServiceAccount)),
    });
  }
  db = admin.firestore();
}

module.exports = {
  async getAllTenants(req, res) {
    const tenantsRef = db.collection("Tenants");
    const snapshot = await tenantsRef.get();
    const tenants = [];
    snapshot.forEach((doc) => {
      tenants.push({ id: doc.id, tenantName: doc.data().tenantName });
    });
    console.log(tenants);
    return tenants;
  },
  async getTenantById(tenantId) {
    const tenantsRef = db.collection("Tenants").doc(tenantId);
    const doc = await tenantsRef.get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  },
  async getTenantByEmail(email) {
    const tenantsRef = db.collection("Tenants");
    const snapshot = await tenantsRef.where("email", "==", email).get();
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data();
  },
  async insertTenant({ email, password, tenantName }) {
    const tenantsRef = db.collection("Tenants");
    const newTenantRef = tenantsRef.doc();
    await newTenantRef.set({ email, password, tenantName });
    return { id: newTenantRef.id, email, password, tenantName };
  },
  async getTeacherByTenantIdAndPhoneNumber(tenantId, phoneNumber) {
    const tenantSnapshot = await this.getTenantById(tenantId);
    if (!tenantSnapshot) {
      return null;
    }
    const teachersRef = db.collection("Teacher");
    const snapshot = await teachersRef
      .where("phoneNumber", "==", phoneNumber)
      .where("tenantId", "==", tenantId)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },
  async insertTeacher({ phoneNumber, password, tenantId }) {
    const teachersRef = db.collection("Teacher");
    const newTeacherRef = teachersRef.doc();
    await newTeacherRef.set({ phoneNumber, password, tenantId });
    return { id: newTeacherRef.id, phoneNumber, password, tenantId };
  },
};
