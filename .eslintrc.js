module.exports = {
  extends: [
    'eslint:recommended',
    'prettier',
    'plugin:yml/standard'
  ],
  rules: {
    'yml/plain-scalar': 'off',
    'yml/no-empty-mapping-value': 'off'
  },
  parserOptions: {
    ecmaVersion: "latest",
  },
  env: {
    es6: true,
    node: true,
  }
}