# Security Audit Checklist

Pre-deployment security review for DCC AMM Swap protocol.

## 1. Smart Contract (RIDE) Invariants

### Critical — Must Pass Before Mainnet

- [ ] **k-invariant**: After every swap, `newReserveA * newReserveB >= oldReserveA * oldReserveB`  
- [ ] **Reserve consistency**: On-chain state reserves match actual dApp asset balances  
- [ ] **LP supply = issued - burned**: `keyLpSupply(pk)` equals the circulating supply of the LP asset on-chain  
- [ ] **MINIMUM_LIQUIDITY lock**: First pool creation permanently locks 1000 LP units; can never be withdrawn  
- [ ] **No duplicate pools**: `createPool` rejects if `pool_<PK>_exists == true`  
- [ ] **Canonical ordering**: `canonicalOrder(a, b) == canonicalOrder(b, a)` for all inputs  
- [ ] **DCC always first**: DCC (native) always sorts to the "A" position  
- [ ] **Pool key ↔ assets bijectivity**: `keyAssetA(pk)` and `keyAssetB(pk)` match the pool key's embedded pair  

### Fee Invariants

- [ ] Fee range enforced: `MIN_FEE_BPS <= feeBps <= MAX_FEE_BPS` (10–100 bps)  
- [ ] Fee deducted from input before AMM formula  
- [ ] Fee retained in reserves (no fee extraction to external addresses)  
- [ ] `feeAmount = floor(amountIn * feeBps / 10000)` — floor rounding  

### Liquidity Invariants

- [ ] `addLiquidity` uses `min(lpFromA, lpFromB)` — proportional deposit  
- [ ] Excess tokens refunded to caller via ScriptTransfer  
- [ ] `removeLiquidity` returns `floor(lpBurn * reserve / totalSupply)` — floor rounding  
- [ ] LP burn reduces both reserves and LP supply atomically  

### Access Control

- [ ] `emergencyPause` / `emergencyUnpause` restricted to admin  
- [ ] `setAdmin` restricted to current admin  
- [ ] `emergencyWithdraw` restricted to admin + pool must be paused  
- [ ] No callable function can be invoked when `global_paused == true` (except admin functions)  
- [ ] Admin cannot modify pool math or fee formulas  

## 2. Smart Contract Attack Surface

### Payment Validation

- [ ] `createPool` requires exactly 2 payments  
- [ ] `addLiquidity` requires exactly 2 payments matching pool assets  
- [ ] `removeLiquidity` requires exactly 1 LP token payment  
- [ ] `swapExactIn` requires exactly 1 payment  
- [ ] All payment amounts validated > 0  
- [ ] Payment assets validated against pool's stored assetA/assetB  

### Integer Overflow Protection

- [ ] No multiplication exceeds 128-bit intermediate (RIDE `fraction()` used for all a*b/c)  
- [ ] `isqrt` handles max RIDE integer (2^63 - 1)  
- [ ] Reserve cap (`MAX_DEPOSIT`) prevents overflow in k-product computation  
- [ ] LP supply growth bounded by deposits  

### Reentrancy

- [ ] RIDE execution model prevents reentrancy (single-threaded, atomic)  
- [ ] No dApp-to-dApp invocations in any callable  

### Smart Asset Rejection

- [ ] `requireNotScripted` verifies both assets have no attached scripts  
- [ ] Prevents fee-on-transfer and rebasing token attacks  

### Deadline Protection

- [ ] `requireDeadline` checks `lastBlock.timestamp < deadline`  
- [ ] Prevents stale transaction execution  

## 3. Off-Chain Code Review

### SDK

- [ ] `TxBuilder` produces transactions matching RIDE callable signatures exactly  
- [ ] `QuoteEngine` uses same math as amm-core (single source of truth)  
- [ ] `NodeClient` validates node responses (no blind trust of API data)  
- [ ] Amount conversion (raw ↔ display) uses integer arithmetic only  
- [ ] Slippage is applied correctly: `minOut = floor(amountOut * (10000 - slippageBps) / 10000)`  

### Frontend

- [ ] Wallet connection uses official Signer + provider (no custom key management)  
- [ ] Transaction details displayed before signing (amount, asset, minimum received)  
- [ ] Price impact warning for trades > 1%  
- [ ] Deadline auto-set (not hardcoded to far future)  
- [ ] No private keys or seeds stored in browser  

### Indexer

- [ ] Read-only — cannot submit transactions  
- [ ] No admin credentials  
- [ ] Rate limiting on API endpoints  
- [ ] CORS configured for production domain only  

## 4. Deployment Security

- [ ] dApp account has no seed export after deployment  
- [ ] Verifier restricts account to known transaction types only  
- [ ] Admin address verified before first pool creation  
- [ ] Test pool created and verified on testnet first  
- [ ] Emergency pause tested end-to-end  
- [ ] All test vectors from `test-plan.md` verified against deployed contract  

## 5. Monitoring Checklist (Post-Deploy)

- [ ] Reserve balance monitoring (dApp balance vs. state values)  
- [ ] k-value tracking (should only increase, never decrease)  
- [ ] LP supply tracking (Issue/Reissue/Burn balance)  
- [ ] Large trade alerts (> 5% of reserves)  
- [ ] Admin action alerts  
- [ ] Block explorer bookmarks for dApp address  

## Sign-Off

| Role              | Name | Date | Notes |
| ----------------- | ---- | ---- | ----- |
| Contract Author   |      |      |       |
| Code Reviewer     |      |      |       |
| Security Auditor  |      |      |       |
| Deployment Lead   |      |      |       |
