import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import pluginJSDoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/no-v-html': 'warn',
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ]
    }
  },
  {
    files: ['src/**/*.js', 'tree/**/*.js'],
    plugins: { jsdoc: pluginJSDoc },
    rules: {
      ...pluginJSDoc.configs['flat/recommended'].rules,
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/tag-lines': 'off',
      'jsdoc/check-param-names': 'off',
      'jsdoc/check-types': 'warn',
      'jsdoc/no-undefined-types': 'off',
      'jsdoc/valid-types': 'warn',
    },
  },
];
