module.exports = {
  extends: ["eslint:recommended", "prettier", "plugin:yml/standard"],
  rules: {
    "yml/no-empty-mapping-value": "off",
  },
  parserOptions: {
    ecmaVersion: "latest",
  },
  env: {
    es6: true,
    node: true,
  },
  overrides: [
    {
      files: ["**/__tests__/**/*.js"],
      parserOptions: {
        sourceType: "module",
      },
    },
  ],
};
