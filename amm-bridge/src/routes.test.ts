/**
 * End-to-end tests for the deposit-creation routes, focused on
 * validateDepositInput — the shared guard in front of /deposit and
 * /deposit/spl. It's the main line of defense against malformed or
 * malicious deposit requests, so every rejection branch gets its own case
 * here rather than relying on a single "garbage in" smoke test.
 *
 * The router is mounted on a minimal Express app (no Solana/DCC network
 * calls, no real admin secrets) so these hit the real route handlers via
 * supertest instead of re-implementing validation logic by hand.
 */
import express, { Express } from 'express';
import request from 'supertest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { address } from '@decentralchain/ts-lib-crypto';

jest.mock('./solana');
jest.mock('./dcc');

const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `amm-bridge-routes-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);

let db: any;
let solana: any;
let config: any;
let app: Express;

// A DCC address that is actually valid for whatever chain id `config`
// resolves to (default '?' unless DCC_CHAIN_ID is set) — generated the same
// way the real SDK derives an address from a seed, so the checksum is real.
let validRecipient: string;

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  jest.resetModules();

  config = require('./config').config;
  db = require('./db');
  db.initDb();
  solana = require('./solana');
  const routes = require('./routes').default;

  validRecipient = address('routes-test-recipient-seed', config.dccChainId);

  app = express();
  app.use(express.json());
  app.use(routes);
});

afterAll(() => {
  delete process.env.DB_PATH;
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(TEST_DB_PATH + suffix)) fs.unlinkSync(TEST_DB_PATH + suffix);
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

const validBody = () => ({
  coin: 'SOL',
  amountUsd: 100,
  dccRecipient: validRecipient,
  userId: 42,
});

describe('POST /deposit — required fields', () => {
  const requiredMsg = 'Required fields: coin, amountUsd, dccRecipient, userId';

  it.each(['coin', 'amountUsd', 'dccRecipient', 'userId'])(
    'rejects when %s is missing',
    async (field) => {
      const body = validBody() as Record<string, unknown>;
      delete body[field];
      const res = await request(app).post('/deposit').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(requiredMsg);
    },
  );

  it('rejects amountUsd of 0 as a missing field (falsy short-circuit)', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), amountUsd: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(requiredMsg);
  });

  it('rejects userId of 0 as a missing field (falsy short-circuit)', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), userId: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(requiredMsg);
  });
});

describe('POST /deposit — amountUsd validation', () => {
  const msg = 'amountUsd must be a positive finite number';

  it('rejects a negative amountUsd', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), amountUsd: -50 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  it('rejects a string amountUsd (type confusion)', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), amountUsd: '100' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  it('rejects an amountUsd that overflows to Infinity', async () => {
    // 1e400 is syntactically valid JSON but numerically overflows a double,
    // so JSON.parse turns it into Infinity — a real way a client could try
    // to sneak a non-finite number through a body that express.json() will
    // still accept as well-formed JSON.
    const rawBody = `{"coin":"SOL","amountUsd":1e400,"dccRecipient":"${validRecipient}","userId":42}`;
    const res = await request(app)
      .post('/deposit')
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });
});

describe('POST /deposit — userId validation', () => {
  const msg = 'userId must be a positive integer';

  it('rejects a negative userId', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), userId: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  it('rejects a non-integer userId', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), userId: 3.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  it('rejects a non-numeric string userId', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), userId: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  it('accepts a numeric-string userId that converts cleanly', async () => {
    solana.generateDepositKeypair.mockReturnValue({
      publicKey: { toBase58: () => 'FAKEDEPOSITADDRESS111111111111111111111' },
    });
    solana.coinAmountForUsd.mockResolvedValue('1.000000');
    const res = await request(app).post('/deposit').send({ ...validBody(), userId: '42' });
    expect(res.status).toBe(200);
  });
});

describe('POST /deposit — dccRecipient validation', () => {
  const msg = 'dccRecipient is not a valid DecentralChain address';

  it('rejects a garbage string', async () => {
    const res = await request(app)
      .post('/deposit')
      .send({ ...validBody(), dccRecipient: 'not-an-address' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  it('rejects an address with a corrupted checksum', async () => {
    const corrupted = validRecipient.slice(0, -1) + (validRecipient.endsWith('1') ? '2' : '1');
    const res = await request(app)
      .post('/deposit')
      .send({ ...validBody(), dccRecipient: corrupted });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  it('rejects a validly-checksummed address built for the wrong chain id', async () => {
    // Same derivation, different network byte — the checksum is internally
    // consistent but the address belongs to a different chain, which
    // isValidAddress must still catch.
    const wrongChainAddr = address('routes-test-recipient-seed', 'T');
    const res = await request(app)
      .post('/deposit')
      .send({ ...validBody(), dccRecipient: wrongChainAddr });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });
});

describe('POST /deposit — coin validation', () => {
  it('rejects a coin not allowed on this endpoint', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), coin: 'USDT' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('coin must be one of: SOL');
  });

  it('rejects an unrecognized coin', async () => {
    const res = await request(app).post('/deposit').send({ ...validBody(), coin: 'DOGE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('coin must be one of: SOL');
  });
});

describe('POST /deposit/spl — coin restricted to USDT/USDC', () => {
  const splBody = () => ({
    coin: 'USDT',
    amountUsd: 50,
    dccRecipient: validRecipient,
    userId: 7,
  });

  it('rejects SOL on the SPL endpoint', async () => {
    const res = await request(app).post('/deposit/spl').send({ ...splBody(), coin: 'SOL' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('coin must be one of: USDT, USDC');
  });

  it('accepts USDC on the SPL endpoint', async () => {
    solana.generateDepositKeypair.mockReturnValue({
      publicKey: { toBase58: () => 'FAKESPLDEPOSITADDR111111111111111111111' },
    });
    solana.coinAmountForUsd.mockResolvedValue('50.00');
    const res = await request(app).post('/deposit/spl').send({ ...splBody(), coin: 'USDC' });
    expect(res.status).toBe(200);
    expect(res.body.coin).toBe('USDC');
  });
});

describe('POST /deposit — valid input', () => {
  it('creates an order, never trusting a client-supplied dccAmount, and persists it', async () => {
    solana.generateDepositKeypair.mockReturnValue({
      publicKey: { toBase58: () => 'FAKEDEPOSITADDRESS222222222222222222222' },
    });
    solana.coinAmountForUsd.mockResolvedValue('0.666667');

    const amountUsd = 100;
    // Client tries to smuggle its own payout amount — must be ignored.
    const res = await request(app)
      .post('/deposit')
      .send({ ...validBody(), amountUsd, dccAmount: '999999999' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.depositAddress).toBe('FAKEDEPOSITADDRESS222222222222222222222');
    expect(res.body.coin).toBe('SOL');
    expect(typeof res.body.id).toBe('string');

    const bridgeFeeUsd = amountUsd * (config.bridgeFeePct / 100);
    const netUsd = amountUsd - bridgeFeeUsd;
    const expectedDccAmount = String(Math.floor(netUsd / config.dccPriceUsd));
    expect(res.body.dccAmount).toBe(expectedDccAmount);
    expect(res.body.dccAmount).not.toBe('999999999');

    // Confirm it actually landed in the database, not just in the response.
    const stored = db.getOrder(res.body.id);
    expect(stored).not.toBeNull();
    expect(stored.status).toBe('pending');
    expect(stored.dccRecipient).toBe(validRecipient);
    expect(stored.userId).toBe(42);
    expect(stored.amountUsd).toBe(100);
  });
});

describe('Admin endpoints — auth', () => {
  it('rejects admin requests when no admin key is configured', async () => {
    // config.adminApiKey defaults to '' in this test env, so the endpoint
    // must never open up even if a caller sends a matching empty key.
    const res = await request(app).get('/admin/pending').set('x-api-key', '');
    expect(res.status).toBe(401);
  });

  it('rejects admin requests with a wrong key', async () => {
    const res = await request(app).get('/admin/orders').set('x-api-key', 'totally-wrong');
    expect(res.status).toBe(401);
  });
});
