<p align="center">
  <h1 align="center">Cinder</h1>
  <p align="center"><strong>The AI Newsroom That Trades Its Own Stories</strong></p>
  <p align="center">
    An autonomous financial wire service that publishes AI-written market intelligence<br/>
    from SoSoValue data, detects narrative regime shifts, and auto-executes trades on SoDEX.
  </p>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#api-integration">API Integration</a> •
  <a href="#demo">Demo</a> •
  <a href="#license">License</a>
</p>

---

## The Problem

Crypto traders face three compounding problems:

1. **Information overload** — Thousands of data points (ETF flows, sector performance, news) arrive every hour. No human can process it all.
2. **Narrative blindness** — Markets move on *stories*, not just numbers. "AI rotation," "institutional accumulation," "regulatory fear" — these narratives drive price before indicators catch up. But detecting narrative shifts requires reading hundreds of articles.
3. **Execution delay** — Even when a trader spots a shift, the manual process of analysis → decision → execution takes hours or days. By then, the move has happened.

## The Solution

**Cinder** solves all three by combining an **AI financial wire service** with a **narrative regime detection engine** and an **automated trading executor**:

| Layer | What It Does | How |
|---|---|---|
| 📰 **Wire Layer** | Publishes institutional-grade market reports 24/7 | AI generates stories from SoSoValue's ETF flow, sector, and AI news data |
| 🧠 **Narrative Layer** | Detects when the dominant market story is changing | NLP pipeline classifies narrative regimes and tracks temperature shifts |
| ⚡ **Execution Layer** | Trades the narrative shift before the crowd | Auto-executes on SoDEX with risk controls, stop-losses, and human override |

> **The key insight:** The published news articles *are* the trade rationale. Every trade Cinder makes has a corresponding article explaining exactly why. Full transparency — no black-box trading.

---

## Features

### 📰 Autonomous Wire Service
- **Market Pulse** reports published every 4 hours with ETF flow summaries, sector movers, and AI-generated analysis
- **Daily Deep Dives** — long-form institutional reports with charts, data tables, and trade recommendations
- **Breaking Alerts** — published immediately when a narrative regime shift is detected
- All stories auto-generated from live SoSoValue API data — zero human writers
- Embedded interactive charts (ETF flow trends, sector heatmaps, narrative timelines)
- RSS feed + Telegram channel for subscribers

### 🧠 Narrative Intelligence Engine
- Real-time **Narrative Temperature** tracking (0–100°) for 8+ recurring crypto narrative archetypes
- Multi-signal detection using three independent SoSoValue data streams:
  - **News NLP**: Topic extraction and keyword frequency analysis from SoSoValue's AI news feed
  - **Flow Analysis**: ETF inflow/outflow trend direction and acceleration
  - **Sector Rotation**: SSI index relative performance and cross-sector correlation
- **Narrative Shift Detection** — triggers when a dominant narrative cools while an emerging one heats up
- **Confidence Scoring** — requires ≥80% confidence and 2+ signal agreement before any trade action
- Interactive **Narrative Bubble Map** visualization showing all tracked narratives and their temperatures in real-time
- Historical **Narrative Timeline** — scrollable view of past regime shifts with portfolio performance overlay

### ⚡ SoDEX Trade Execution
- Auto-executes portfolio rebalancing on SoDEX when narrative shift confidence exceeds threshold
- **Risk Controls:**
  - Maximum 30% portfolio allocation per narrative trade
  - Trailing stop-loss at -8% from entry
  - 48-hour cooldown between consecutive narrative trades
  - Multi-signal confirmation required (no single-signal trades)
  - One-click human override to pause auto-trading
- Trade confirmation published as a "Breaking" story with full reasoning
- Real-time portfolio dashboard with positions, PnL, and allocation breakdown
- Trade history linked to the stories that triggered each trade

### 🦊 Web3 Wallet Provider Integration
- Detects injected browser wallets (MetaMask, Rabby, Coinbase Wallet, etc.) conforming to **EIP-1193**
- Performs standard Web3 handshakes (`eth_requestAccounts`) and tracks native gas balances (`eth_getBalance`)
- Observes live session changes (`accountsChanged`, `chainChanged`) to handle hot account swaps dynamically
- Built-in testnet CNDR faucet persisting token balances per address in localStorage

