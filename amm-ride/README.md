# DCC AMM — RIDE Smart Contract v2.0

## Overview

Monolithic constant-product AMM dApp for DecentralChain. Manages **all pools**
in a single contract via keyed state entries. Inspired by
[PuzzleSwap](https://github.com/vlzhr/puzzleswap-contracts) with significant
improvements.

### What's new in v2.0

| Feature | v1 | v2 (PuzzleSwap-inspired) |
|---|---|---|
| Pool model | x·y = k | x·y = k (same math, better UX) |
| Pool ID | `assetA_assetB` | `p:<t0>:<t1>:<feeBps>` |
| Fee tiers | Single fee | Per-pool fee (1–1000 bps) |
| LP tracking | On-chain issued asset | State-based (`lp:<pid>:<addr>`) |
| First deposit | MIN_LIQUIDITY lock | Same, via `lp:<pid>:LOCKED` |
| Slippage | Swap only | All operations |
| Deadline | Swap only | All operations |
| Pause | Full stop | Swaps+add paused; withdraw always works |
| Read-only quote | None | `swapReadOnly` callable |
| Analytics | None | Volume, fees, swap count |
| Smart assets | Allowed | Blocked (v1 safety) |

## Architecture

```
ride/Pool.ride          ← Monolithic dApp (single source of truth)
contracts/state-schema.ride  ← State key documentation
scripts/deploy.ts       ← Compile + SetScript + initialize
scripts/smoke-test.ts   ← 15 on-chain + off-chain test vectors
```

## State Schema

Pool ID = `p:<token0>:<token1>:<feeBps>` (canonical order, fee-specific)

| Key | Type | Description |
|---|---|---|
| `pool:exists:<pid>` | Int | 1 if pool exists |
| `pool:t0:<pid>` | String | Canonical first token |
| `pool:t1:<pid>` | String | Canonical second token |
| `pool:fee:<pid>` | Int | Fee in basis points |
| `pool:r0:<pid>` | Int | Reserve of token0 |
| `pool:r1:<pid>` | Int | Reserve of token1 |
| `pool:lpSupply:<pid>` | Int | Total LP supply |
| `pool:lastK:<pid>` | Int | Last k = r0 × r1 |
| `lp:<pid>:<addr>` | Int | LP balance per address |

See [contracts/state-schema.ride](contracts/state-schema.ride) for full reference.

## Callable Functions

| Function | Payments | Parameters |
|---|---|---|
| `createPool` | none | `assetA`, `assetB`, `feeBps` |
| `addLiquidity` | tokenA + tokenB | `assetA`, `assetB`, `feeBps`, `amtADesired`, `amtBDesired`, `amtAMin`, `amtBMin`, `deadline` |
| `removeLiquidity` | none | `assetA`, `assetB`, `feeBps`, `lpAmount`, `amtAMin`, `amtBMin`, `deadline` |
| `swapExactIn` | input token | `assetIn`, `assetOut`, `feeBps`, `amountIn`, `minAmountOut`, `deadline` |
| `swapReadOnly` | none | `assetIn`, `assetOut`, `feeBps`, `amountIn` |
| `getPoolInfo` | none | `assetA`, `assetB`, `feeBps` |
| `pause` / `unpause` | none | none (admin only) |
| `initialize` | none | `adminAddr` (self-call only) |

## Invariants

1. **I1** — No duplicate assets in a pool
2. **I2** — Reserve updates are atomic
3. **I3** — k-invariant: after swap, `newR0 × newR1 ≥ oldR0 × oldR1`
4. **I4** — LP mint/burn proportionality (floor rounding, favors pool)
5. **I5** — First liquidity: `LP = floor(sqrt(a×b)) - MIN_LIQUIDITY`
6. **I6** — Slippage protection on all operations
7. **I7** — Deadline enforcement on all user operations
8. **I8** — Canonical token ordering
9. **I9** — Duplicate pool prevention
10. **I10** — Atomic action lists (no unsafe call chains)

## Deployment

```bash
# Dry run (compile only, no broadcast)
npm run deploy -- --network testnet --seed "your seed" --dry-run

# Full deploy
npm run deploy -- --network testnet --seed "your seed"

# Smoke test (after deploy)
npm run smoke-test -- --dapp <address> --node https://testnet.decentralchain.io
```

## PuzzleSwap Improvements

Patterns adopted from PuzzleSwap:
- `tryGetInteger` / `tryGetString` safe state readers
- `getAssetString` / `getAssetBytes` for native token handling
- `isShutdown()` / `isPaused()` emergency pattern
- `swapReadOnly` for off-chain quotes
- Fee deduction from input (fee stays in reserves)

Weaknesses fixed:
- **Deadline enforcement** on all operations (PuzzleSwap has none)
- **Slippage protection** on add/remove liquidity (PuzzleSwap: swap only)
- **MIN_LIQUIDITY lock** prevents first-depositor inflation attack
- **k-invariant post-check** on every swap
- **Canonical ordering** prevents duplicate pools
- **Monolithic design** — single dApp vs per-pool deployment
- **Smart asset blocking** — scripted assets rejected in v1
