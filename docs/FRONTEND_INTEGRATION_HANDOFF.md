# DCC AMM — Frontend Integration Handoff

This is a handoff for connecting a frontend to the DCC AMM swap. It covers how
the swap actually works, how to talk to the smart contracts directly (the
recommended path), and how to optionally pull stats/history from the indexer
API. Written for an AI or developer who hasn't seen this codebase before.

**Status: already done for `DecentralChain/apps/exchange`.** `@dcc-amm/sdk`
is ported and live at `DecentralChain/packages/sdk/amm` — a real workspace
package (`workspace:*`), already added as a dependency of `apps/exchange`,
typechecked/built/tested against that repo's own strict toolchain (166/166
tests passing), and verified end-to-end with a real live-mainnet quote
resolving correctly through it. See that package's own README for exactly
what changed in the port (ESM conversion, stricter TS config adaptations,
Jest→Vitest). §3 below still applies as the API reference — just import from
`@dcc-amm/sdk` directly inside `apps/exchange`, no separate install step
needed. Nothing has been committed in that repo yet — it's sitting as
uncommitted changes for review.

## 1. What this is

A constant-product AMM (Uniswap-v2-style, `x * y = k`) on DecentralChain
(a Waves-protocol chain — RIDE smart contracts, not EVM). Two contracts:

- **PoolCore** — holds all state: reserves, LP supply, fee tier, pause flag,
  admin config. Owns `createPool`, `addLiquidity`, `removeLiquidity`,
  `lockLiquidity`, `claimLpTokens`, and the admin functions.
- **SwapRouter** — stateless. Computes swap math and calls into Core's
  internal `applySwap`. Users call `swapExactIn` on the Router, not on Core.

**Live mainnet addresses:**

| | Address |
|---|---|
| PoolCore | `3DcZHm89byJjfdkHTJ9m89pyeMk8vChDGtD` |
| SwapRouter | `3Dc9mKvihe2ujkk7co5oA2HnUJ9W1CGQsYg` |
| Node URL | `https://mainnet-node.decentralchain.io` |
| Chain ID | `?` (string, not a typo — see gotchas) |
| DCC decimals | 8 |

Both contracts' source is in this repo at `amm-ride/ride/PoolCore.ride` and
`amm-ride/ride/SwapRouter.ride` if you need to check exact behavior instead of
trusting this doc.

## 2. How a pool/swap actually works

- A pool is identified by `p:<t0>:<t1>:<feeBps>` — e.g.
  `p:DCC:J66Yxxphpx469mzvFSbMQUc3A3EijdSLcRtJEAoAUKjK:35` (DCC/Test at 0.35%
  fee). `t0`/`t1` are the two asset IDs in **canonical order** (DCC always
  sorts first if present; otherwise the two asset IDs are ordered
  lexicographically) — you never construct this string by hand, a helper does
  it (see §3).
- `feeBps` is basis points (35 = 0.35%). Multiple pools can exist for the same
  pair at different fee tiers.
- The swap fee stays entirely in the pool, benefiting LPs proportionally —
  there is currently no protocol-level fee skim (`config:protocolFeePct`/
  `config:treasury` exist in state but nothing reads them yet — don't build
  UI around them existing functionally).
- LP positions are real, transferable on-chain tokens (not just an internal
  ledger entry) — issued on a pool's first deposit, reissued on subsequent
  deposits, burned on withdrawal.
- DCC itself is the chain's native token and is represented as the **literal
  string `"DCC"`**, not a real base58 asset ID — see gotchas, this trips
  people up constantly.

## 3. Recommended integration: `amm-sdk` directly against the contracts

Don't hand-roll quote math or manual `invokeScript` calls — `@dcc-amm/sdk` in
this repo already wraps it, and the swap math went through a security audit
this session (overflow-safety, payment validation, reserve caps). Use it
as-is. It talks directly to the node + contracts — **no indexer required for
any of this.**

```ts
import { AmmSdk, toRawAmount, fromRawAmount } from '@dcc-amm/sdk';

const sdk = new AmmSdk({
  nodeUrl: 'https://mainnet-node.decentralchain.io',
  dAppAddress: '3DcZHm89byJjfdkHTJ9m89pyeMk8vChDGtD',   // PoolCore
  routerAddress: '3Dc9mKvihe2ujkk7co5oA2HnUJ9W1CGQsYg',  // SwapRouter
  chainId: '?',
});
```

### Reading pool state

