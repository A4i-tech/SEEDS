// jest.config.js
module.exports = {
  // Tells Jest where to find test files
  roots: ["<rootDir>/tests"],

  // The testMatch pattern is relative to the `roots` directory
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],

  // Transform files with Babel
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": "babel-jest",
  },
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/tests/setupTests.js"],
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "<rootDir>/tests/styleMock.js",
  },
  coverageDirectory: "coverage",
  coverageReporters: ["json-summary", "text", "lcov", "html"],
};
