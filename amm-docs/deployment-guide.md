# DCC AMM Swap — Deployment Guide

## 1. Prerequisites

- DecentralChain node access (mainnet or testnet)
- Node.js >= 18
- Deployer account with DCC balance for transaction fees
- Admin account (can be same as deployer, but multisig recommended for mainnet)

## 2. Deployment Steps

### Step 1: Generate AMM dApp Account
```bash
# Generate a new account (store seed securely!)
npx ts-node amm-ride/scripts/generate-account.ts
```

### Step 2: Fund the dApp Account
Transfer sufficient DCC to the dApp account for:
- SetScript transaction fee (0.01 DCC)
- LP token issuance fees (0.001 DCC per pool)
- Reissue fees (0.001 DCC per liquidity add)
- ScriptTransfer fees are paid by invokers

### Step 3: Compile RIDE Script
```bash
cd amm-ride
npm run compile
# Output: dist/amm.ride.compiled
```

### Step 4: Deploy Script
```bash
npx ts-node scripts/deploy.ts --network testnet --seed "<dApp seed>"
```

### Step 5: Set Admin
```bash
npx ts-node scripts/set-admin.ts --network testnet --seed "<dApp seed>" --admin <admin-address>
```

### Step 6: Verify Deployment
```bash
npx ts-node scripts/verify.ts --network testnet --dapp <dApp-address>
```

## 3. Frontend Deployment

```bash
cd amm-web
npm run build
# Deploy dist/ to CDN or static hosting
```

Configure environment:
```
VITE_NODE_URL=https://nodes.decentralchain.io
VITE_AMM_DAPP_ADDRESS=3P...
VITE_CHAIN_ID=D
VITE_EXPLORER_URL=https://explorer.decentralchain.io
```

## 4. Post-Deployment Checklist

- [ ] Verify dApp script hash matches compiled script
- [ ] Test createPool with small testnet amounts
- [ ] Test addLiquidity
- [ ] Test swapExactIn
- [ ] Test removeLiquidity
- [ ] Verify LP token issuance
- [ ] Verify reserve tracking accuracy
- [ ] Test emergency pause/unpause
- [ ] Monitor first mainnet pools carefully
- [ ] Set up indexer for analytics

## 5. Testnet vs Mainnet

| Setting | Testnet | Mainnet |
|---|---|---|
| Chain ID | T | D |
| Node URL | testnet.decentralchain.io | nodes.decentralchain.io |
| Fee BPS range | Any (for testing) | 10-100 |
| Admin | Deployer | Multisig |
| Monitoring | Manual | Automated |
