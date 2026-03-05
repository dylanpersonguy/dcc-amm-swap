# DCC AMM — RIDE Smart Contract

## Overview

This is the main AMM dApp script for DecentralChain. It implements:
- Pool creation with LP token issuance
- Liquidity addition with proportional LP minting
- Liquidity removal with proportional token withdrawal
- Exact-input swaps with fee deduction
- Emergency pause/unpause

## State Schema

See `amm-docs/state-model.md` for the complete data entry schema.

## Callable Functions

| Function | Payments | Parameters |
|---|---|---|
| `createPool` | tokenA + tokenB | `assetBStr`, `feeBps` |
| `addLiquidity` | tokenA + tokenB | `poolKey`, `minLpOut`, `deadline` |
| `removeLiquidity` | LP token | `poolKey`, `minAOut`, `minBOut`, `deadline` |
| `swapExactIn` | input token | `poolKey`, `minAmountOut`, `deadline` |
| `emergencyPause` | none | none |
| `emergencyUnpause` | none | none |

## Deployment

```bash
npm run compile
npm run deploy -- --network testnet --seed "your seed phrase"
```