```ts
const pool = await sdk.getPoolByPair('DCC', tokenAssetId, 35); // feeBps
// or: await sdk.getPool('p:DCC:<assetId>:35')
// pool.reserve0 / reserve1 are raw bigints (already decimals-adjusted per-unit,
// NOT divided by 10^decimals — use fromRawAmount() to display them)

const allPools = await sdk.listPools();
```

### Getting a quote (no wallet needed)

```ts
// amountIn must be a raw bigint — use toRawAmount, NEVER Math.round(x * 10**decimals)
const amountIn = toRawAmount('5.5', 8); // '5.5' DCC -> raw bigint, decimals=8 for DCC

const quote = await sdk.quoteSwap(
  amountIn,
  null,           // inputAssetId: null or 'DCC' both mean native DCC
  tokenAssetId,   // outputAssetId: real asset ID, or null/'DCC' for the other direction
  35,             // feeBps
  50n             // slippageBps (50 = 0.5%)
);
// quote.amountOut, quote.minAmountOut, quote.priceImpactBps, quote.feeAmount
```

### Building, signing, and broadcasting a swap

```ts
import { invokeScript, broadcast, waitForTx } from '@decentralchain/transactions';

const { tx, quote } = await sdk.buildSwap(amountIn, null, tokenAssetId, 35, 50n);

// tx is UNSIGNED — { dApp, call: {function, args}, payment, fee, chainId }
// Sign with whatever wallet/seed mechanism your frontend uses:
const signedTx = invokeScript(
  { dApp: tx.dApp, call: tx.call, payment: tx.payment, fee: tx.fee, chainId: '?'.charCodeAt(0) },
  userSeed // or however your signer works
);

await broadcast(signedTx, 'https://mainnet-node.decentralchain.io');
await waitForTx(signedTx.id, { apiBase: 'https://mainnet-node.decentralchain.io', timeout: 60000 });
```

`sdk.buildAddLiquidity(assetA, assetB, amountA, amountB, feeBps, slippageBps)`
and `sdk.buildRemoveLiquidity(...)` follow the same `{tx, quote}` shape —
check `amm-sdk/src/amm-sdk.ts` for exact signatures, it's short and readable.

### Wallet / signing — how the existing frontend does it (and the tradeoff)

The current `amm-web` frontend uses a **raw seed-phrase paste-in** model, not
a browser wallet extension: the user pastes their 15-word seed into a connect
modal, it's held in React state, and `invokeScript(...)` signs client-side
with it directly (see `amm-web/src/context/WalletContext.tsx`). This works
and is simple, but it means the seed lives in browser memory for the session
— worth knowing if you're deciding whether to copy this pattern or build
something more robust (e.g. a proper wallet extension integration, if one
exists for this chain). Not a decision to make silently either way — flag it
back if you're unsure which the user wants.

### Reading a user's balance

```ts
const dccBalance = await sdk.getBalance(userAddress, null);       // native DCC
const tokenBalance = await sdk.getBalance(userAddress, assetId);  // any asset
const lpBalance = await sdk.getLpBalance(poolId, userAddress);    // internal ledger — see gotcha below
```

## 4. Indexer API — for stats/history you can't get from the contract alone

Yes — pull this from the indexer's HTTP API. The chain itself doesn't expose
"all swaps for this pool" or "24h volume" as a queryable thing; the indexer
watches the chain and builds that up. Nothing here requires a wallet or
signing, it's all read-only.

**Base URL:** `https://amm-indexer-production.up.railway.app`
**Rate limit:** 120 requests/min per client IP.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Service health + last indexed block height |
| `GET /protocol/status` | Live on-chain: paused, height, pool count |
| `GET /pools` | List all indexed pools with reserves/price/TVL |
| `GET /pools/:key` | One pool's detail (same shape as list entries) |
| `GET /pools/:key/stats` | volume24h/7d, fees24h/7d, tvl, txCount24h, apy |
| `GET /pools/:key/price` | Just priceAtoB/priceBtoA |
| `GET /swaps?pool=&limit=` | Recent swaps, optionally filtered by pool |
| `GET /swaps/:address?limit=` | Recent swaps by a given trader |
| `GET /quote/swap?...` | Same quote math as the SDK, as a GET — convenient if you don't want to embed the SDK for reads |
| `GET /quote/add-liquidity?...` / `/quote/remove-liquidity?...` | Same idea |
| `POST /tx/swap` / `/tx/add-liquidity` / `/tx/remove-liquidity` / `/tx/create-pool` | Returns an **unsigned** tx + quote — still needs client-side signing, same as `sdk.buildSwap` |
| `GET /token/:assetId` | Asset name/decimals/description |
| `GET /user/:address/positions` | LP positions across all pools |
| `GET /user/:address/balance/:assetId` | Token balance |
| `GET /docs` | Live Swagger UI for the exact request/response shapes |

