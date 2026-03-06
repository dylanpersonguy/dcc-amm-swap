# DCC AMM Swap — State Model v2.0

## 1. Overview

All pool state is stored as data entries on the single AMM dApp account.
Keys are namespaced by a deterministic **pool ID** that includes the fee tier.

**v2 changes**: Pool ID now includes fee basis points. LP is state-tracked
(no on-chain LP asset). Analytics counters added.

## 2. Pool ID Derivation

```
poolId = "p:" + canonicalSort(assetA, assetB) + ":" + feeBps

canonicalSort(a, b):
  idA = if a == null then "DCC" else toBase58(a)
  idB = if b == null then "DCC" else toBase58(b)
  if idA == "DCC" then return (idA, idB)
  if idB == "DCC" then return (idB, idA)
  if idA < idB then return (idA, idB)
  else return (idB, idA)

Example: poolId = "p:DCC:3PAbcd123:30"
```

This ensures:
- `poolId("X", "Y", 30) == poolId("Y", "X", 30)`
- DCC always sorts first
- Same pair + different fee = different pool (fee tiers)
- No duplicate pools possible

## 3. Data Entry Schema

### Global State
| Key | Type | Description |
|---|---|---|
| `v` | Integer | Schema version (2) |
| `admin` | String | Admin address (pause/unpause only) |
| `paused` | Boolean | Emergency pause flag |
| `minLiquidity` | Integer | MIN_LIQUIDITY constant (1000) |
| `feeBpsDefault` | Integer | Default fee in basis points (30) |
| `poolCount` | Integer | Total number of pools created |

### Pool State (`<pid>` = pool ID)
| Key | Type | Description |
|---|---|---|
| `pool:exists:<pid>` | Integer | 1 if pool exists |
| `pool:t0:<pid>` | String | Canonical first token ID |
| `pool:t1:<pid>` | String | Canonical second token ID |
| `pool:fee:<pid>` | Integer | Fee in basis points (1–1000) |
| `pool:r0:<pid>` | Integer | Reserve of token0 (raw units) |
| `pool:r1:<pid>` | Integer | Reserve of token1 (raw units) |
| `pool:lpSupply:<pid>` | Integer | Total LP supply |
| `pool:lastK:<pid>` | Integer | Last k = r0 × r1 |
| `pool:createdAt:<pid>` | Integer | Block timestamp at creation |

### LP Balance State
| Key | Type | Description |
|---|---|---|
| `lp:<pid>:<address>` | Integer | LP balance of address in pool |
| `lp:<pid>:LOCKED` | Integer | Permanently locked LP (MIN_LIQUIDITY) |

### Analytics State
| Key | Type | Description |
|---|---|---|
| `pool:volume0:<pid>` | Integer | Cumulative volume of token0 |
| `pool:volume1:<pid>` | Integer | Cumulative volume of token1 |
| `pool:fees0:<pid>` | Integer | Cumulative fees in token0 |
| `pool:fees1:<pid>` | Integer | Cumulative fees in token1 |
| `pool:swaps:<pid>` | Integer | Total swap count |
| `pool:liquidityEvents:<pid>` | Integer | Total add/remove events |

## 4. State Transition Rules

### createPool(assetA, assetB, feeBps)
```
PRE:  pool:exists:<pid> != 1
      feeBps in [1, 1000]
      assetA != assetB
POST: pool:exists:<pid>     = 1
      pool:t0:<pid>         = token0
      pool:t1:<pid>         = token1
      pool:fee:<pid>        = feeBps
      pool:r0:<pid>         = 0
      pool:r1:<pid>         = 0
      pool:lpSupply:<pid>   = 0
      pool:lastK:<pid>      = 0
      pool:createdAt:<pid>  = lastBlock.timestamp
      poolCount            += 1
PAYMENTS: None
```

### addLiquidity (first deposit)
```
PRE:  pool:exists:<pid> == 1
      pool:r0:<pid> == 0 AND pool:r1:<pid> == 0
      sqrt(amt0 * amt1) > MIN_LIQUIDITY
POST: pool:r0:<pid>     = amt0
      pool:r1:<pid>     = amt1
      pool:lpSupply:<pid> = sqrt(amt0 * amt1)
      pool:lastK:<pid>  = amt0 * amt1
      lp:<pid>:LOCKED   = MIN_LIQUIDITY
      lp:<pid>:<caller>  = sqrt(amt0 * amt1) - MIN_LIQUIDITY
PAYMENTS: token0 + token1 attached
```

### addLiquidity (subsequent)
```
PRE:  pool:exists:<pid> == 1
      pool:r0:<pid> > 0
POST: pool:r0:<pid>     += used0
      pool:r1:<pid>     += used1
      pool:lpSupply:<pid> += lpMinted
      lp:<pid>:<caller>  += lpMinted
      pool:lastK:<pid>  = newR0 * newR1
      lpMinted = min(used0 * supply / r0, used1 * supply / r1)
REFUND: excess of one token returned to caller
```

### removeLiquidity
```
PRE:  lp:<pid>:<caller> >= lpAmount
POST: pool:r0:<pid>     -= floor(lpAmount * r0 / supply)
      pool:r1:<pid>     -= floor(lpAmount * r1 / supply)
      pool:lpSupply:<pid> -= lpAmount
      lp:<pid>:<caller>  -= lpAmount
ACTIONS: ScriptTransfer token0, ScriptTransfer token1
NOTE: Always works even when paused (escape hatch)
```

### swapExactIn
```
PRE:  pool:exists:<pid> == 1, NOT paused
      amountOut >= minAmountOut
      newK >= oldK
POST: pool:r_in:<pid>  += amountIn
      pool:r_out:<pid> -= amountOut
      pool:lastK:<pid> = newR0 * newR1
      Analytics counters updated
ACTIONS: ScriptTransfer output token to caller
```

## 5. LP Token Model (v2)

LP tokens are **state-tracked**, NOT on-chain issued assets.
- LP balances stored as `lp:<pid>:<address>` integer entries
- Non-transferable in v1 (simplifies security model)
- MINIMUM_LIQUIDITY (1000) locked as `lp:<pid>:LOCKED` on first deposit
- All floor rounding favors the pool (against the user)

## 6. State Size Estimate

Per pool: ~20 data entries × ~100 bytes avg = ~2 KB per pool
1000 pools ≈ 2 MB of state — well within DecentralChain limits.