### 🔒 Navigation Gating & Session Redirects
- Restricts dApp routes `/dashboard` and `/portfolio` to connected wallet sessions only
- Automatically intercepts disconnected users using Next.js `useRouter` redirects and pushes them back to `/`
- Render-gated home page feed showing a compact, blurred teaser story card with backdrop-filter blur and exact border alignment if disconnected

### 🔔 Alert System
- Telegram bot for real-time narrative shift alerts and trade notifications
- Configurable alert thresholds (notify at 60°, trade at 80°)
- Daily digest emails with performance summary

---

## Architecture

> For detailed technical architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        CINDER SYSTEM                         │
│                                                                 │
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   │
│  │  DATA LAYER  │──▶│  BRAIN LAYER  │──▶│  OUTPUT LAYER    │   │
│  │              │   │               │   │                  │   │
│  │ • SoSoValue  │   │ • Wire Gen    │   │ • News Website   │   │
│  │   ETF API    │   │ • Narrative   │   │ • Dashboard      │   │
│  │ • SoSoValue  │   │   Detection   │   │ • Telegram Bot   │   │
│  │   AI News    │   │ • Trade       │   │ • SoDEX Trades   │   │
│  │ • SoSoValue  │   │   Execution   │   │                  │   │
│  │   Sector API │   │               │   │                  │   │
│  └──────────────┘   └───────────────┘   └──────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR for SEO, API routes for backend logic |
| Styling | Vanilla CSS + CSS Variables | Dark theme, obsidian clay-glass layout, no framework overhead |
| Web3 Wallet | EIP-1193 / window.ethereum RPC | Connection to real wallets (MetaMask, Rabby) and fetching native balances |
| Charts | Recharts + D3.js | Recharts for story charts, D3 for narrative bubble map |
| Animation | Framer Motion | Smooth narrative transitions and live updates |
| AI/LLM | OpenAI GPT-4o | Story generation + narrative classification |
| Database | SQLite (via better-sqlite3) | Note that production runs on Turso(libSQL); Zero-config, perfect for hackathon; stores stories, narrative history, trades |
| Real-time | Server-Sent Events (SSE) | Live story updates on the news feed |
| Testing | Vitest | Fast unit testing scaffolding with database and OpenAI mocks |
| Trading | SoDEX REST API | Order placement, cancellation, account management |
| Data | SoSoValue REST API | ETF flows, AI news feed, sector/index data |
| Alerts | Telegram Bot API | Narrative shift + trade notifications |

---

## API Integration

> For detailed API integration guide, see [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md)

### SoSoValue API (Data & Intelligence)

Cinder uses **three** SoSoValue API endpoint categories:

| Endpoint Category | Used For | Update Frequency |
|---|---|---|
| ETF Flow Data | Daily inflows/outflows for BTC, ETH, SOL ETFs | Every 4 hours |
| AI News Feed | Real-time AI-summarized crypto news | Continuous (streaming) |
| Sector/Index Data | SSI protocol index performance + composition | Every 4 hours |

### SoDEX API (Execution)

Cinder uses **four** SoDEX API capabilities:

