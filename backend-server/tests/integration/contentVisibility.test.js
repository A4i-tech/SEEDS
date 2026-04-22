const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");
const { ContentV3 } = require("../../src/models/ContentV3");

const SECRET_KEY = process.env.SECRET_KEY;

function signToken(payload) {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: "1h" });
}

async function createContent({ tenantId, schoolId, title = "Story title", createdBy = "" }) {
  return ContentV3.create({
    _id: new mongoose.Types.ObjectId().toString(),
    tenantId,
    schoolId,
    createdBy,
    description: "Test content",
    type: "story",
    language: "english",
    title: { english: title },
    theme: { english: "Animals" },
    creation_time: Math.floor(Date.now() / 1000),
  });
}

function getEnglishTitles(items) {
  return items.map((item) => item.title.english).sort();
}

describe("Content visibility - integration", () => {
  beforeAll(setup);
  afterAll(teardown);
  beforeEach(clearDatabase);

  test("tenant cannot see school-scoped content", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const schoolId = new mongoose.Types.ObjectId();
    await createContent({ tenantId, schoolId });

    const token = signToken({
      email: "tenant@example.com",
      role: "tenant",
      id: tenantId.toString(),
      iss: "tenant",
    });

    const res = await request(app)
      .get("/content")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test("tenant cannot see tenant-level content either", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    await createContent({ tenantId, schoolId: null });

    const token = signToken({
      email: "tenant@example.com",
      role: "tenant",
      id: tenantId.toString(),
      iss: "tenant",
    });

    const res = await request(app)
      .get("/content")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test("school-scoped users only see their own school content", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const schoolId = new mongoose.Types.ObjectId();
    const otherSchoolId = new mongoose.Types.ObjectId();
    await createContent({ tenantId, schoolId });
    await createContent({ tenantId, schoolId: null });

    const matchingSchoolToken = signToken({
      email: "admin@school.com",
      role: "school_admin",
      schoolId: schoolId.toString(),
      tenantId: tenantId.toString(),
      iss: "school_admin",
    });
    const otherSchoolToken = signToken({
      email: "other@school.com",
      role: "school_admin",
      schoolId: otherSchoolId.toString(),
      tenantId: tenantId.toString(),
      iss: "school_admin",
    });

    const matchingRes = await request(app)
      .get("/content")
      .set("Authorization", `Bearer ${matchingSchoolToken}`);
    const otherRes = await request(app)
      .get("/content")
      .set("Authorization", `Bearer ${otherSchoolToken}`);

    expect(matchingRes.status).toBe(200);
    expect(matchingRes.body.data).toHaveLength(1);
    expect(matchingRes.body.data[0].schoolId).toBe(schoolId.toString());
    expect(otherRes.status).toBe(200);
    expect(otherRes.body.data).toHaveLength(0);
  });

  test("content creators see school content from each other but not other schools or tenant-level content", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const schoolId = new mongoose.Types.ObjectId();
    const otherSchoolId = new mongoose.Types.ObjectId();
    const creatorA = new mongoose.Types.ObjectId().toString();
    const creatorB = new mongoose.Types.ObjectId().toString();
    const creatorC = new mongoose.Types.ObjectId().toString();
    const sameSchoolTitles = ["School story one", "School story two"];

    await createContent({ tenantId, schoolId, createdBy: creatorA, title: sameSchoolTitles[0] });
    await createContent({ tenantId, schoolId, createdBy: creatorB, title: sameSchoolTitles[1] });
    await createContent({ tenantId, schoolId: null, title: "Tenant story" });
    await createContent({
      tenantId,
      schoolId: otherSchoolId,
      createdBy: creatorC,
      title: "Other school story",
    });

    const sameSchoolCreatorToken = signToken({
      id: creatorA,
      role: "content_creator",
      schoolId: schoolId.toString(),
      tenantId: tenantId.toString(),
      iss: "teacher",
    });
    const sameSchoolSecondCreatorToken = signToken({
      id: creatorB,
      role: "content_creator",
      schoolId: schoolId.toString(),
      tenantId: tenantId.toString(),
      iss: "teacher",
    });
    const otherSchoolCreatorToken = signToken({
      id: creatorC,
      role: "content_creator",
      schoolId: otherSchoolId.toString(),
      tenantId: tenantId.toString(),
      iss: "teacher",
    });

    const sameSchoolRes = await request(app)
      .get("/content")
      .set("Authorization", `Bearer ${sameSchoolCreatorToken}`);
    const sameSchoolSecondCreatorRes = await request(app)
      .get("/content")
      .set("Authorization", `Bearer ${sameSchoolSecondCreatorToken}`);
    const otherSchoolRes = await request(app)
      .get("/content")
      .set("Authorization", `Bearer ${otherSchoolCreatorToken}`);

    expect(sameSchoolRes.status).toBe(200);
    expect(getEnglishTitles(sameSchoolRes.body.data)).toEqual(sameSchoolTitles);
    expect(sameSchoolSecondCreatorRes.status).toBe(200);
    expect(getEnglishTitles(sameSchoolSecondCreatorRes.body.data)).toEqual(sameSchoolTitles);
    expect(otherSchoolRes.status).toBe(200);
    expect(getEnglishTitles(otherSchoolRes.body.data)).toEqual(["Other school story"]);
  });
});
