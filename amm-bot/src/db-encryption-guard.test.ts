/**
 * Tests that src/db.ts still refuses to load when ENCRYPTION_SECRET is
 * unset. This is a deliberate fail-loud guard — see the comment above the
 * throw in db.ts — and must never be weakened or removed.
 *
 * process.env is a real, shared Node object under Jest's node test
 * environment (it is NOT reset per test file within the same worker), so
 * every test here explicitly saves/restores ENCRYPTION_SECRET rather than
 * relying on isolation between files.
 */

export {}; // force module scope (no top-level `import` otherwise)

describe('ENCRYPTION_SECRET load-time guard', () => {
  const original = process.env.ENCRYPTION_SECRET;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ENCRYPTION_SECRET;
    } else {
      process.env.ENCRYPTION_SECRET = original;
    }
    jest.resetModules();
  });

  it('throws at import time when ENCRYPTION_SECRET is unset', () => {
    delete process.env.ENCRYPTION_SECRET;
    jest.resetModules();

    expect(() => {
      require('./db');
    }).toThrow('ENCRYPTION_SECRET environment variable is required — refusing to start with wallet encryption unconfigured.');
  });

  it('throws when ENCRYPTION_SECRET is set to an empty string', () => {
    process.env.ENCRYPTION_SECRET = '';
    jest.resetModules();

    expect(() => {
      require('./db');
    }).toThrow(/ENCRYPTION_SECRET/);
  });

  it('does not throw when ENCRYPTION_SECRET is set to a non-empty value', () => {
    process.env.ENCRYPTION_SECRET = 'a-valid-test-secret';
    jest.resetModules();

    expect(() => {
      require('./db');
    }).not.toThrow();
  });
});
