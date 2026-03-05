# DCC AMM Swap — Architecture

## 1. Overview

DCC AMM Swap is a constant-product (x·y=k) automated market maker protocol
built natively on DecentralChain. It enables permissionless token swaps,
liquidity provision, and LP token issuance without reliance on an orderbook
matcher.

## 2. High-Level Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  amm-web    │────▶│  amm-sdk     │────▶│  DecentralChain │
│  (React UI) │     │  (TypeScript)│     │  Node API       │
└─────────────┘     └──────┬───────┘     └────────┬────────┘
                           │                      │
                           │  invokeScript        │
                           ▼                      ▼
                    ┌──────────────┐     ┌─────────────────┐
                    │  Signer +    │     │  AMM dApp       │
                    │  Cubensis    │     │  (RIDE contract) │
                    └──────────────┘     └─────────────────┘
                                                  │
                                          ┌───────┴────────┐
                                          │  amm-indexer   │
                                          │  (reader layer)│
                                          └────────────────┘
```

## 3. Architecture Decision: Monolithic dApp

### Why NOT factory + per-pair contracts?

DecentralChain/RIDE constraints:
1. **No programmatic contract deployment.** RIDE dApps are bound to accounts.
   There is no CREATE2 or factory-deploy pattern. Deploying a new contract
   requires a new account + SetScript transaction signed by that account.
2. **Account-bound state.** Each dApp stores state in its own account's data
   entries. A factory would need to create accounts and fund them, requiring
   off-chain coordination.
3. **Cost and complexity.** Managing hundreds of separate dApp accounts for
   pools adds operational complexity with no security benefit.

### Chosen design: Single AMM dApp, multi-pool via keyed state

- One RIDE dApp account holds ALL pool state.
- Pools are namespaced by a deterministic **pool key** derived from the
  canonical ordering of the two asset IDs.
- LP tokens are real on-chain issued assets (one Issue per pool creation).
- All swap/liquidity operations are `InvokeScript` calls to this single dApp.

### Benefits
- Simpler deployment and upgrade model
- Single address to monitor and audit
- Deterministic pool discovery (pool key = sorted asset pair)
- LP tokens are first-class DecentralChain assets (transferable, tradeable)

### Tradeoffs
- Single dApp state size grows with number of pools (acceptable for v1)
- All pools share one script's complexity budget (RIDE limits)
- No isolation between pools (mitigated by careful key namespacing)

## 4. Component Responsibilities

### amm-ride (Smart Contract Layer)
- Pool creation with LP token issuance
- Reserve management (deposits, withdrawals)
- Swap execution with fee deduction
- LP mint/burn accounting
- Validation of all inputs
- Emergency pause capability

### amm-sdk (Client Library)
- Pool state reading from node API
- Quote computation (off-chain math matching on-chain)
- Transaction building (invokeScript params)
- Slippage/deadline helpers
- Amount normalization by decimals

### amm-web (Frontend)
- Wallet connection (Signer + Cubensis Connect)
- Swap interface with price impact display
- Liquidity management UI
- Pool explorer
- Transaction status tracking

### amm-indexer (Data Layer)
- Polls node state for pool snapshots
- Aggregates swap history from blockchain
- Computes TVL, volume, fee metrics
- Serves data to frontend

### amm-core (Shared Logic)
- Pure math functions (used by SDK, tests, and as reference for RIDE)
- Fee calculations
- Pool key derivation
- Test vectors
- Protocol constants

## 5. Transaction Flow

All state-changing operations use DecentralChain `InvokeScript` transactions:

| Operation | Callable Function | Payments Attached | Returns |
|---|---|---|---|
| Create Pool | `createPool` | tokenA + tokenB amounts | LP tokens via transfer |
| Add Liquidity | `addLiquidity` | tokenA + tokenB amounts | LP tokens via transfer |
| Remove Liquidity | `removeLiquidity` | LP tokens | tokenA + tokenB via transfer |
| Swap | `swapExactIn` | input token amount | output token via transfer |

## 6. Invariant

The core invariant is:

```
reserveA * reserveB >= k
```

Where k can only increase (from fees) or stay constant (from balanced
liquidity add/remove). k NEVER decreases.

## 7. Fee Model (v1)

- Trade fee: 30 basis points (0.3%) by default, configurable per pool at
  creation time (10-100 bps range).
- Fee is deducted from the INPUT amount before computing the swap output.
- 100% of fees accrue to LP holders via reserve growth.
- No protocol fee in v1.
- `amountInWithFee = amountIn * (10000 - feeBps) / 10000`

## 8. LP Token Model

- Each pool has a unique LP token issued as a DecentralChain asset.
- LP token is issued by the AMM dApp account upon pool creation.
- LP token supply tracks total liquidity ownership.
- On first deposit: `lpMinted = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY`
- Subsequent deposits: `lpMinted = min(amountA * totalLP / reserveA, amountB * totalLP / reserveB)`
- MINIMUM_LIQUIDITY (1000 units) is permanently locked on first deposit to prevent share price manipulation.

## 9. Security Boundaries

See threat-model.md for full analysis. Key boundaries:
- All math is integer-only (no floating point)
- All reserves are read-then-written atomically within one invoke
- Pool keys are deterministic and canonical (prevents duplicates)
- LP tokens cannot be minted outside the dApp
- Admin powers are limited to emergency pause
- Smart/scripted assets are blocked in v1

## 10. Upgrade Strategy

v1 is designed to be immutable after deployment. If a critical bug is found:
1. Emergency pause halts all operations
2. Users can still withdraw liquidity via a special `emergencyWithdraw` that
   returns pro-rata reserves
3. A new dApp is deployed at a new address
4. Frontend switches to new address
5. Users migrate liquidity manually

No proxy pattern, no upgradeable scripts — simplicity over convenience.
