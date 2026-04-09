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
  async insertTenant({ email, password, tenantName, role }) {
    const tenantsRef = db.collection("Tenants");
    const newTenantRef = tenantsRef.doc();
    await newTenantRef.set({ email, password, tenantName, role });
    return { id: newTenantRef.id, email, password, tenantName, role };
  },
  async getTeacherByPhoneNumber(phoneNumber) {
    const snapshot = await db.collection("Teacher")
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },
  async getTeacherBySchoolIdAndPhoneNumber(schoolId, phoneNumber) {
    const schoolsRef = db.collection("Schools").doc(schoolId);
    const schoolDoc = await schoolsRef.get();
    if (!schoolDoc.exists) {
      return null;
    }
    const teachersRef = db.collection("Teacher");
    const snapshot = await teachersRef
      .where("phoneNumber", "==", phoneNumber)
      .where("schoolId", "==", schoolId)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },
  async insertTeacher({ phoneNumber, password, schoolId, name, role }) {
    const teachersRef = db.collection("Teacher");
    const newTeacherRef = teachersRef.doc();
    await newTeacherRef.set({ phoneNumber, password, schoolId, name, role });
    return { id: newTeacherRef.id, phoneNumber, schoolId, name, role };
  },
  async updateTenantPassword(tenantId, newPassword) {
    const tenantRef = db.collection("Tenants").doc(tenantId);
    await tenantRef.update({ password: newPassword });
    return;
  },
  async updateTeacher(teacherId, schoolId, updates) {
    const teacherRef = db.collection("Teacher").doc(teacherId);
    await teacherRef.update(updates);
    return { id: teacherRef.id, ...updates };
  },
};
