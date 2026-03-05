# Invariant Verification

Formal invariants that must hold at all times for the DCC AMM protocol.

## Notation

| Symbol        | Meaning                              |
| ------------- | ------------------------------------ |
| `rA`, `rB`    | On-chain reserves of token A, B      |
| `k`           | Product invariant `rA * rB`          |
| `S`           | Total LP token supply                |
| `Δin`         | Amount deposited / swapped in        |
| `Δout`        | Amount withdrawn / swapped out       |
| `f`           | Fee in basis points                  |
| `bal(X)`      | dApp's actual balance of asset X     |

---

## INV-1: Constant-Product Non-Decrease

After every swap:

$$k_{new} = rA_{new} \times rB_{new} \geq rA_{old} \times rB_{old} = k_{old}$$

The product **strictly increases** because the fee portion of the input is added to reserves without a corresponding output reduction. Only integer floor rounding can cause `k_new == k_old` for tiny swaps (no decrease is ever acceptable).

**Verification**: Compare `newReserveIn * newReserveOut` against `reserveIn * reserveOut` after every swap call.

---

## INV-2: Reserve Solvency

At all times:

$$bal(A) \geq rA$$
$$bal(B) \geq rB$$

The dApp's actual on-chain balance of each asset must be **at least** the recorded reserves. Excess (from direct donations) is harmless; deficit means the contract is insolvent.

**Verification**: Periodically query `/assets/balance/{dApp}/{assetId}` and compare to state reserves.

---

## INV-3: LP Supply Conservation

$$S_{onchain} = \sum Issue - \sum Burn$$

The on-chain circulating supply of the LP asset must equal the `keyLpSupply(pk)` state entry.

**Verification**: Query the LP asset details and compare `quantity` to the state integer.

---

## INV-4: MINIMUM_LIQUIDITY Lock

After `createPool`:

$$S = \sqrt{rA_0 \times rB_0}$$
$$minted_{user} = S - 1000$$

The first 1000 LP tokens are never transferred and remain in the dApp. This prevents the first-depositor LP share inflation attack.

**Verification**: After pool creation, confirm `ScriptTransfer.amount == lpSupply - 1000`.

---

## INV-5: Proportional Liquidity

For `addLiquidity`:

$$lpMinted = \min\left(\frac{\Delta A \times S}{rA}, \frac{\Delta B \times S}{rB}\right)$$

For `removeLiquidity`:

$$\Delta A_{out} = \lfloor \frac{lpBurn \times rA}{S} \rfloor$$
$$\Delta B_{out} = \lfloor \frac{lpBurn \times rB}{S} \rfloor$$

No user can extract more value than their proportional LP share.

**Verification**: Unit tests with exact test vectors; property-based tests with random inputs.

---

## INV-6: No Duplicate Pools

For any pair `(assetA, assetB)`:

$$\exists! \text{ poolKey } pk = canonical(assetA, assetB)$$

The canonical ordering ensures commutativity, and `createPool` checks `pool_{pk}_exists != true`.

**Verification**:
- `canonicalSort(a, b) == canonicalSort(b, a)` for all `a != b`
- `createPool` with existing pair throws "Pool already exists"

---

## INV-7: Rounding Direction

All integer divisions round **down** (floor), which always favors the pool:

| Operation        | Rounding | Effect                      |
| ---------------- | -------- | --------------------------- |
| Swap output      | Floor    | User gets slightly less     |
| LP from add      | Floor    | User gets fewer LP tokens   |
| Removal amounts  | Floor    | User gets slightly less back |
| Fee calculation   | Floor    | Slightly less fee recorded  |

No user can extract more than mathematically entitled due to rounding.

---

## INV-8: Atomic State Updates

Every RIDE callable returns an action list that is committed atomically. There is no intermediate state where:
- Reserves are updated but LP supply is not
- Tokens are transferred but reserves aren't adjusted
- LP is issued but reserves don't reflect the deposit

**Verification**: This is guaranteed by the RIDE execution model (all-or-nothing action lists).

---

## INV-9: Fee Accumulation

Fees accumulate **in the reserves** over time. If no liquidity is added/removed, then after N swaps:

$$k_N > k_{N-1} > \ldots > k_0$$

LP providers earn fees proportionally to their LP share when they remove liquidity.

**Verification**: Monitor k-value over time; assert strict monotonic increase across swaps.

---

## INV-10: Admin Privilege Boundary

The admin can:
- Pause/unpause the protocol
- Emergency-withdraw from paused pools
- Transfer admin role

The admin **cannot**:
- Modify pool math or fee formulas
- Create pools on behalf of users
- Extract tokens from active (unpaused) pools
- Modify reserves or LP supply directly

**Verification**: Review RIDE contract — no admin-callable function writes to reserve/lpSupply keys except through the standard flows.

---

## Property-Based Test Strategies

### Strategy 1: Random Swap Sequences

Generate random sequences of (amountIn, direction) and verify:
- k never decreases
- amountOut < reserveOut for every swap
- reserves + amountOut == previous reserves for output side

### Strategy 2: Add/Remove Round-Trip

For random (amountA, amountB):
1. Add liquidity → get lpMinted
2. Remove all lpMinted → get (outA, outB)
3. Assert: `outA <= amountA` and `outB <= amountB` (no profit from round-trip)

### Strategy 3: Swap Round-Trip

For random amountIn:
1. Swap A→B → get amountOut
2. Swap amountOut B→A → get amountBack
3. Assert: `amountBack < amountIn` (fee loss prevents profit)

### Strategy 4: Ordering Invariance

For random (assetA, assetB):
- `getPoolKey(a, b) == getPoolKey(b, a)` always
- `getSwapDirection` is consistent with pool key assets
