/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: {
    '^@dcc-amm/core$': '<rootDir>/../amm-core/src/index',
    '^@dcc-amm/core/(.*)$': '<rootDir>/../amm-core/src/$1',
  },
};
