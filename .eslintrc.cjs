module.exports = {
    plugins: [
        '@typescript-eslint',
        '@stylistic'
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking'
    ],
    env: {
        es6: true,
        browser: true
    },
    ignorePatterns: [
        '**/dist/**/*.js',
        '**/dist/**/*.ts'
    ],
    overrides: [
        {
            files: ['**/*.cjs', 'rollup.config.js'],
            env: {
                node: true
            },
            parserOptions: {
                sourceType: 'module',
                project: null
            }
        }
    ],
    rules: {
        '@typescript-eslint/no-unused-vars': ['error', {'args': 'after-used', 'varsIgnorePattern': '__.*$'}],
        '@typescript-eslint/ban-types': ['error', {
            extendDefaults: true,
            types: {
                '{}': false
            }
        }],
        '@typescript-eslint/no-explicit-any': ['error', {'ignoreRestArgs': true}],
        'no-constant-condition': ['error', {'checkLoops': false}],

        '@stylistic/array-bracket-spacing': ['error', 'never'],
        '@stylistic/comma-dangle': ['error', 'always-multiline'],
        '@stylistic/comma-spacing': ['error'],
        '@stylistic/comma-style': ['error'],
        '@stylistic/eol-last': ['error', 'always'],
        'eqeqeq': ['warn'],
        '@stylistic/func-call-spacing': ['error', 'never'],
        '@stylistic/indent': ['error', 4, {'SwitchCase': 1}],
        '@stylistic/key-spacing': ['error', {
            beforeColon: false,
            afterColon: true,
            mode: 'strict'
        }],
        '@stylistic/keyword-spacing': ['error', {
            before: true,
            after: true
        }],
        '@stylistic/max-len': [1, {
            code: 120,
            tabWidth: 4,
            ignoreUrls: true,
            ignoreTemplateLiterals: true
        }],
        '@stylistic/new-parens': ['error'],
        '@stylistic/newline-per-chained-call': ['error'],
        'no-console': ['error'],
        '@stylistic/no-mixed-operators': ['error'],
        '@stylistic/no-multiple-empty-lines': ['error', {
            max: 2,
            maxBOF: 0,
            maxEOF: 0
        }],
        'no-throw-literal': ['error'],
        '@stylistic/no-trailing-spaces': ['error', {skipBlankLines: true}],
        'no-unneeded-ternary': ['error'],
        '@stylistic/object-curly-spacing': ['error'],
        '@stylistic/object-property-newline': ['error', {
            allowMultiplePropertiesPerLine: true
        }],
        '@stylistic/operator-linebreak': ['error', 'after'],
        'prefer-const': ['error'],
        '@stylistic/quotes': ['error', 'single', {
            allowTemplateLiterals: true,
            avoidEscape: true
        }],
        '@stylistic/semi': ['error', 'always'],
        '@stylistic/semi-spacing': ['error'],
        '@stylistic/space-before-function-paren': ['error', 'never'],
        '@stylistic/space-in-parens': ['error'],
        '@stylistic/space-infix-ops': ['error'],
        '@stylistic/space-unary-ops': ['error'],
        '@stylistic/member-delimiter-style': ['error'],

        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/no-unescaped-entities': 'off',
        '@typescript-eslint/no-misused-promises': [
            'error',
            {
                checksVoidReturn: false
            }
        ],
        'require-yield': 'off'
    },
    parserOptions: {
        'ecmaVersion': 11,
        'sourceType': 'module',
        'parser': '@typescript-eslint/parser',
        'project': './tsconfig.json'
    }
};
