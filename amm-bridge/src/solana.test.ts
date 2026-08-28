/**
 * Tests for the Solana service: deterministic treasury key derivation
 * (the sweep destination for every completed order — if this weren't
 * deterministic, swept funds could land at a different address after every
 * restart), balance-lookup error handling, and sweepDeposit's SOL vs.
 * SPL-token branch selection.
 *
 * No real RPC calls are made — Connection and @solana/spl-token are mocked.
 */
import { Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import * as solana from './solana';

const mockGetBalance = jest.fn();
const mockGetTokenAccountsByOwner = jest.fn();

jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: mockGetBalance,
      getTokenAccountsByOwner: mockGetTokenAccountsByOwner,
    })),
    sendAndConfirmTransaction: jest.fn(),
  };
});

const mockGetAssociatedTokenAddress = jest.fn();
const mockCreateTransferInstruction = jest.fn();
const mockGetOrCreateAssociatedTokenAccount = jest.fn();

jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: mockGetAssociatedTokenAddress,
  createTransferInstruction: mockCreateTransferInstruction,
  getOrCreateAssociatedTokenAccount: mockGetOrCreateAssociatedTokenAccount,
}));

const mockSendAndConfirmTransaction = sendAndConfirmTransaction as jest.Mock;

let consoleLogSpy: jest.SpyInstance;
beforeAll(() => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => {
  consoleLogSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  solana.initSolana();
});

describe('getTreasuryKeypair', () => {
  it('is deterministic across repeated calls', () => {
    const a = solana.getTreasuryKeypair();
    const b = solana.getTreasuryKeypair();
    expect(a.publicKey.toBase58()).toBe(b.publicKey.toBase58());
    expect(Buffer.from(a.secretKey).equals(Buffer.from(b.secretKey))).toBe(true);
  });

  it('derives from sha256("dcc-bridge:treasury:<solanaAdminSeed>") — matches an independent computation', () => {
    const crypto = require('crypto');
    const { config } = require('./config');
    const expectedSeed = crypto
      .createHash('sha256')
      .update(`dcc-bridge:treasury:${config.solanaAdminSeed || 'default'}`)
      .digest();
    const expectedKeypair = Keypair.fromSeed(expectedSeed.subarray(0, 32));

    const actual = solana.getTreasuryKeypair();
    expect(actual.publicKey.toBase58()).toBe(expectedKeypair.publicKey.toBase58());
  });

  it('differs from a per-order deposit keypair', () => {
    const treasury = solana.getTreasuryKeypair();
    const deposit = solana.generateDepositKeypair('some-order-id');
    expect(treasury.publicKey.toBase58()).not.toBe(deposit.publicKey.toBase58());
  });
});

describe('generateDepositKeypair', () => {
  it('is deterministic per order id, and distinct across order ids', () => {
    const a1 = solana.generateDepositKeypair('order-a');
    const a2 = solana.generateDepositKeypair('order-a');
    const b = solana.generateDepositKeypair('order-b');
    expect(a1.publicKey.toBase58()).toBe(a2.publicKey.toBase58());
    expect(a1.publicKey.toBase58()).not.toBe(b.publicKey.toBase58());
  });
});

describe('getSolBalance — error handling', () => {
  it('returns the balance in SOL on success', async () => {
    mockGetBalance.mockResolvedValue(2_500_000_000); // 2.5 SOL in lamports
    const balance = await solana.getSolBalance('11111111111111111111111111111111');
    expect(balance).toBeCloseTo(2.5);
  });

  it('returns 0 (not a rejected promise) when the RPC call throws', async () => {
    mockGetBalance.mockRejectedValue(new Error('RPC unreachable'));
    await expect(solana.getSolBalance('11111111111111111111111111111111')).resolves.toBe(0);
  });

  it('returns 0 for a malformed address instead of throwing', async () => {
    await expect(solana.getSolBalance('not-a-valid-pubkey')).resolves.toBe(0);
    expect(mockGetBalance).not.toHaveBeenCalled();
  });
});

