# ⚡ DCC Swap Bot

A Trojan-style Telegram trading bot for the DecentralChain AMM DEX.

## Features

- **🔄 Instant Swaps** — Buy/sell tokens directly from Telegram
- **👛 Wallet Management** — Create, import, export, switch wallets
- **🏊 Pool Explorer** — Browse active liquidity pools
- **📜 Trade History** — View all past trades
- **⚙️ Configurable** — Slippage, fee tiers, auto-confirm
- **🔐 Secure** — AES-256-GCM encrypted seed storage

## Quick Start

1. **Get a bot token** from [@BotFather](https://t.me/BotFather) on Telegram

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your BOT_TOKEN
   ```

3. **Install & build:**
   ```bash
   cd /path/to/dcc-amm-swap
   npm install
   cd amm-bot
   npx tsc
   ```

4. **Run:**
   ```bash
   BOT_TOKEN=your_token_here node dist/index.js
   ```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Open main menu |
| `/help` | Show help |

## Architecture

```
src/
├── index.ts           # Entry point — bot init & handler registration
├── config.ts          # Environment variables & defaults
├── db.ts              # SQLite database with encrypted wallet storage
├── handlers/
│   ├── home.ts        # /start, main menu, refresh
│   ├── wallet.ts      # Create, import, export, switch, delete
│   ├── swap.ts        # Token select → amount → preview → confirm
│   ├── pools.ts       # Browse pools, detail view
│   ├── settings.ts    # Slippage, fee tier, auto-confirm
│   └── history.ts     # Trade history
├── services/
│   ├── wallet.ts      # Key derivation, balance queries
│   └── trading.ts     # SDK integration, swap execution
└── ui/
    ├── format.ts      # HTML message formatters
    └── keyboards.ts   # Inline keyboard builders
```

## Security

- Seed phrases are encrypted with AES-256-GCM
- Per-user encryption keys derived via PBKDF2 (100k iterations)
- Seed messages auto-deleted from chat
- Set a strong `ENCRYPTION_SECRET` in production
