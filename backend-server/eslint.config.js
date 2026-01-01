const js = require("@eslint/js");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
  js.configs.recommended,
  {
    rules: {
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "no-unused-vars": ["warn"],
      "no-console": ["warn"],
    },
  },
  prettier,
];