**⚠️ Gotcha, fixed as of this handoff but know about it:** a pool key looks
like `p:DCC:J66Yxxphpx469mzvFSbMQUc3A3EijdSLcRtJEAoAUKjK:35` — it contains
colons. When building the URL, use `encodeURIComponent(poolKey)` as normal;
the indexer decodes it correctly now. (This was broken in production until
recently — a raw, un-decoded path lookup 404'd on every properly-encoded
request. Fixed and redeployed. Just flagging it so if you see a stray 404 on
`/pools/:key` from a cached client build, it's not your code.)

## 5. Gotchas worth knowing before you write any of this

- **DCC is the string `"DCC"` or `null`, never a real asset ID.** Both the
  SDK and indexer accept either interchangeably for "native DCC" — but don't
  assume you can always pass `null` everywhere; check the specific function.
- **Amount parsing: always use `toRawAmount(str, decimals)` from `@dcc-amm/sdk`,
  never `BigInt(Math.round(amount * 10 ** decimals))`.** The latter has a real
  floating-point precision bug — this was found and fixed in the bot this
  session (`Math.round(0.1 * 1e8)` doesn't always give exactly `10000000n`).
  `toRawAmount` does string-based decimal splitting instead, no float math.
- **If your UI ever lets a user "sell tokens worth ~X DCC"** (rather than "sell
  N tokens directly"), you must convert via the live reserve ratio —
  `tokenAmountRaw = (dccAmountRaw * tokenReserve) / dccReserve` — not just pass
  the DCC-denominated number through as if it were already in the token's raw
  units. This exact bug shipped in the Telegram bot's "Trojan-style" sell flow
  and executed wildly wrong trade sizes until it was caught and fixed. See
  `amm-bot/src/handlers/token-detect.ts`'s `computeSellAmountRaw` for the
  reference implementation and its test file for the exact failure mode.
- **`getLpBalance`/internal LP ledger vs. real LP token balance**: legacy pools
  (pre-LP-token-issuance) track LP share in an internal contract ledger; newer
  pools issue a real on-chain LP token. `sdk.getLpBalance()` reads the
  internal ledger — for a pool with a real issued LP token, prefer reading the
  actual token balance via `sdk.getBalance(address, pool.lpAssetId)` when
  `lpAssetId` is present. Get this wrong and a user's LP position displays as
  zero even though they hold real, spendable LP tokens.
- **`waitForTx` resolving does NOT mean the invoke succeeded.** It only
  confirms the transaction was mined. A callable function's own `must(...)`
  check can still fail at script-execution time — the tx is mined (fee
  charged), state unchanged, and it's reported via a separate
  `applicationStatus` field (`"succeeded"` vs. anything else), not by
  `waitForTx` throwing. Check `applicationStatus` explicitly after
  `waitForTx` resolves if you need to know whether the call actually did
  anything.
- **Reserve cap**: pools reject deposits/swaps that would push either reserve
  past `100000000000000n` raw units — a real (if generous) ceiling, not
  infinite.
- **Known, deliberately-unpatched risk**: JIT-liquidity fee sniping (front-run
  a large swap with a big deposit, capture fee share, withdraw immediately
  after) is not currently mitigated on-chain. Low real-world risk at small
  scale/shallow pools, but don't build anything that assumes it's handled.
- **Admin functions exist** (`pause`, `unpause`, `setAdmin`, `setTreasury`,
  `setProtocolFee`, `setRouter`) but none of them are relevant to a swap
  frontend — they're operator-only, gated to the contract's stored admin
  address. `sdk.isPaused()` is the one read a frontend should actually check
  and surface to users (disable trading UI if true).

## 6. Where to look for more

- `amm-sdk/src/amm-sdk.ts` — the whole public API surface, short and documented.
- `amm-sdk/src/types.ts` — exact request/response shapes.
- `amm-core/src/pool-key.ts` — pool ID construction (`getPoolId`, `canonicalSort`).
- `amm-web/src/` — the existing reference frontend, if you want to see a full
  working implementation (wallet connect, swap panel, liquidity panel, pool
  explorer) rather than build from this doc alone.
- `amm-indexer/src/server.ts` — indexer route definitions, if the endpoint
  table above isn't enough detail. Also just hit `/docs` on the live indexer
  for interactive Swagger.
