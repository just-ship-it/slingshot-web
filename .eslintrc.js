module.exports = {
  extends: ['react-app', 'react-app/jest'],
  rules: {
    // Make these warnings instead of errors in CI
    'no-unused-vars': 'warn',
    'react-hooks/exhaustive-deps': 'warn'
  }
};