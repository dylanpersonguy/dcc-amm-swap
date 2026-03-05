# DCC AMM Swap — Threat Model

## 1. Threat Actors

| Actor | Capability | Goal |
|---|---|---|
| Malicious Trader | Submits crafted InvokeScript txs | Extract value via swap manipulation |
| Sandwich Attacker | Observes mempool, submits front/back-run txs | MEV extraction |
| Griefing Attacker | Creates dust transactions | DoS or state pollution |
| Malicious LP | Provides/removes liquidity strategically | Manipulate reserves or extract disproportionate value |
| Malicious Token Issuer | Creates tokens with deceptive metadata | Trick users into swapping bad tokens |
| Compromised Admin Key | Has admin key access | Drain funds or manipulate state |
| Smart Asset Attacker | Deploys scripted asset with transfer restrictions | Break pool invariant or lock funds |

## 2. Attack Vectors & Mitigations

### 2.1 Reserve Desynchronization
**Attack:** Manipulate reserves so on-chain state doesn't match actual balances.
**Mitigation:** Reserves are updated ONLY within callable functions, atomically.
The dApp never reads its own balance — it tracks reserves via data entries.
Payments attached to invocations are the ONLY way tokens enter; ScriptTransfer
is the ONLY way tokens leave. No `sync()` needed because reserves ARE the
source of truth (not balances).

### 2.2 Duplicate Pool Creation
**Attack:** Create multiple pools for the same pair to fragment liquidity.
**Mitigation:** Pool key is derived from canonically sorted asset IDs.
`createPool` checks for existence of the pool key before proceeding.
Canonical ordering: `min(assetA, assetB) + "_" + max(assetA, assetB)`,
where DCC (native token) is represented as "DCC" and always sorts first.

### 2.3 Decimal Normalization Bugs
**Attack:** Exploit decimal mismatch between tokens to get favorable swap rates.
**Mitigation:** The AMM operates on raw integer amounts (smallest unit).
NO decimal normalization happens on-chain. The SDK normalizes for display only.
All pool math uses raw amounts. Users attach raw amounts in payments.

### 2.4 Rounding Exploits
**Attack:** Exploit rounding in swap/mint/burn to extract 1-wei profits repeatedly.
**Mitigation:**
- Swap output rounds DOWN (user gets less, pool gets more).
- LP mint rounds DOWN (user gets fewer shares).
- LP burn withdrawal rounds DOWN (user gets less of each token).
- All rounding favors the pool, never the caller.
- MINIMUM_LIQUIDITY lock prevents first-depositor manipulation.

### 2.5 LP Share Inflation / First-Liquidity Manipulation
**Attack:** First LP deposits tiny amount, then donates tokens to inflate share price.
**Mitigation:**
- MINIMUM_LIQUIDITY = 1000 units permanently locked (burned to zero address concept).
- First LP minted = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY.
- If sqrt result <= MINIMUM_LIQUIDITY, the pool creation fails.
- This makes the attack economically infeasible.

### 2.6 Dust Griefing
**Attack:** Create pools with dust amounts to pollute state.
**Mitigation:**
- Minimum initial liquidity enforced (both amounts must exceed threshold).
- Pool creation requires meaningful token deposits.
- State key cost is bounded by RIDE data entry limits.

### 2.7 Stale Quote / Slippage Bypass
**Attack:** Use a stale quote to execute a swap at outdated prices.
**Mitigation:**
- `minAmountOut` parameter enforced on every swap.
- `deadline` parameter enforced on every swap (block height based).
- Front-end computes quote + slippage tolerance right before signing.
- On-chain validation: if output < minAmountOut, the transaction fails.

### 2.8 Deadline Bypass
**Attack:** Submit a swap without a deadline, allowing indefinite reordering.
**Mitigation:** `deadline` is a mandatory parameter. If `deadline < height`, the
invoke fails. No default deadline — caller MUST specify.

### 2.9 Sandwich / Front-Running
**Attack:** Observe pending swap in mempool, front-run to move price, then back-run.
**Mitigation:**
- DecentralChain block time (~4-5s) limits but doesn't eliminate this.
- `minAmountOut` with tight slippage protects against large price moves.
- v1 documentation advises users to set slippage tolerance appropriately.
- Deep liquidity pools naturally resist sandwich attacks.
- **Not fully solvable at protocol level** — acknowledged limitation.

### 2.10 Donation / Direct Transfer Attack
**Attack:** Send tokens directly to the dApp account (not via invoke) to desync reserves.
**Mitigation:** The dApp NEVER reads its actual asset balance.
Reserves are tracked ONLY via data entries updated during callable functions.
Donated tokens are effectively lost — they don't affect swap math.
No `skim()` or `sync()` function is provided (unnecessary and dangerous).

