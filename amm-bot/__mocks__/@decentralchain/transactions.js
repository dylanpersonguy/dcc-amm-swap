/**
 * Manual Jest mock for `@decentralchain/transactions`.
 *
 * The real package is ESM-only (package.json "type": "module") with a deep
 * transitive dependency chain (@decentralchain/ts-lib-crypto,
 * @decentralchain/marshall, @noble/*, etc.) that is also ESM-only and, for
 * several of those packages, has no usable CJS/"require" export condition
 * at all. Jest's CJS-based module system can't load that chain directly.
 *
 * None of the tests in this package exercise real transaction signing,
 * broadcasting, or on-chain address derivation (that's integration-level
 * behavior, out of scope here — see the test suite's own notes on what's
 * deliberately not covered). This package is only ever pulled in
 * transitively, via src/config.ts's top-level `import { libs } from
 * '@decentralchain/transactions'`, by modules under test (src/db.ts and
 * everything that imports it) that don't actually call into it during the
 * code paths being tested. A manual mock sidesteps the ESM/CJS interop
 * problem entirely rather than fighting it with a custom Babel/ts-jest
 * transform pipeline for a dependency that isn't under test.
 *
 * Every function here is a safe stub: it returns a plausible, deterministic
 * fake value rather than throwing, so any incidental call (e.g. a future
 * code path that does invoke one of these outside what today's tests
 * exercise) fails loudly in a test assertion rather than in an unrelated
 * "Cannot use import statement outside a module" error.
 */

const crypto = {
  address: (_seedOrPublicKey, _chainId) => 'MOCK_ADDRESS_DO_NOT_USE',
  publicKey: (_seed) => 'MOCK_PUBLIC_KEY_DO_NOT_USE',
  privateKey: (_seed) => 'MOCK_PRIVATE_KEY_DO_NOT_USE',
  randomSeed: (_wordsCount) =>
    'mock random seed words for testing only do not use in production ever',
  signBytes: (_seed, _bytes) => new Uint8Array(64),
  verifySignature: (_publicKey, _bytes, _signature) => true,
};

function invokeScript(_params, _seed) {
  return { id: 'MOCK_TX_ID', dApp: _params?.dApp, call: _params?.call };
}

function transfer(_params, _seed) {
  return { id: 'MOCK_TX_ID', recipient: _params?.recipient, amount: _params?.amount };
}

async function broadcast(tx, _nodeUrl) {
  return tx;
}

async function waitForTx(_txId, _opts) {
  return { id: _txId, applicationStatus: 'succeeded' };
}

module.exports = {
  libs: { crypto, marshall: {} },
  invokeScript,
  transfer,
  broadcast,
  waitForTx,
};