| Capability | Used For | Auth Required |
|---|---|---|
| Market Data (REST) | Asset pricing for portfolio valuation | No |
| Order Placement (REST) | Executing narrative-driven trades | Yes (EIP-712) |
| Order Cancellation (REST) | Stop-loss management | Yes (EIP-712) |
| Account State (REST) | Portfolio balances and positions | Yes (EIP-712) |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.0
- **Python** ≥ 3.10 (for the AI narrative engine)
- **SoSoValue API Key** — [Register here](https://sosovalue.com) then apply via [Buildathon form](https://forms.gle/2nuJT2qNbUQsyyZy8)
- **SoDEX Account + API Key** — [Register here](https://sodex.com) (testnet available without rank requirement)
- **OpenAI API Key** — For story generation and narrative classification

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/cinder.git
cd Cinder

# Install frontend dependencies
npm install

# Install Python dependencies (narrative engine)
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys (see below)
```

### Environment Variables

```env
# SoSoValue API
SOSOVALUE_API_KEY=your_sosovalue_api_key

#TURSO_API
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# SoDEX API
SODEX_API_KEY_NAME=your_api_key_name
SODEX_API_KEY_NAME_PRIVATE_KEY=your_api_key_name_private_key
SODEX_PRIVATE_KEY=your_evm_private_key
SODEX_API_BASE_URL=https://testnet-gw.sodex.dev/api/v1

# OpenAI (for story generation + narrative NLP)
OPENAI_API_KEY=your_openai_api_key

# Telegram Bot (optional, for alerts)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# App Configuration
NARRATIVE_TRADE_THRESHOLD=80        # Min confidence to auto-trade (0-100)
MAX_ALLOCATION_PER_TRADE=0.30       # Max 30% of portfolio per narrative trade
STOP_LOSS_PERCENTAGE=0.08           # 8% trailing stop-loss
COOLDOWN_HOURS=48                   # Hours between narrative trades
AUTO_TRADE_ENABLED=false            # Set to true to enable auto-trading
```

### Running Locally

```bash
# Start the development server (frontend + API routes)
npm run dev

# In a separate terminal, start the narrative engine
python engine/main.py

# The app will be available at http://localhost:3000
```

### Running on Testnet

Cinder ships pre-configured for **SoDEX Testnet**. No real funds required for demo.

```bash
# Ensure .env uses testnet URLs
SODEX_API_BASE_URL=https://testnet-gw.sodex.dev/api/v1

# Start with auto-trading enabled (safe on testnet)
AUTO_TRADE_ENABLED=true npm run dev
```

### ⛽ EIP-4337 Paymaster & On-Chain Token Deploy Setup

To deploy the CNDR token to a live testnet (such as Sepolia or Base Sepolia) and enable users to pay for execution gas fees in CNDR, you must provide:

1. **JSON-RPC Node URL**: An HTTP endpoint for your target testnet (e.g. from Infura, Alchemy, or QuickNode) configured in `.env`.
2. **Deployer Private Key**: An EVM private key holding a small amount of native gas tokens (e.g., Sepolia ETH) to sign and fund the contract deployment.
3. **Paymaster Sponsor Configuration**:
   - Integrate an Account Abstraction SDK (like **Biconomy**, **ZeroDev**, or **Pimlico**).
   - Configure a Token Paymaster contract pre-funded with native ETH. The Paymaster deducts CNDR from the user's smart wallet and pays the native gas ETH to the network bundlers.
   - Set up the Paymaster API keys in the Next.js API router.

To deploy the CNDR ERC-20 contract using Hardhat, run:
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

### 🧪 Running Unit Tests & CI

Cinder includes a comprehensive unit testing suite using **Vitest** to verify the core trading logic, EIP-712 order validation parameters, and narrative shift detections. All database calls and OpenAI API completions are mocked.

To run the test suite locally:
```bash
npm run test
```

A GitHub Actions workflow is configured under `.github/workflows/ci.yml` that automatically validates the codebase (lint + test execution) on every Pull Request.

---

## Project Structure

```
cinder/
├── README.md                       # This file
├── docs/
│   ├── ARCHITECTURE.md             # Detailed technical architecture
│   └── API_INTEGRATION.md          # SoSoValue + SoDEX API usage guide
├── public/
│   └── assets/                     # Static assets (logos, og-image)
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── layout.js               # Root layout (dark theme, fonts)
│   │   ├── page.js                 # Home — Wire feed (public)
│   │   ├── story/[id]/page.js      # Individual story page
│   │   ├── dashboard/page.js       # Narrative intelligence dashboard
│   │   ├── portfolio/page.js       # SoDEX portfolio & trades
│   │   └── api/                    # API routes
│   │       ├── stories/route.js    # CRUD for generated stories
│   │       ├── narrative/route.js  # Narrative state & history
│   │       ├── trade/route.js      # SoDEX trade execution
│   │       └── webhook/route.js    # Telegram webhook handler
│   ├── components/
│   │   ├── wire/                   # Wire/news UI components
│   │   │   ├── StoryCard.js        # Individual story card
│   │   │   ├── StoryFeed.js        # Live-updating story feed
│   │   │   ├── FlowChart.js        # ETF flow chart (Recharts)
│   │   │   └── SectorHeatmap.js    # Sector performance heatmap
│   │   ├── narrative/              # Narrative intelligence UI
│   │   │   ├── BubbleMap.js        # D3 narrative bubble visualization
│   │   │   ├── Timeline.js         # Historical narrative timeline
│   │   │   ├── TemperatureGauge.js # Narrative temperature meter
│   │   │   └── ShiftAlert.js       # Narrative shift alert card
│   │   ├── trading/                # Portfolio & trading UI
│   │   │   ├── PortfolioView.js    # Current positions & allocation
│   │   │   ├── TradeHistory.js     # Trade log linked to stories
│   │   │   ├── RiskDashboard.js    # Stop-loss levels, exposure
│   │   │   └── QuickTrade.js       # SoDEX trade widget
│   │   └── shared/                 # Shared/layout components
│   │       ├── Header.js           # Navigation header
│   │       ├── LiveIndicator.js    # Pulsing "LIVE" badge
│   │       └── ThemeProvider.js    # Dark/light theme
│   ├── lib/
│   │   ├── sosovalue.js            # SoSoValue API client
│   │   ├── sodex.js                # SoDEX API client (with EIP-712 signing)
│   │   ├── openai.js               # LLM client for story gen + NLP
│   │   ├── db.js                   # SQLite database helpers
│   │   └── telegram.js             # Telegram bot client
│   ├── engine/                     # Narrative intelligence engine
│   │   ├── narrative.js            # Narrative classifier & temperature tracker
│   │   ├── shift-detector.js       # Multi-signal shift detection
│   │   └── trade-engine.js         # Risk-managed trade execution logic
│   └── styles/
│       ├── globals.css             # CSS variables, dark theme, typography
│       ├── wire.css                # Wire/news page styles
│       ├── dashboard.css           # Narrative dashboard styles
│       └── portfolio.css           # Portfolio page styles
├── engine/                         # Python narrative engine (alternative)
│   ├── main.py                     # Engine entry point + scheduler
│   ├── narrative_classifier.py     # NLP narrative classification
│   ├── shift_detector.py           # Regime shift detection algorithm
│   └── requirements.txt            # Python dependencies
├── .env.example                    # Environment variable template
├── package.json                    # Node.js dependencies
└── next.config.js                  # Next.js configuration
```

---

## Demo

### Live Demo
🌐 **[https://cinder.vercel.app](https://cinder.vercel.app)** *(deployed during buildathon)*

### Demo Video
🎥 **[Watch the 2-minute walkthrough →](#)** *(link to be added)*

### Demo Script

1. **Open the Wire** → See live stories publishing with ETF flow data, sector analysis, and AI commentary
2. **Check the Narrative Dashboard** → Watch the bubble map showing "Institutional Accumulation" cooling and "AI Token Rotation" heating
3. **See a Shift Alert** → When confidence crosses 80%, a breaking story auto-publishes with the trade plan
4. **View the Trade** → Portfolio page shows the executed SoDEX trade, linked to the story that triggered it
5. **Read the Transparency** → Every trade has an article. Every article has data. Full audit trail.

---

## Buildathon Criteria Coverage

| Criterion | How Cinder Addresses It | Status |
|---|---|---|
| ✅ Genuine SoSoValue API integration | Uses ETF flows, AI news feed, and sector/index data as the sole data source for all intelligence | **Core** |
| ✅ Clear use case | Autonomous financial wire service + narrative-driven portfolio management | **Core** |
| ✅ Complete data → output flow | SoSoValue data → AI story + narrative detection → trade execution on SoDEX | **Core** |
| ⭐ SoDEX API integration | Auto-executes trades, manages positions, sets stop-losses via SoDEX | **Implemented** |
| ⭐ AI-enhanced functionality | AI generates stories, classifies narratives, detects shifts, and sizes trades | **Implemented** |
| ⭐ Opportunity discovery | Narrative shift detection surfaces opportunities before price catches up | **Implemented** |
| ⭐ Risk control + security | Stop-losses, max allocation caps, cooldowns, multi-signal confirmation, human override | **Implemented** |
| ⭐ Insight-to-action flow | Published story → embedded trade recommendation → one-click SoDEX execution | **Implemented** |
| ⭐ Product experience | Professional news site + interactive dashboard + Telegram alerts | **Implemented** |

---

## Contributing

This project was built for the **SoSoValue × SoDEX Buildathon (Wave 3, July 2026)**.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built with by turnless for the SoSoValue × SoDEX Buildathon</strong><br/>
  <em>"What if Bloomberg could trade its own stories?"</em>
</p>
