# DCC AMM Swap — RIDE Constraints

## 1. Overview

RIDE is DecentralChain's smart contract language. It is NOT Turing-complete —
it is a deterministic, non-looping, expression-based language. This fundamentally
shapes our AMM design.

## 2. Key RIDE Constraints

### 2.1 No Programmatic Contract Deployment
- **Constraint:** You cannot deploy a new contract from within a contract.
- **Impact:** No factory pattern that auto-deploys pair contracts.
- **Adaptation:** Single monolithic dApp with multi-pool keyed state.

### 2.2 No Unbounded Loops
- **Constraint:** RIDE has `FOLD<N>` (bounded iteration) but no while/for loops.
- **Impact:** Cannot iterate over arbitrary-length data structures on-chain.
- **Adaptation:** Pool enumeration is done off-chain via indexed keys.
  On-chain logic only accesses specific, known pool keys.

### 2.3 Complexity & Computation Limits
- **Constraint:** Each callable invocation has a complexity budget (currently ~26000).
- **Impact:** Complex multi-step calculations must fit within budget.
- **Adaptation:** AMM math (fraction, sqrt) is simple enough. No multi-hop
  routing on-chain. Each operation targets exactly one pool.

### 2.4 Data Entry Limits
- **Constraint:** Max 100 data entries can be written per invocation.
- **Impact:** Pool creation writes ~10 entries — well within limits.
- **Adaptation:** Minimal storage design; only essential state is stored.

### 2.5 Payment Limits
- **Constraint:** InvokeScript supports up to 2 attached payments.
- **Impact:** Perfect for AMM — addLiquidity needs exactly 2 payments (tokenA + tokenB).
  Swap needs exactly 1 payment (input token). RemoveLiquidity needs exactly 1
  payment (LP token).
- **Adaptation:** Native fit, no workaround needed.

### 2.6 Script Transfer Limits
- **Constraint:** Max 10 ScriptTransfers per callable invocation.
- **Impact:** Swap sends 1 output. AddLiquidity sends LP tokens + potential refund (up to 3).
  RemoveLiquidity sends 2 tokens. All within limits.
- **Adaptation:** No issue for v1.

### 2.7 Integer Only
- **Constraint:** RIDE supports Int (64-bit signed Long) only. No floating point.
- **Impact:** All math must use integer arithmetic.
- **Adaptation:** Use basis points for fees, `fraction(a, b, c)` for safe
  division with 128-bit intermediate, floor rounding everywhere.

### 2.8 No Reentrant Calls (by Design)
- **Constraint:** RIDE callable functions execute atomically. No callbacks.
- **Impact:** No reentrancy attacks possible.
- **Adaptation:** This is a security benefit. No reentrancy guards needed.

### 2.9 Asset Issuance
- **Constraint:** Issue action creates a new token with a unique ID. Reissue adds supply.
  Burn destroys tokens. All are actions in callable results.
- **Impact:** LP token lifecycle fits naturally.
- **Adaptation:** Issue on createPool, Reissue on addLiquidity, Burn on removeLiquidity.

### 2.10 No External Calls
- **Constraint:** A callable function cannot call another dApp's callable function
  directly (prior to v5 Invoke). Even in v5+, nested invokes have limits.
- **Impact:** No composable router that chains through multiple pools on-chain.
- **Adaptation:** Multi-hop swaps in v1 are done off-chain (SDK builds multiple
  sequential InvokeScript txs or defers to v2 if on-chain chaining is available).

### 2.11 State Reads
- **Constraint:** `getInteger`, `getString`, `getBinary`, `getBoolean` read dApp state.
  Cross-dApp state reads are possible via `getIntegerValue(address, key)`.
- **Impact:** Pool state is always readable. No external indexer required for
  basic state queries.
- **Adaptation:** SDK reads state directly from the node's `/addresses/data` endpoint.

## 3. RIDE Built-In Functions Used

| Function | Usage | Notes |
|---|---|---|
| `fraction(a, b, c)` | `a * b / c` with 128-bit intermediate | Core swap math |
| `pow(base, bp, exp, ep, rp, rounding)` | Power function | Not used in v1 |
| `toBase58String()` / `fromBase58String()` | Asset ID conversion | Pool key building |
| `sha256()` / `keccak256()` | Hashing | Not needed in v1 (string concat suffices) |
| `assetInfo()` | Get asset metadata | Validate non-scripted assets |
| `isDataStorageUntouched()` | Check for existing data | Not available; use explicit existence flags |
| `height` | Current blockchain height | Deadline validation |
| `this` | Self-address reference | State reads/writes |
| `i.caller` | Transaction sender | Access control, LP delivery |
| `i.payments` | Attached payments | Token input |

## 4. RIDE Callable Function Skeleton

```ride
@Callable(i)
func createPool(assetBStr: String, feeBps: Int) = {
  # assetA comes from i.payments[0], assetB from i.payments[1]
  # assetBStr is the string ID for canonical ordering
  # Returns: [IntegerEntry x N, StringEntry x N, Issue, ScriptTransfer]
}

@Callable(i)
func addLiquidity(poolKey: String, minLpOut: Int, deadline: Int) = {
  # payments[0] = tokenA amount, payments[1] = tokenB amount
  # Returns: [IntegerEntry (reserves, supply), Reissue, ScriptTransfer, optional refund]
}

@Callable(i)
func removeLiquidity(poolKey: String, minAOut: Int, minBOut: Int, deadline: Int) = {
  # payments[0] = LP token amount
  # Returns: [IntegerEntry (reserves, supply), Burn, ScriptTransfer x 2]
}

@Callable(i)
func swapExactIn(poolKey: String, minAmountOut: Int, deadline: Int) = {
  # payments[0] = input token amount
  # Returns: [IntegerEntry (reserves), ScriptTransfer]
}

@Callable(i)
func emergencyPause() = {
  # Admin only
  # Returns: [BooleanEntry("global_paused", true)]
}

@Callable(i)
func emergencyUnpause() = {
  # Admin only
  # Returns: [BooleanEntry("global_paused", false)]
}
```

## 5. Complexity Budget Estimation

| Operation | Estimated Complexity | Budget (~26000) |
|---|---|---|
| createPool | ~4000-6000 | ✅ Well within |
| addLiquidity | ~3000-5000 | ✅ Well within |
| removeLiquidity | ~2000-4000 | ✅ Well within |
| swapExactIn | ~2000-4000 | ✅ Well within |
| emergencyPause | ~500 | ✅ Trivial |

## 6. DecentralChain-Specific Adaptations

| Ethereum/Uniswap Concept | DecentralChain Adaptation |
|---|---|
| Factory.createPair() | Single dApp, createPool() callable |
| Separate pair contracts | Keyed state in one dApp |
| ERC-20 LP token | Native DecentralChain issued asset |
| approve + transferFrom | Direct payment attachment |
| msg.sender | i.caller |
| block.timestamp | height (block height) |
| require() | strict let + throw() |
| reentrancy guard | Not needed (atomic execution) |
| delegatecall | Not applicable |
| CREATE2 deterministic deploy | Not applicable; key-based pool discovery |

## 7. Known Limitations

1. **No multi-hop on-chain routing** — Single pool per swap in v1.
2. **No flash swaps** — No callback mechanism in RIDE.
3. **No governance on-chain** — Admin is a simple address (should be multisig).
4. **State growth** — 1000+ pools may slow node queries; mitigated by indexer.
5. **No events** — RIDE has no event emission. Swap data must be read from
   transaction data (invoke args + state changes) via the indexer.
