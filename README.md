# DCC AMM Swap

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

A production-grade **constant-product Automated Market Maker (AMM)** for [DecentralChain](https://decentralchain.io) — a Waves-derived Layer 1 blockchain. Inspired by Uniswap V2 and [PuzzleSwap](https://github.com/vlzhr/puzzleswap-contracts), purpose-built for RIDE smart contracts.

---

## Overview

DCC AMM Swap enables trustless token swaps, liquidity provision, and price discovery on DecentralChain. The protocol uses the classic **x·y = k** invariant with embedded fees that accrue directly to liquidity providers.

### Key Features

- **Constant-product AMM** — proven x·y = k model with deterministic on-chain math
- **Integer-only arithmetic** — no floating point anywhere; all division floors in favor of the pool
- **Single monolithic dApp** — multi-pool keyed state (RIDE cannot deploy contracts programmatically)
- **Per-pool fee tiers** — 1–1000 bps (0.01%–10%), same pair with different fees = different pools
- **State-tracked LP** — LP balances stored in dApp state (non-transferable in v2)
- **Minimum liquidity lock** — 1 000 LP tokens permanently locked to prevent share inflation attacks
- **Deadline + slippage** — enforced on all operations (create, add, remove, swap)
- **Read-only quotes** — `swapReadOnly` callable for off-chain pricing
- **Analytics counters** — volume, fees, swap count tracked on-chain
- **Emergency controls** — pause halts swaps + adds; withdrawals always work (escape hatch)
- **Comprehensive test suite** — 101 unit tests covering math, pool keys, swaps, and transaction building

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   amm-web   │────▶│   amm-sdk   │────▶│  amm-core    │
│  React SPA  │     │  TS Client  │     │  Pure Math   │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌──────────────┐
                    │   Node RPC  │────▶│  amm-ride    │
                    │             │     │ RIDE Contract │
                    └─────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ amm-indexer  │
                    │  HTTP API    │
                    └──────────────┘
```

---

## Packages

| Package | Description |
|---------|-------------|
| [`amm-core`](amm-core/) | Pure BigInt math library — constant-product formulas, LP calculations, pool key derivation |
| [`amm-ride`](amm-ride/) | RIDE v6 smart contract — the on-chain dApp with all callable functions |
| [`amm-sdk`](amm-sdk/) | TypeScript SDK — node client, quote engine, transaction builder |
| [`amm-indexer`](amm-indexer/) | Lightweight indexer — polls chain state, serves pool data via REST API |
| [`amm-web`](amm-web/) | React 18 + Vite frontend — swap, liquidity, and pool explorer interfaces |
| [`amm-docs`](amm-docs/) | Architecture docs, threat model, security checklist, deployment guide |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Install

```bash
git clone https://github.com/dylanpersonguy/dcc-amm-swap.git
cd dcc-amm-swap
npm install
```

### Test

```bash
# Run all tests
npm test

# Run core math tests only
npx jest --config amm-core/jest.config.js --rootDir amm-core

# Run SDK tests only
npx jest --config amm-sdk/jest.config.js --rootDir amm-sdk
```

### Development

```bash
# Start the frontend dev server
cd amm-web && npx vite

# Start the indexer
cd amm-indexer && npx ts-node src/index.ts
```

---

## Protocol Design

### AMM Formula

```
amountInWithFee = amountIn × (10 000 − feeBps)
amountOut = ⌊amountInWithFee × reserveOut / (reserveIn × 10 000 + amountInWithFee)⌋
```

### Fee Model

| Parameter | Value |
|-----------|-------|
| Default fee | 30 bps (0.30%) |
| Fee range | 1–1000 bps (0.01%–10%) |
| Fee recipient | 100% to LPs (retained in reserves) |
| Fee tiers | Same pair + different fee = different pool |

### LP Model (v2)

| Aspect | Detail |
|--------|--------|
| Storage | State entries: `lp:<poolId>:<address>` |
| First deposit | LP = √(a×b) − 1000 locked |
| Subsequent | LP = min(amt0·supply/r0, amt1·supply/r1) |
| Withdrawal | Always allowed (even when paused) |
| Transferable | No (v2); planned for v3 |

---

## Security

The protocol is designed with a security-first philosophy:

- **No floating point** — deterministic integer math everywhere
- **Floor rounding** — always favors the pool, never the trader
- **Smart asset rejection** — blocks fee-on-transfer and rebasing tokens
- **Deadline enforcement** — prevents stale transaction execution
- **k-invariant check** — verified on every swap (post-condition assertion)
- **Atomic state updates** — RIDE action lists execute all-or-nothing

See [`amm-docs/threat-model.md`](amm-docs/threat-model.md) for the full threat analysis (20 attack vectors) and [`amm-docs/security-checklist.md`](amm-docs/security-checklist.md) for the pre-deployment audit checklist.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](amm-docs/architecture.md) | System design, component responsibilities, upgrade strategy |
| [Pool Math](amm-docs/pool-math.md) | Complete formulas with test vectors |
| [State Model](amm-docs/state-model.md) | On-chain data schema and state transitions |
| [Threat Model](amm-docs/threat-model.md) | 20 attack vectors with mitigations |
| [RIDE Constraints](amm-docs/ride-constraints.md) | Platform limitations and adaptation patterns |
| [Deployment Guide](amm-docs/deployment-guide.md) | Step-by-step mainnet deployment |
| [Test Plan](amm-docs/test-plan.md) | Comprehensive test strategy |
| [Security Checklist](amm-docs/security-checklist.md) | Pre-deployment audit checklist |
| [Invariant Verification](amm-docs/invariant-verification.md) | Formal invariants and property-based testing |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
4. Push and open a Pull Request

---

## License

[MIT](LICENSE)
