# DCC AMM Swap — Test Plan

## 1. Unit Tests (amm-core)

### 1.1 Pool Math
- [x] `getAmountOut` — basic swap output calculation
- [x] `getAmountOut` — zero input throws
- [x] `getAmountOut` — zero reserve throws
- [x] `getAmountOut` — large amounts (near overflow boundary)
- [x] `getAmountOut` — fee deduction correctness
- [x] `getAmountOut` — output always < reserveOut
- [x] `getAmountOut` — fee = 0 bps
- [x] `getAmountOut` — fee = 100 bps (1%)

### 1.2 LP Math
- [x] `getInitialLp` — sqrt calculation correctness
- [x] `getInitialLp` — MINIMUM_LIQUIDITY deduction
- [x] `getInitialLp` — fails if result <= MINIMUM_LIQUIDITY
- [x] `getLpMinted` — proportional minting
- [x] `getLpMinted` — uses minimum of two sides
- [x] `getWithdrawAmounts` — proportional withdrawal
- [x] `getWithdrawAmounts` — full withdrawal returns all reserves

### 1.3 Pool Key
- [x] `getPoolKey` — canonical ordering (a,b) == (b,a)
- [x] `getPoolKey` — DCC always sorts first
- [x] `getPoolKey` — deterministic across calls

### 1.4 Fee Math
- [x] Fee applied to input before swap
- [x] Fee cannot exceed 10000 bps
- [x] Fee accumulates in reserves (k grows)

### 1.5 Integer Math
- [x] `isqrt` — perfect squares
- [x] `isqrt` — non-perfect squares (floor)
- [x] `isqrt` — zero
- [x] `isqrt` — one
- [x] `isqrt` — large values (10^18)

### 1.6 Rounding
- [x] All outputs round down (floor)
- [x] LP minting rounds down
- [x] Withdrawal rounds down
- [x] Swap output rounds down

### 1.7 Invariant Preservation
- [x] k never decreases after swap
- [x] k preserved (up to rounding) after balanced add/remove

## 2. Integration Tests (amm-sdk + node)

### 2.1 Pool Lifecycle
- [ ] Create pool → verify state entries
- [ ] Add liquidity → verify reserve/LP updates
- [ ] Swap → verify reserve update and output
- [ ] Remove liquidity → verify reserve/LP updates
- [ ] Full lifecycle: create → add → swap → remove

### 2.2 Edge Cases
- [ ] Create duplicate pool → should fail
- [ ] Add liquidity to non-existent pool → should fail
- [ ] Swap on paused pool → should fail
- [ ] Swap with expired deadline → should fail
- [ ] Swap with minAmountOut too high → should fail
- [ ] Remove more LP than owned → should fail
- [ ] Swap output would be zero → should fail
- [ ] Create pool with scripted asset → should fail

### 2.3 Quote Accuracy
- [ ] SDK quote matches on-chain execution within 1 unit
- [ ] Price impact calculation accuracy
- [ ] Slippage calculation accuracy

## 3. Security Tests

### 3.1 Economic Attacks
- [ ] First-depositor manipulation (should be prevented by MINIMUM_LIQUIDITY)
- [ ] Rounding exploitation (many small swaps should not drain pool)
- [ ] Reserve manipulation via direct transfers (should not affect swaps)

### 3.2 Access Control
- [ ] Only admin can pause/unpause
- [ ] No admin can withdraw funds
- [ ] No function allows arbitrary state writes

### 3.3 Input Validation
- [ ] Negative amounts rejected
- [ ] Zero amounts rejected
- [ ] Invalid pool key rejected
- [ ] Wrong token in payment rejected
- [ ] Missing payment rejected

## 4. Property-Based / Fuzz Tests

- [ ] For any valid swap, k either stays the same or grows
- [ ] For any valid add/remove cycle, the LP holder does not gain value (minus fees)
- [ ] getAmountOut(x) < reserveOut for all valid x
- [ ] Pool key is commutative: key(a,b) == key(b,a)
- [ ] LP total supply always matches mints minus burns
