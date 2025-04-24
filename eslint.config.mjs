import globals from "globals";

export default [
    {
        files: ['**/*.js'],
        rules: {
            'no-undef': 'error',
            'no-unused-vars': 'warn',
            'no-console': 'off',
            'semi': ['error', 'always'],
            'quotes': ['warn', 'single'],
            'indent': ['warn', 4],
            'comma-dangle': ['warn', 'never'],
            'no-trailing-spaces': 'warn',
            'eol-last': 'warn',
            'space-before-function-paren': ['warn', 'never'],
            'space-before-blocks': 'warn',
            'keyword-spacing': 'warn',
            'space-infix-ops': 'warn'
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module'
        }
    }
];