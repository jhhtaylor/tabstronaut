
const parser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser,
      sourceType: "module",
      ecmaVersion: 6,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/naming-convention": "warn",
      "semi": "warn",
      "curly": "warn",
      "eqeqeq": "warn",
      "no-throw-literal": "warn"
    }
  },
  {
    ignores: ["out", "dist", "**/*.d.ts"]
  }
];
