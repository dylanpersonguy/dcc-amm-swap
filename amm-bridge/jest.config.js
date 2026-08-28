/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts'],
  // uuid and the @decentralchain/* packages ship ESM-only builds (package.json
  // "type": "module", no CJS "require" export condition). Jest's module system
  // doesn't get Node's runtime require(esm) interop, so without this they fail
  // to load with "Cannot use import statement outside a module". Transform them
  // through ts-jest (which just compiles the ESM syntax to CJS) instead of
  // leaving them untouched like the rest of node_modules.
  transformIgnorePatterns: ['node_modules/(?!(uuid|@decentralchain|@noble|protobufjs)/)'],
  // Several @decentralchain/* packages' "exports" maps only declare an "import"
  // condition — no "require"/"node" condition, and where a "default" exists it's
  // a broken UMD bundle (throws at load time). Jest's CJS-style resolution can't
  // reach the real ESM build through the exports map, so redirect each package
  // straight at its dist/*.mjs (or .js, for protobuf-serialization) entry point.
  // (A blanket `customExportConditions: ['import', ...]` was tried instead, but
  // it also redirects Jest/ts-jest's OWN internal deps — e.g. `dedent` — onto
  // their ESM builds and breaks those, so it's too broad a hammer here.)
  moduleNameMapper: {
    '^@decentralchain/ts-lib-crypto$':
      '<rootDir>/node_modules/@decentralchain/ts-lib-crypto/dist/index.mjs',
    '^@decentralchain/ts-types$':
      '<rootDir>/node_modules/@decentralchain/ts-types/dist/index.mjs',
    '^@decentralchain/bignumber$':
      '<rootDir>/node_modules/@decentralchain/bignumber/dist/index.mjs',
    '^@decentralchain/protobuf-serialization$':
      '<rootDir>/node_modules/@decentralchain/protobuf-serialization/dist/index.js',
    '^@decentralchain/node-api-js$':
      '<rootDir>/node_modules/@decentralchain/node-api-js/dist/index.mjs',
    '^@decentralchain/node-api-js/(.+)$':
      '<rootDir>/node_modules/@decentralchain/node-api-js/dist/$1/index.mjs',
  },
  transform: {
    '^.+\\.(ts|js|mjs)$': ['ts-jest', {
      tsconfig: {
        allowJs: true,
        module: 'commonjs',
        target: 'es2020',
        esModuleInterop: true,
        isolatedModules: true,
      },
    }],
  },
  moduleFileExtensions: ['ts', 'js', 'mjs', 'json', 'node'],
};
