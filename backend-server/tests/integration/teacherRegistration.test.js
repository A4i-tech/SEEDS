const request = require("supertest");
const app = require("../../src/index");
const { setup, teardown } = require("./integrationSetup");

const STATUS_UNAUTHORIZED = 401;

const TEST_PHONE = "1234567890";
const TEST_PASSWORD = "TestPassword123!";
const TEST_TEACHER_NAME = "Test Teacher";

describe("Teacher registration API (integration)", () => {
  beforeAll(setup, 30000);
  afterAll(teardown);

  test("register fails without Authorization token", async () => {
    const res = await request(app).post("/teacher/register").send({
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
      name: TEST_TEACHER_NAME,
    });
    expect(res.statusCode).toBe(STATUS_UNAUTHORIZED);
  });
});