### 2.11 Smart Asset / Scripted Asset Attacks
**Attack:** Create a token with a script that blocks transfers from the AMM dApp,
potentially locking LP funds.
**Mitigation:**
- v1 blocks scripted assets entirely.
- `createPool` validates that neither asset has a script attached.
- This is checked via asset info from the blockchain.
- v2 may support whitelisted smart assets after audit.

### 2.12 Integer Overflow
**Attack:** Supply extreme amounts to cause overflow in multiplication.
**Mitigation:**
- RIDE uses Long (64-bit signed integers), max ≈ 9.2 × 10^18.
- Reserve * reserve can overflow if both reserves exceed ~3 × 10^9 (with 8 decimals).
- All multiplications that could overflow use checked math patterns.
- `fraction(a, b, c)` built-in is used for `a * b / c` to avoid intermediate overflow.
- Maximum reserve limits are enforced if needed.

### 2.13 Admin Key Compromise
**Attack:** Admin account key is compromised, attacker manipulates state.
**Mitigation:**
- Admin can ONLY pause/unpause the protocol.
- Admin CANNOT withdraw funds, change reserves, or mint LP tokens.
- No admin backdoor functions.
- Pause only prevents new operations; existing positions are safe.
- Admin key should be a multisig or DAO in production.

### 2.14 Inconsistent Token Ordering
**Attack:** Call swap with tokens in wrong order to confuse routing.
**Mitigation:** Pool key is always derived from canonical ordering.
Swap function accepts any ordering and internally resolves to canonical form.
Direction is determined by which token is attached as payment.

### 2.15 Partial State Update
**Attack:** Exploit a scenario where reserves update but LP tokens don't, or vice versa.
**Mitigation:** RIDE callable functions return a list of actions that are applied
atomically. Either ALL state changes happen or NONE. This is guaranteed by the
DecentralChain transaction model. There is no partial execution.

### 2.16 Replay / Duplicate Transaction
**Attack:** Replay a successful swap transaction.
**Mitigation:** DecentralChain transactions have unique IDs and nonces.
The chain rejects duplicate transaction IDs. Additionally, deadlines ensure
old transactions can't execute at stale prices.

### 2.17 Router Misuse
**Attack:** A malicious router contract intermediary skims tokens.
**Mitigation:** v1 has no router — users interact directly with the AMM dApp.
Multi-hop routing (v2) will be carefully designed with deadline and minOutput
propagation through each hop.

### 2.18 Broken Pool Discovery
**Attack:** Frontend shows wrong pool or wrong reserves.
**Mitigation:**
- Pool key derivation is deterministic and implemented identically in SDK and RIDE.
- SDK reads state directly from the node, not from any intermediary.
- Frontend validates pool existence before showing swap UI.

### 2.19 Off-Chain / On-Chain Quote Mismatch
**Attack:** SDK computes a different output than the contract, leading to unexpected results.
**Mitigation:**
- amm-core contains the SINGLE source of truth for math formulas.
- SDK and RIDE implement the same formulas.
- Test vectors verify SDK output matches RIDE output for all cases.
- SDK quote always uses `minAmountOut = quote * (1 - slippage)` as safety net.

### 2.20 Fee-on-Transfer Token Compatibility
**Decision:** NOT SUPPORTED in v1.
Fee-on-transfer tokens would cause reserve desync because the dApp would
record more reserves than actually received. These tokens are explicitly
unsupported and should be warned against in the UI.

## 3. Security Invariants (Must Always Hold)

1. `reserveA * reserveB >= k_previous` (k only grows from fees)
2. `totalLPSupply > 0` implies `reserveA > 0 AND reserveB > 0`
3. `totalLPSupply == 0` implies `reserveA == 0 AND reserveB == 0`
4. LP tokens can only be minted by `createPool` or `addLiquidity`
5. LP tokens can only be burned by `removeLiquidity`
6. No funds can leave the dApp except via `ScriptTransfer` in callable results
7. Pool key for (A, B) == pool key for (B, A) (canonical ordering)
8. No pool key collision between different asset pairs
9. Emergency pause blocks all state-changing operations
10. All calculations round in favor of the pool (against the caller)

## 4. Risk Rating Summary

| Risk | Severity | Likelihood | Mitigation Quality |
|---|---|---|---|
| Reserve desync | Critical | Low | Strong (atomic state) |
| Integer overflow | Critical | Medium | Strong (fraction(), limits) |
| First-LP manipulation | High | Medium | Strong (MINIMUM_LIQUIDITY) |
| Sandwich attacks | Medium | High | Partial (slippage only) |
| Smart asset lockup | High | Low | Strong (blocked in v1) |
| Admin compromise | High | Low | Strong (minimal powers) |
| Stale quote execution | Medium | Medium | Strong (deadline + minOut) |
| Dust griefing | Low | Medium | Moderate (minimums) |
| Rounding exploits | Medium | Medium | Strong (round-down-only) |
