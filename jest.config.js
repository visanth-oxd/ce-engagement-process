/** Runs the unit tests for all plugins (node env; pure logic + mocked I/O). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/plugins'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@internal/plugin-engagement-common$':
      '<rootDir>/plugins/engagement-common/src',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', esModuleInterop: true } }],
  },
};
