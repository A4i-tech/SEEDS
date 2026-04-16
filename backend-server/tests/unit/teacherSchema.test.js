const Teacher = require("../../src/models/Teacher");

describe("Teacher schema constraints", () => {
  test("does not enforce phone number format at schema level", () => {
    const doc = new Teacher({
      tenantId: "tenant-1",
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
      tenantId: "tenant-1",
      name: "Creator Name",
      phoneNumber: "9876543210",
      password: "short",
      role: "content_creator",
    });

    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.password).toBeDefined();
  });

  test("trims tenantId and name", () => {
    const doc = new Teacher({
      tenantId: "  tenant-1  ",
      name: "  Creator Name  ",
      phoneNumber: "9876543210",
      password: "StrongPass1!",
      role: "content_creator",
    });

    expect(doc.tenantId).toBe("tenant-1");
    expect(doc.name).toBe("Creator Name");
  });
});
