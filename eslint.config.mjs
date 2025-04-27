import globals from "globals";

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,   // 👈 add Node.js globals (like you had)
        ...globals.mocha,  // 👈 add Mocha globals (suite, test, etc)
      },
      ecmaVersion: 2022,
      sourceType: 'commonjs'
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error'
    }
  }
];
