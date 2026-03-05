# DCC AMM Swap — State Model

## 1. Overview

All pool state is stored as data entries on the single AMM dApp account.
Keys are namespaced by a deterministic pool key to prevent collision.

## 2. Pool Key Derivation

```
poolKey = canonicalSort(assetA, assetB)

canonicalSort(a, b):
  // DCC native token is represented as "DCC"
  idA = if a == null then "DCC" else toBase58(a)
  idB = if b == null then "DCC" else toBase58(b)
  if idA < idB then return idA + "_" + idB
  else return idB + "_" + idA
```

This ensures:
- poolKey("TokenX", "TokenY") == poolKey("TokenY", "TokenX")
- DCC always sorts first (lexicographically "DCC" < any base58 asset ID)
- No two distinct pairs can produce the same key

## 3. Data Entry Schema

All keys are prefixed with `pool_<poolKey>_` for namespacing.

### Pool Metadata
| Key | Type | Description |
|---|---|---|
| `pool_<PK>_assetA` | String | Asset ID of token A (canonical first) |
| `pool_<PK>_assetB` | String | Asset ID of token B (canonical second) |
| `pool_<PK>_lpAsset` | String | Asset ID of the LP token for this pool |
| `pool_<PK>_feeBps` | Integer | Fee in basis points (e.g., 30 = 0.3%) |
| `pool_<PK>_status` | String | "active" or "paused" |

### Pool Reserves
| Key | Type | Description |
|---|---|---|
| `pool_<PK>_reserveA` | Integer | Reserve of token A (raw units) |
| `pool_<PK>_reserveB` | Integer | Reserve of token B (raw units) |
| `pool_<PK>_lpSupply` | Integer | Total LP token supply (tracked redundantly for safety) |

### Global State
| Key | Type | Description |
|---|---|---|
| `global_paused` | Boolean | Emergency pause flag |
| `global_admin` | String | Admin address (can only pause/unpause) |
| `global_poolCount` | Integer | Total number of pools created |
| `pool_<PK>_exists` | Boolean | Pool existence flag (for O(1) duplicate check) |

### Pool Index (for enumeration)
| Key | Type | Description |
|---|---|---|
| `poolIndex_<N>` | String | Pool key at index N (0-based) |

## 4. State Transition Rules

### createPool
```
PRE:  pool_<PK>_exists == false (or key doesn't exist)
POST: pool_<PK>_exists = true
      pool_<PK>_assetA = canonicalA
      pool_<PK>_assetB = canonicalB
      pool_<PK>_reserveA = amountA
      pool_<PK>_reserveB = amountB
      pool_<PK>_lpAsset = <newly issued asset ID>
      pool_<PK>_lpSupply = lpMinted + MINIMUM_LIQUIDITY
      pool_<PK>_feeBps = feeBps
      pool_<PK>_status = "active"
      global_poolCount += 1
      poolIndex_<N> = PK
ACTIONS: Issue LP token, Transfer LP tokens to caller (minus MINIMUM_LIQUIDITY)
```

### addLiquidity
```
PRE:  pool_<PK>_exists == true
      pool_<PK>_status == "active"
      reserveA > 0 AND reserveB > 0
POST: pool_<PK>_reserveA += actualAmountA
      pool_<PK>_reserveB += actualAmountB
      pool_<PK>_lpSupply += lpMinted
ACTIONS: Transfer LP tokens to caller, Refund excess tokens if any
```

### removeLiquidity
```
PRE:  pool_<PK>_exists == true
      lpAmount > 0
      lpAmount <= caller's LP balance (enforced by payment)
POST: pool_<PK>_reserveA -= amountAOut
      pool_<PK>_reserveB -= amountBOut
      pool_<PK>_lpSupply -= lpAmount
ACTIONS: Burn LP tokens (send to dApp, tracked via supply decrement),
         Transfer amountAOut of tokenA to caller,
         Transfer amountBOut of tokenB to caller
```

### swapExactIn
```
PRE:  pool_<PK>_exists == true
      pool_<PK>_status == "active"
      amountIn > 0
      deadline >= height
POST: pool_<PK>_reserveIn += amountIn
      pool_<PK>_reserveOut -= amountOut
      // Invariant: newReserveIn * newReserveOut >= oldReserveIn * oldReserveOut
ACTIONS: Transfer amountOut of output token to caller
REVERT IF: amountOut < minAmountOut
```

## 5. LP Token Lifecycle

```
Issue (on createPool):
  name: "DCC-AMM-LP-<poolKey_short>"
  decimals: 8
  quantity: lpMinted + MINIMUM_LIQUIDITY
  reissuable: true  // needed for addLiquidity minting

Reissue (on addLiquidity):
  quantity: lpMinted (additional)

Burn (on removeLiquidity):
  LP tokens received as payment are burned via Burn action
```

## 6. Atomic State Updates

RIDE callable functions return a list of state changes + actions that
execute atomically:

```
[
  IntegerEntry("pool_<PK>_reserveA", newReserveA),
  IntegerEntry("pool_<PK>_reserveB", newReserveB),
  IntegerEntry("pool_<PK>_lpSupply", newLpSupply),
  Reissue(lpAssetId, lpMinted, true),
  ScriptTransfer(caller, lpMinted, lpAssetId)
]
```

If ANY validation fails, the ENTIRE invoke reverts. No partial state updates.

## 7. State Size Considerations

Per pool: ~10 data entries × ~100 bytes avg = ~1 KB per pool
1000 pools ≈ 1 MB of state — well within DecentralChain limits.
Pool index enables enumeration without scanning all keys.
