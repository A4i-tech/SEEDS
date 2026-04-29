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

  test("school-scoped users see tenant-global content plus their own school content", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const schoolId = new mongoose.Types.ObjectId();
    const otherSchoolId = new mongoose.Types.ObjectId();
    await createContent({ tenantId, schoolId });
    await createContent({ tenantId, schoolId: null });

    const matchingSchoolToken = signToken({
      id: schoolId.toString(),
      email: "admin@school.com",
      role: "school_admin",
      schoolId: schoolId.toString(),
      tenantId: tenantId.toString(),
      iss: "school_admin",
    });
    const otherSchoolToken = signToken({
      id: otherSchoolId.toString(),
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
    expect(matchingRes.body.data).toHaveLength(2);
    expect(getEnglishTitles(matchingRes.body.data)).toEqual(["Story title", "Story title"]);
    expect(otherRes.status).toBe(200);
    expect(otherRes.body.data).toHaveLength(1);
    expect(otherRes.body.data[0].schoolId).toBeNull();
  });

  test("content creators see school content from each other plus tenant-global content, but not other schools", async () => {
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
    expect(getEnglishTitles(sameSchoolRes.body.data)).toEqual([...sameSchoolTitles, "Tenant story"].sort());
    expect(sameSchoolSecondCreatorRes.status).toBe(200);
    expect(getEnglishTitles(sameSchoolSecondCreatorRes.body.data)).toEqual([...sameSchoolTitles, "Tenant story"].sort());
    expect(otherSchoolRes.status).toBe(200);
    expect(getEnglishTitles(otherSchoolRes.body.data)).toEqual(["Other school story", "Tenant story"]);
  });
});
