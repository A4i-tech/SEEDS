const fs = require("fs");
const path = require("path");
const { SUPPORTED_SPEEDS } = require("../../src/constants");

describe("SUPPORTED_SPEEDS", () => {
  test("matches platform/app/services/fsm/instantiation/speed_control.py", () => {
    const pySource = fs.readFileSync(
      path.join(__dirname, "../../../platform/app/services/fsm/instantiation/speed_control.py"),
      "utf8"
    );
    const match = pySource.match(/^SUPPORTED_SPEEDS = \[([^\]]+)\]/m);
    expect(match).not.toBeNull();
    const pySpeeds = match[1].split(",").map((s) => parseFloat(s.trim()));
    expect(SUPPORTED_SPEEDS).toEqual(pySpeeds);
  });
});
