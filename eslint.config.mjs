import globals from "globals";

export default [
    {
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                console: 'readonly',
                require: 'readonly',
                module: 'readonly',
                process: 'readonly',
                __dirname: 'readonly',
                Buffer: 'readonly'
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