describe('getSplBalance — error handling', () => {
  const owner = '11111111111111111111111111111111';
  const mint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

  it('returns 0n when the owner has no token account for that mint', async () => {
    mockGetTokenAccountsByOwner.mockResolvedValue({ value: [] });
    await expect(solana.getSplBalance(owner, mint)).resolves.toBe(0n);
  });

  it('parses the raw u64 amount out of account data on success', async () => {
    const data = Buffer.alloc(72);
    data.writeBigUInt64LE(123456789n, 64);
    mockGetTokenAccountsByOwner.mockResolvedValue({
      value: [{ account: { data } }],
    });
    await expect(solana.getSplBalance(owner, mint)).resolves.toBe(123456789n);
  });

  it('returns 0n (not a rejected promise) when the RPC call throws', async () => {
    mockGetTokenAccountsByOwner.mockRejectedValue(new Error('RPC unreachable'));
    await expect(solana.getSplBalance(owner, mint)).resolves.toBe(0n);
  });
});

describe('sweepDeposit — branch selection', () => {
  it('takes the native-SOL path for coin === "SOL": transfers lamports via SystemProgram, never touches spl-token', async () => {
    mockGetBalance.mockResolvedValue(1_000_000);
    mockSendAndConfirmTransaction.mockResolvedValue('sol-sweep-sig');

    const sig = await solana.sweepDeposit('order-sol-1', 'SOL');

    expect(sig).toBe('sol-sweep-sig');
    expect(mockSendAndConfirmTransaction).toHaveBeenCalledTimes(1);
    expect(mockGetAssociatedTokenAddress).not.toHaveBeenCalled();
    expect(mockGetOrCreateAssociatedTokenAccount).not.toHaveBeenCalled();
  });

  it('returns null for SOL without sending a transaction when the balance is 0', async () => {
    mockGetBalance.mockResolvedValue(0);
    const sig = await solana.sweepDeposit('order-sol-empty', 'SOL');
    expect(sig).toBeNull();
    expect(mockSendAndConfirmTransaction).not.toHaveBeenCalled();
  });

  it('takes the SPL-token path for coin === "USDT": builds an ATA transfer, never calls SOL balance checks', async () => {
    // getSplBalance path: token account holding a nonzero amount.
    const data = Buffer.alloc(72);
    data.writeBigUInt64LE(5_000_000n, 64);
    mockGetTokenAccountsByOwner.mockResolvedValue({ value: [{ account: { data } }] });

    mockGetAssociatedTokenAddress.mockResolvedValue('source-ata');
    mockGetOrCreateAssociatedTokenAccount.mockResolvedValue({ address: 'treasury-ata' });
    mockCreateTransferInstruction.mockReturnValue({ mockInstruction: true });
    mockSendAndConfirmTransaction.mockResolvedValue('spl-sweep-sig');

    const sig = await solana.sweepDeposit('order-usdt-1', 'USDT');

    expect(sig).toBe('spl-sweep-sig');
    expect(mockGetAssociatedTokenAddress).toHaveBeenCalled();
    expect(mockGetOrCreateAssociatedTokenAccount).toHaveBeenCalled();
    expect(mockCreateTransferInstruction).toHaveBeenCalled();
    // The SOL branch's plain lamport balance check must not have run.
    expect(mockGetBalance).not.toHaveBeenCalled();
  });

  it('returns null for an SPL token with a zero balance, without building a transfer', async () => {
    mockGetTokenAccountsByOwner.mockResolvedValue({ value: [] });
    const sig = await solana.sweepDeposit('order-usdc-empty', 'USDC');
    expect(sig).toBeNull();
    expect(mockCreateTransferInstruction).not.toHaveBeenCalled();
    expect(mockSendAndConfirmTransaction).not.toHaveBeenCalled();
  });

  it('returns null for an unrecognized coin without touching SOL or SPL logic', async () => {
    const sig = await solana.sweepDeposit('order-unknown', 'DOGE');
    expect(sig).toBeNull();
    expect(mockGetBalance).not.toHaveBeenCalled();
    expect(mockGetTokenAccountsByOwner).not.toHaveBeenCalled();
    expect(mockSendAndConfirmTransaction).not.toHaveBeenCalled();
  });
});
