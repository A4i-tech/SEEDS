const mongoose = require("mongoose");
const Teacher = require("../../src/models/Teacher");

const VALID_SCHOOL_ID = new mongoose.Types.ObjectId();

describe("Teacher schema constraints", () => {
  test("does not enforce phone number format at schema level", () => {
    const doc = new Teacher({
      schoolId: VALID_SCHOOL_ID,
      name: "Creator Name",
      phoneNumber: "abc123",
      password: "StrongPass1!",
      role: "content_creator",
    });

    const error = doc.validateSync();
    expect(error).toBeUndefined();
  });

  test("enforces minimum password length", () => {
    const doc = new Teacher({
      schoolId: VALID_SCHOOL_ID,
      name: "Creator Name",
      phoneNumber: "9876543210",
      password: "short",
      role: "content_creator",
    });

    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.password).toBeDefined();
  });

  test("requires schoolId", () => {
    const doc = new Teacher({
      name: "Creator Name",
      phoneNumber: "9876543210",
      password: "StrongPass1!",
      role: "content_creator",
    });

    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.schoolId).toBeDefined();
  });

  test("trims name", () => {
    const doc = new Teacher({
      schoolId: VALID_SCHOOL_ID,
      name: "  Creator Name  ",
      phoneNumber: "9876543210",
      password: "StrongPass1!",
      role: "content_creator",
    });

    expect(doc.name).toBe("Creator Name");
  });
});
