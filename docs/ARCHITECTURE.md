# Cinder — Technical Architecture

> This document describes the detailed technical architecture of Cinder, including system design, data flows, component specifications, and infrastructure decisions.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Principles](#architecture-principles)
- [Layer 1: Data Ingestion](#layer-1-data-ingestion)
- [Layer 2: Wire Engine (Story Generation)](#layer-2-wire-engine)
- [Layer 3: Narrative Intelligence Engine](#layer-3-narrative-intelligence-engine)
- [Layer 4: Execution Engine](#layer-4-execution-engine)
- [Layer 5: Presentation Layer](#layer-5-presentation-layer)
- [Data Models & Schema](#data-models--schema)
- [Scheduling & Orchestration](#scheduling--orchestration)
- [Security Architecture](#security-architecture)
- [Error Handling & Resilience](#error-handling--resilience)
- [Deployment Architecture](#deployment-architecture)

---

## System Overview

AlphaWire is a three-layer system that transforms raw financial data into published intelligence and actionable trades:

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                  CINDER SYSTEM                          │
                    │                                                         │
                    │  ┌─────────────────────────────────────────────────┐    │
                    │  │              ORCHESTRATION LAYER                │    │
                    │  │     Scheduler (cron) + Event Bus (in-process)   │    │
                    │  └──────────┬──────────────┬──────────────┬────────┘    │
                    │             │              │              │             │
                    │  ┌──────────▼──┐  ┌────────▼───────┐  ┌──▼──────────┐  │
                    │  │ WIRE ENGINE │  │   NARRATIVE    │  │  EXECUTION  │  │
                    │  │             │  │    ENGINE      │  │   ENGINE    │  │
                    │  │ • Fetch data│  │ • Classify     │  │ • Risk calc │  │
                    │  │ • Generate  │  │ • Track temp   │  │ • Place     │  │
                    │  │   stories   │  │ • Detect shift │  │   orders    │  │
                    │  │ • Publish   │  │ • Score conf   │  │ • Monitor   │  │
                    │  └──────┬──────┘  └───────┬────────┘  └──────┬──────┘  │
                    │         │                 │                   │         │
                    │  ┌──────▼─────────────────▼───────────────────▼──────┐  │
                    │  │                  SHARED SERVICES                  │  │
                    │  │  Database (SQLite) │ API Clients │ LLM Client    │  │
                    │  └──────────────────────────────────────────────────┘  │
                    │                                                         │
                    └─────────────────────────────────────────────────────────┘
                                          │           │
                              ┌───────────┘           └────────────┐
                              ▼                                    ▼
                    ┌──────────────────┐                 ┌──────────────────┐
                    │   SoSoValue API  │                 │    SoDEX API     │
                    │  (Data + Intel)  │                 │   (Execution)    │
                    └──────────────────┘                 └──────────────────┘
```

---

## Architecture Principles

| Principle | Implementation |
|---|---|
| **Monolithic simplicity** | Single Next.js app with API routes — no microservices overhead for a hackathon |
| **Data-driven stories** | Stories are *generated from* data, not written around it — SoSoValue API is the single source of truth |
| **Transparent decision-making** | Every narrative detection and trade decision is logged and traceable to a published article |
| **Fail-safe execution** | Trade engine requires multi-signal confirmation; defaults to "no trade" on ambiguity |
| **Offline-tolerant** | SQLite database allows the app to function even if external APIs are temporarily unavailable |

---

## Layer 1: Data Ingestion

### Purpose
Fetch, normalize, and cache data from SoSoValue APIs on a scheduled basis.

### Components

#### `SoSoValueClient` (`src/lib/sosovalue.js`)

```
┌─────────────────────────────────────────────────────────────┐
│                    SoSoValue API Client                      │
│                                                              │
│  Methods:                                                    │
│  ├─ getETFFlows(asset, period)     → ETF inflow/outflow     │
│  ├─ getETFHistorical(asset, days)  → Historical flow series  │
│  ├─ getAINewsFeed(limit, offset)   → AI-curated news items   │
│  ├─ getSectorPerformance()         → SSI index returns       │
│  ├─ getSectorComposition(index)    → Index constituents      │
│  └─ getCoinData(symbol)            → Price, volume, mcap     │
│                                                              │
│  Config:                                                     │
│  ├─ Base URL: https://api.sosovalue.xyz/v1                   │
│  ├─ Auth: API key in Authorization header                    │
│  ├─ Rate limit: 20 calls/min (Demo tier)                     │
│  └─ Retry: 3 attempts with exponential backoff               │
└─────────────────────────────────────────────────────────────┘
```

#### Data Fetch Schedule

| Data Type | Fetch Interval | Stored In | TTL |
|---|---|---|---|
| ETF flows (BTC, ETH) | Every 4 hours | `etf_flows` table | 24 hours |
| ETF historical (30 days) | Every 12 hours | `etf_history` table | 7 days |
| AI news feed | Every 1 hour | `news_items` table | 48 hours |
| Sector/SSI performance | Every 4 hours | `sector_data` table | 24 hours |
| Coin prices | Every 1 hour | `coin_prices` table | 4 hours |

#### Data Normalization

All ingested data is normalized into internal models before storage:

```javascript
// Normalized ETF flow record
{
  id: "btc_etf_2026-07-11",
  asset: "BTC",
  date: "2026-07-11",
  netFlow: 487000000,         // USD
  totalNetAssets: 62400000000, // USD
  topInflows: [
    { fund: "IBIT", flow: 198000000 },
    { fund: "FBTC", flow: 142000000 },
    { fund: "ARKB", flow: 89000000 }
  ],
  topOutflows: [
    { fund: "GBTC", flow: -12000000 }
  ],
  fetchedAt: "2026-07-11T14:00:00Z"
}
```

---

## Layer 2: Wire Engine

### Purpose
Transform cached SoSoValue data into publishable, institutional-grade market stories.

### Story Generation Pipeline

```
┌──────────┐    ┌───────────┐    ┌──────────────┐    ┌───────────┐    ┌──────────┐
│  Gather  │───▶│ Structure │───▶│   Generate   │───▶│  Enrich   │───▶│ Publish  │
│  Data    │    │  Template │    │   via LLM    │    │  (charts) │    │  Story   │
└──────────┘    └───────────┘    └──────────────┘    └───────────┘    └──────────┘
```

### Story Types

#### Type A: Market Pulse (every 4 hours)

```
Trigger:    Cron schedule (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
Data used:  Latest ETF flows + sector performance + top 5 AI news items
LLM prompt: "Write a concise market pulse report..."
Output:     ~300 words + ETF flow table + sector sparklines
```

**LLM Prompt Template:**
```
You are Cinder, an AI financial wire service. Write a Market Pulse report.

DATA PROVIDED:
- BTC ETF Net Flow: {btc_flow}
- ETH ETF Net Flow: {eth_flow}
- Top performing sector: {top_sector} ({top_sector_return})
- Bottom performing sector: {bottom_sector} ({bottom_sector_return})
- Top AI News Headlines: {headlines}
- Current Narrative Temperature: {narrative_temp}

RULES:
- Write in Reuters/Bloomberg wire style: factual, concise, institutional
- Lead with the most significant data point
- Include ONE forward-looking "AI Analysis" paragraph
- End with narrative temperature reading
- Keep under 300 words
- Do NOT use emojis in the body text
```

#### Type B: Daily Deep Dive (once per day, 08:00 UTC)

```
Trigger:    Daily at 08:00 UTC
Data used:  7-day ETF flow trend + sector comparison + AI news sentiment + narrative state
LLM prompt: "Write an in-depth market analysis..."
Output:     ~800 words + flow trend chart + sector heatmap + narrative analysis
```

#### Type C: Breaking — Narrative Shift Alert (event-driven)

```
Trigger:    Narrative Engine detects shift with ≥80% confidence
Data used:  All signals that triggered the shift + historical precedents + trade plan
LLM prompt: "Write a breaking news alert about a narrative regime change..."
Output:     ~500 words + shift evidence table + trade confirmation details
```

### Chart Generation

Stories include embedded charts rendered server-side and stored as static data:

| Chart Type | Library | Used In |
|---|---|---|
| ETF Flow Bar Chart | Recharts | Market Pulse, Daily Deep Dive |
| Flow Trend Sparklines | Recharts | Market Pulse |
| Sector Heatmap | D3.js | Daily Deep Dive |
| Narrative Temperature Gauge | Custom SVG | All story types |
| Narrative Timeline | D3.js | Breaking Alerts |

---

## Layer 3: Narrative Intelligence Engine

### Purpose
Continuously classify the dominant market narrative, track temperature shifts, and detect regime changes.

### Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                   NARRATIVE INTELLIGENCE ENGINE                     │
│                                                                    │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────────┐  │
│  │  Signal A:     │  │  Signal B:     │  │  Signal C:          │  │
│  │  NEWS NLP      │  │  FLOW REGIME   │  │  SECTOR ROTATION    │  │
│  │                │  │                │  │                     │  │
│  │ AI news feed   │  │ ETF flow       │  │ SSI index relative  │  │
│  │ → keyword freq │  │ → direction    │  │ → performance rank  │  │
│  │ → topic embed  │  │ → acceleration │  │ → correlation       │  │
│  │ → sentiment    │  │ → magnitude    │  │ → leadership change │  │
│  └───────┬────────┘  └───────┬────────┘  └──────────┬──────────┘  │
│          │                   │                       │             │
│          └──────────┬────────┘───────────────────────┘             │
│                     ▼                                              │
│          ┌─────────────────────┐                                   │
│          │  NARRATIVE SCORER   │                                   │
│          │                     │                                   │
│          │  For each narrative: │                                  │
│          │  • Calculate temp    │                                  │
│          │  • Detect trend      │                                  │
│          │  • Check thresholds  │                                  │
│          └──────────┬──────────┘                                   │
│                     ▼                                              │
│          ┌─────────────────────┐                                   │
│          │  SHIFT DETECTOR     │                                   │
│          │                     │                                   │
│          │  Shift = narrative A │                                  │
│          │  cooling + narrative │                                  │
│          │  B heating           │                                  │
│          │  Confidence ≥ 80%    │                                  │
│          │  2+ signals agree    │                                  │
│          └──────────┬──────────┘                                   │
│                     ▼                                              │
│             SHIFT SIGNAL or                                        │
│             CONTINUE MONITORING                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Narrative Archetypes

The engine recognizes 8 pre-defined narrative archetypes. Each has specific detection criteria:

| ID | Archetype | News Keywords | ETF Flow Pattern | Sector Signal |
|---|---|---|---|---|
| `NAR_01` | Institutional Accumulation | "institutional," "ETF," "adoption" | Consistent net inflows ≥ $200M/day | BTC outperforms alts |
| `NAR_02` | Retail FOMO | "moon," "breakout," "all-time-high" | Inflows accelerating rapidly | Meme sector spikes |
| `NAR_03` | Regulatory Storm | "regulation," "SEC," "ban," "compliance" | Outflows begin or accelerate | All sectors correlated (fear) |
| `NAR_04` | AI/Tech Rotation | "AI," "artificial intelligence," "GPU" | BTC flows decelerating | AI sector index outperforms |
| `NAR_05` | DeFi Renaissance | "DeFi," "yield," "TVL," "protocol" | Neutral flows | DeFi sector leads |
| `NAR_06` | Risk-Off Flight | "crash," "recession," "risk," "macro" | Large outflows | Stablecoin mentions surge |
| `NAR_07` | L2/Infra Cycle | "scaling," "Layer 2," "rollup," "infra" | Neutral to positive | L2 sector outperforms |
| `NAR_08` | Black Swan | Volume anomaly (10x normal) | Extreme outflows | Correlation → 1.0 |

### Temperature Calculation

Each narrative's temperature is calculated every hour using a weighted scoring model:

```
Temperature(narrative) = 
    0.40 × NewsScore(narrative)      // keyword frequency + sentiment
  + 0.35 × FlowScore(narrative)      // ETF flow pattern match
  + 0.25 × SectorScore(narrative)    // sector performance alignment

Where each sub-score is normalized to 0–100 range.
```

**NewsScore** calculation:
```
keywords_present = count of archetype keywords in last 24h of AI news feed
keywords_baseline = average count over past 30 days
keyword_ratio = keywords_present / keywords_baseline

sentiment_alignment = 1.0 if sentiment matches expected direction, 0.0 otherwise

NewsScore = min(100, keyword_ratio × 50 × sentiment_alignment)
```

**FlowScore** calculation:
```
current_flow_pattern = classify(last 7 days of ETF flows)
expected_pattern = archetype's expected ETF flow pattern

FlowScore = pattern_similarity(current_flow_pattern, expected_pattern) × 100
```

**SectorScore** calculation:
```
sector_leader = highest returning SSI sector over 7 days
expected_leader = archetype's expected leading sector

if sector_leader == expected_leader:
    SectorScore = 80 + (outperformance_magnitude × 4)  // cap at 100
else:
    SectorScore = max(0, 50 - (rank_difference × 15))
```

### Shift Detection Algorithm

```python
def detect_shift(narrative_temperatures, history):
    """
    A shift is detected when:
    1. A dominant narrative (temp ≥ 70°) starts cooling (dropped ≥ 15° in 48h)
    2. An emerging narrative (temp ≥ 40°) is heating (gained ≥ 20° in 48h)
    3. At least 2 of 3 signal sources agree on the direction
    4. Combined confidence ≥ 80%
    """
    
    dominant = get_dominant_narrative(history, lookback=7_days)
    dominant_temp_now = narrative_temperatures[dominant.id]
    dominant_temp_48h_ago = history.get_temp(dominant.id, hours_ago=48)
    
    cooling = dominant_temp_48h_ago - dominant_temp_now  # positive = cooling
    
    if cooling < 15:
        return None  # Dominant narrative not cooling enough
    
    # Find the fastest-heating non-dominant narrative
    emerging = None
    max_heating = 0
    for nar_id, temp in narrative_temperatures.items():
        if nar_id == dominant.id:
            continue
        temp_48h_ago = history.get_temp(nar_id, hours_ago=48)
        heating = temp - temp_48h_ago
        if heating > max_heating and temp >= 40:
            max_heating = heating
            emerging = nar_id
    
    if emerging is None or max_heating < 20:
        return None  # No narrative heating fast enough
    
    # Multi-signal confirmation
    signals_agreeing = count_agreeing_signals(dominant, emerging)
    if signals_agreeing < 2:
        return None  # Not enough signal agreement
    
    # Calculate confidence
    confidence = calculate_confidence(cooling, max_heating, signals_agreeing)
    
    if confidence >= 80:
        return NarrativeShift(
            from_narrative=dominant,
            to_narrative=emerging,
            confidence=confidence,
            signals=get_supporting_evidence()
        )
    
    return None
```

---

## Layer 4: Execution Engine

### Purpose
Convert narrative shift signals into risk-managed trades on SoDEX.

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    EXECUTION ENGINE                         │
│                                                            │
│  ┌──────────────┐    ┌───────────────┐    ┌────────────┐  │
│  │  RISK ENGINE  │───▶│ ORDER BUILDER │───▶│  SoDEX     │  │
│  │              │    │               │    │  EXECUTOR   │  │
│  │ • Position   │    │ • Market/Limit│    │            │  │
│  │   sizing     │    │ • Stop-loss   │    │ • Sign     │  │
│  │ • Max alloc  │    │ • Take-profit │    │   EIP-712  │  │
│  │ • Cooldown   │    │ • Slippage    │    │ • Submit   │  │
│  │   check      │    │   tolerance   │    │ • Confirm  │  │
│  └──────────────┘    └───────────────┘    └────────────┘  │
│         ▲                                       │          │
│         │              ┌──────────────┐         │          │
│         └──────────────│ TRADE LOG    │◀────────┘          │
│                        │ (DB + Story) │                    │
│                        └──────────────┘                    │
└────────────────────────────────────────────────────────────┘
```

### Risk Controls

```javascript
const RISK_CONFIG = {
  // Position sizing
  maxAllocationPerTrade: 0.30,      // Max 30% of portfolio value per trade
  minTradeSize: 10,                 // Minimum $10 trade (avoid dust)
  
  // Stop-loss
  stopLossPercentage: 0.08,         // 8% trailing stop-loss
  
  // Cooldown
  cooldownHours: 48,                // Min hours between narrative trades
  
  // Confidence
  minConfidence: 80,                // Don't trade below 80% confidence
  minSignalsAgreeing: 2,            // Require 2+ signals to agree
  
  // Circuit breakers
  maxDailyLoss: 0.15,              // Halt trading if portfolio drops 15% in 24h
  maxOpenPositions: 5,              // Max concurrent positions
  
  // Human override
  autoTradeEnabled: false,          // Must be explicitly enabled
  requireConfirmation: true,        // Require user confirmation before trade
};
```

### Trade Execution Flow

```
Narrative Shift Detected (confidence ≥ 80%)
    │
    ▼
┌─ PRE-TRADE CHECKS ──────────────────────────┐
│  ✓ Auto-trading enabled?                     │
│  ✓ Cooldown period elapsed? (≥48h since last)│
│  ✓ Daily loss limit not hit? (<15%)          │
│  ✓ Max open positions not reached? (<5)      │
│  ✓ User not paused?                          │
│  Any ✗ → Log reason, publish story only      │
└──────────────────────────────────────────────┘
    │ All ✓
    ▼
┌─ POSITION SIZING ───────────────────────────┐
│  portfolio_value = fetch from SoDEX          │
│  trade_size = min(                           │
│    portfolio_value × maxAllocationPerTrade,  │
│    available_balance                         │
│  )                                           │
└──────────────────────────────────────────────┘
    │
    ▼
┌─ ORDER CONSTRUCTION ────────────────────────┐
│  Based on shift direction:                   │
│  • "Rotate INTO sector X" → BUY X tokens    │
│  • "Rotate OUT OF asset Y" → SELL Y         │
│  • Set stop-loss at entry × (1 - 0.08)      │
│  • Order type: MARKET (immediate execution)  │
└──────────────────────────────────────────────┘
    │
    ▼
┌─ SoDEX EXECUTION ──────────────────────────┐
│  1. Sign order payload with EIP-712          │
│  2. POST to SoDEX /trade/orders              │
│  3. Verify fill confirmation                 │
│  4. Set stop-loss order                      │
│  5. Log to database with story_id reference  │
└──────────────────────────────────────────────┘
    │
    ▼
┌─ POST-TRADE ────────────────────────────────┐
│  1. Generate "Breaking" story with trade     │
│     details and reasoning                    │
│  2. Publish to wire feed                     │
│  3. Send Telegram alert                      │
│  4. Update portfolio dashboard               │
│  5. Start monitoring stop-loss               │
└──────────────────────────────────────────────┘
```

### SoDEX API Client (`src/lib/sodex.js`)

```
┌─────────────────────────────────────────────────────────────┐
│                     SoDEX API Client                         │
│                                                              │
│  Public Methods (no auth):                                   │
│  ├─ getTicker(pair)              → Current price, volume     │
│  ├─ getOrderBook(pair, depth)    → Bid/ask levels            │
│  ├─ getKlines(pair, interval)    → OHLCV candles             │
│  └─ getMarkets()                 → Available trading pairs   │
│                                                              │
│  Signed Methods (EIP-712 auth):                              │
│  ├─ placeOrder(pair, side, type, qty, price)  → Order ID     │
│  ├─ cancelOrder(orderId)                      → Confirmation │
│  ├─ getAccountState(address)                  → Balances     │
│  ├─ getOpenOrders(address)                    → Orders list  │
│  ├─ getTradeHistory(address, limit)           → Fills        │
│  └─ getApiKeys(address)                       → Key list     │
│                                                              │
│  Signing:                                                    │
│  ├─ EIP-712 typed data signatures                            │
│  ├─ Headers: X-API-Key, X-API-Sign, X-API-Nonce             │
│  └─ Nonce: must fall within (T-2 days, T+1day)                 │
│                                                              │
│  Config:                                                     │
│  ├─ Testnet: https://testnet-gw.sodex.dev/api/v1/spot       │
│  ├─ Mainnet: https://mainnet-gw.sodex.dev/api/v1/spot       │
│  └─ Rate limit: 1200 weight/min per IP                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 5: Presentation Layer

### Page Architecture

```
┌──────────────────────────────────────────────────┐
│                    NEXT.JS APP                    │
│                                                   │
│  / (Home)                                         │
│  ├── Wire Feed (public)                           │
│  │   ├── StoryCard × N (reverse chronological)    │
│  │   ├── Live indicator (SSE connection)          │
│  │   └── Narrative Temperature sidebar widget     │
│  │                                                │
│  /story/[id]                                      │
│  ├── Full Story View                              │
│  │   ├── Story body (markdown rendered)           │
│  │   ├── Embedded charts (ETF flows, sectors)     │
│  │   ├── Trade widget (if actionable story)       │
│  │   └── Related stories                          │
│  │                                                │
│  /dashboard                                       │
│  ├── Narrative Intelligence Dashboard             │
│  │   ├── Narrative Bubble Map (D3.js)             │
│  │   ├── Narrative Timeline (horizontal scroll)   │
│  │   ├── Shift History Log                        │
│  │   └── Current Regime Card                      │
│  │                                                │
│  /portfolio                                       │
│  ├── Portfolio & Trading Dashboard                │
│  │   ├── Allocation Donut Chart                   │
│  │   ├── Performance Line Chart (vs benchmarks)   │
│  │   ├── Trade History (linked to stories)        │
│  │   ├── Risk Dashboard (stop-loss levels)        │
│  │   └── Controls (pause, adjust risk tolerance)  │
│  │                                                │
│  /api/stories        → Story CRUD                 │
│  /api/narrative      → Narrative state & history  │
│  /api/trade          → SoDEX trade execution      │
│  /api/webhook        → Telegram webhook           │
└──────────────────────────────────────────────────┘
```

### Real-Time Updates (SSE)

The wire feed uses Server-Sent Events for live story publishing:

```
Client                              Server
  │                                    │
  │──── GET /api/stories/stream ──────▶│
  │                                    │
  │◀─── event: new-story ─────────────│ (when new story published)
  │     data: { story object }         │
  │                                    │
  │◀─── event: narrative-update ──────│ (every hour)
  │     data: { temperatures }         │
  │                                    │
  │◀─── event: trade-executed ────────│ (when trade fires)
  │     data: { trade details }        │
  │                                    │
```

---

## Data Models & Schema

### SQLite Database Schema

```sql
-- Published stories
CREATE TABLE stories (
    id              TEXT PRIMARY KEY,         -- UUID
    type            TEXT NOT NULL,            -- 'pulse', 'deep_dive', 'breaking'
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,            -- Markdown content
    summary         TEXT,                     -- One-line summary
    chart_data      TEXT,                     -- JSON: chart configurations
    narrative_state TEXT,                     -- JSON: narrative temps at publish time
    published_at    DATETIME NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Narrative temperature history
CREATE TABLE narrative_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    narrative_id    TEXT NOT NULL,            -- e.g., 'NAR_01'
    temperature     REAL NOT NULL,            -- 0.0 to 100.0
    news_score      REAL,
    flow_score      REAL,
    sector_score    REAL,
    recorded_at     DATETIME NOT NULL
);

-- Detected narrative shifts
CREATE TABLE narrative_shifts (
    id              TEXT PRIMARY KEY,         -- UUID
    from_narrative  TEXT NOT NULL,
    to_narrative    TEXT NOT NULL,
    confidence      REAL NOT NULL,            -- 0.0 to 100.0
    signals         TEXT NOT NULL,            -- JSON: evidence array
    story_id        TEXT REFERENCES stories(id),
    trade_id        TEXT REFERENCES trades(id),
    detected_at     DATETIME NOT NULL
);

-- Executed trades
CREATE TABLE trades (
    id              TEXT PRIMARY KEY,         -- UUID
    shift_id        TEXT REFERENCES narrative_shifts(id),
    story_id        TEXT REFERENCES stories(id),
    side            TEXT NOT NULL,            -- 'buy' or 'sell'
    pair            TEXT NOT NULL,            -- e.g., 'BTC-USDC'
    order_type      TEXT NOT NULL,            -- 'market' or 'limit'
    quantity        TEXT NOT NULL,            -- Decimal string
    fill_price      TEXT,                     -- Decimal string (after fill)
    stop_loss_price TEXT,                     -- Decimal string
    sodex_order_id  TEXT,                     -- SoDEX order reference
    status          TEXT NOT NULL,            -- 'pending', 'filled', 'cancelled', 'stopped'
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    filled_at       DATETIME,
    closed_at       DATETIME
);

-- Cached SoSoValue data
CREATE TABLE etf_flows (
    id              TEXT PRIMARY KEY,
    asset           TEXT NOT NULL,
    date            TEXT NOT NULL,
    net_flow        REAL NOT NULL,
    total_net_assets REAL,
    details         TEXT,                     -- JSON: per-fund breakdown
    fetched_at      DATETIME NOT NULL
);

CREATE TABLE news_items (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    summary         TEXT,
    source          TEXT,
    keywords        TEXT,                     -- JSON: extracted keywords
    sentiment       REAL,                     -- -1.0 to 1.0
    fetched_at      DATETIME NOT NULL
);

CREATE TABLE sector_data (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sector          TEXT NOT NULL,
    performance_7d  REAL,
    performance_30d REAL,
    correlation_btc REAL,
    constituents    TEXT,                     -- JSON: token list
    fetched_at      DATETIME NOT NULL
);

-- Indexes for common queries
CREATE INDEX idx_stories_type ON stories(type);
CREATE INDEX idx_stories_published ON stories(published_at DESC);
CREATE INDEX idx_narrative_history_time ON narrative_history(recorded_at DESC);
CREATE INDEX idx_narrative_history_id ON narrative_history(narrative_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_etf_flows_date ON etf_flows(asset, date);
```

---

## Scheduling & Orchestration

### Cron Schedule (via `node-cron` or Next.js API route invocation)

| Job | Schedule | Action |
|---|---|---|
| `fetch-etf-flows` | Every 4 hours | Fetch ETF data from SoSoValue API |
| `fetch-news` | Every 1 hour | Fetch AI news feed from SoSoValue API |
| `fetch-sectors` | Every 4 hours | Fetch sector/SSI data from SoSoValue API |
| `update-narratives` | Every 1 hour | Recalculate all narrative temperatures |
| `check-shifts` | Every 1 hour | Run shift detection algorithm |
| `generate-pulse` | Every 4 hours | Generate and publish Market Pulse story |
| `generate-deep-dive` | Daily 08:00 UTC | Generate and publish Daily Deep Dive |
| `monitor-stop-losses` | Every 5 minutes | Check SoDEX positions against stop-loss levels |

### Event Flow

```
fetch-news (hourly)
    │
    ├──▶ update-narratives
    │         │
    │         └──▶ check-shifts
    │                   │
    │         ┌─────────┤
    │         ▼         ▼
    │    [No Shift]  [Shift Detected]
    │                   │
    │                   ├──▶ Execute trade on SoDEX
    │                   └──▶ Generate "Breaking" story
    │
generate-pulse (every 4 hours)
    │
    └──▶ Publish Market Pulse story with current narrative state
```

---

## Security Architecture

### API Key Management

```
┌──────────────────────────────────────────────┐
│              KEY SECURITY                     │
│                                              │
│  SoSoValue API Key                           │
│  ├─ Stored in .env (server-side only)        │
│  ├─ Never exposed to client/browser          │
│  └─ Used in API routes only                  │
│                                              │
│  SoDEX Private Key (EIP-712 signing)         │
│  ├─ Stored in .env (server-side only)        │
│  ├─ Used ONLY in trade execution API route   │
│  ├─ Never logged or included in stories
│  ├─ master wallet key(offline, used for addAPIKey/revokeAPIKey)
│  └─ Testnet key recommended for demo         │
│  
│  SODEX_API_KEY_NAME_PRIVATE_KEY (used for trading)
│  OpenAI API Key                              │
│  ├─ Stored in .env (server-side only)        │
│  └─ Used in story generation API routes      │
│                                              │
│  Telegram Bot Token                          │
│  ├─ Stored in .env (server-side only)        │
│  └─ Webhook validates Telegram signature     │
└──────────────────────────────────────────────┘
```

### Trade Safety

- All trades default to **testnet** unless explicitly configured for mainnet
- `AUTO_TRADE_ENABLED` defaults to `false` — requires explicit opt-in
- Circuit breaker halts all trading if portfolio drops >15% in 24 hours
- All trade decisions logged to database before execution (crash recovery)
- The kill-switch is Edge config-backed and reachable via a Telegram/ pause command, not just the build-time AUTO_TRADE_ENABLED flag.

---

## Web3 Wallet & Gating Architecture

### Provider Handshake (EIP-1193)
Cinder integrates directly with injected browser wallet providers (MetaMask, Rabby, Coinbase Wallet) utilizing EIP-1193 RPC standards. The application context maintains live connections through `WalletContext`:
- **Accounts Request**: Dispatches `eth_requestAccounts` when users interact with connection triggers.
- **Native Balance Tracking**: Requests `eth_getBalance` to query and parse native gas assets (`ETH`) from the network node.
- **Observer Listeners**:
  - `accountsChanged`: Automatically shifts active context credentials, balances, and locks if users select a different address.
  - `chainChanged`: Forces standard page reloads to prevent cross-network caching issues.

### Session Gating & Router Interceptors
To secure sensitive dApp endpoints (`/dashboard` and `/portfolio`):
- **Client Route Interceptors**: The Next.js client renders checks against the connection context. If the wallet is disconnected, standard pages are pre-empted with `router.push('/')` redirects.
- **Preview Teasers**: The landing page `/` displays a single latest story teaser. The teaser card content is readable but covered by an absolute-positioned, glassmorphic `Unlock Market Intelligence` card utilizing `backdrop-filter: blur(10px)`. Clicking this card triggers the Connect Wallet modal.

### EIP-4337 Paymaster & ERC-20 Gas Architecture
To enable gasless CNDR token operations on-chain:
- **ERC-20 CNDR Faucet Contract**: Holds test allocations and enforces cooldown limits (1,000 CNDR per day per address).
- **Paymaster Reimbursement**: Under EIP-4337, transactions are submitted as `UserOperations` to a Bundler. The CNDR Token Paymaster contract intercepts the call, burns the gas fee equivalent in CNDR tokens from the user's Smart Wallet balance, and reimburses the Bundler in native testnet gas (ETH) from its own reserve pool.

---

## Error Handling & Resilience

| Failure | Handling |
|---|---|
| SoSoValue API unreachable | Use cached data (SQLite); degrade story quality; log warning |
| SoSoValue rate limit hit | Exponential backoff; skip non-critical fetches |
| SoDEX API unreachable | Cancel trade execution; publish story with "trade pending" status |
| SoDEX order rejected | Log error; alert via Telegram; do NOT retry automatically |
| LLM API failure | Fall back to template-based story (no AI narration); log error |
| Database corruption | SQLite WAL mode for crash safety; daily backup |
| Narrative engine crash | Default to "continue monitoring" (no trade); restart on next cron tick |

---

## Deployment Architecture

### Production (Vercel + Railway)

```
┌──────────────────────┐     ┌──────────────────────┐
│       VERCEL          │     │      RAILWAY          │
│                       │     │                       │
│  Next.js Frontend     │     │  Python Narrative     │
│  + API Routes         │◀───▶│  Engine (optional)    │
│  + SSE endpoint       │     │  + Cron scheduler     │
│  + Turso (libSQl, hosted)      │     │                       │
│                       │     │                       │
└───────────┬───────────┘     └───────────────────────┘
            │
     ┌──────┴──────┐
     ▼              ▼
┌─────────┐  ┌───────────┐
│SoSoValue│  │   SoDEX   │
│  API    │  │   API     │
└─────────┘  └───────────┘
```

### Minimal Deployment (Single Server)

For hackathon demo, everything runs on a single machine:
```bash
npm run dev          # Next.js (frontend + API + cron)
python engine/main.py # Narrative engine (optional, can be JS-only)
```

---

*Last updated: July 2026 — Cinder v1.0 (Buildathon Edition)*
