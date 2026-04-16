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

function toTeacherRecord(doc) {
  return { id: doc.id, ...doc.data() };
}

module.exports = {
  async getAllTenants(req, res) {
    const tenantsRef = db.collection("Tenants");
    const snapshot = await tenantsRef.get();
    const tenants = [];
    snapshot.forEach((doc) => {
      tenants.push({ id: doc.id, tenantName: doc.data().tenantName });
    });
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
    const snapshot = await db
      .collection("Teacher")
      .where("tenantId", "==", tenantId)
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    return toTeacherRecord(snapshot.docs[0]);
  },
  async getTeacherByPhoneNumber(phoneNumber) {
    const snapshot = await db
      .collection("Teacher")
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    return toTeacherRecord(snapshot.docs[0]);
  },
  async insertTeacher({ phoneNumber, password, tenantId, name, role }) {
    const teachersRef = db.collection("Teacher");
    const newTeacherRef = teachersRef.doc();
    await newTeacherRef.set({ phoneNumber, password, tenantId, name, role });
    return { id: newTeacherRef.id, phoneNumber, tenantId, name, role };
  },
  async updateTenantPassword(tenantId, newPassword) {
    const tenantRef = db.collection("Tenants").doc(tenantId);
    await tenantRef.update({ password: newPassword });
    return;
  },
};
