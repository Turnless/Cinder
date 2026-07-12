import crypto from 'crypto';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { query, execute } from '../../../lib/db';
import { rateLimit } from '../../../lib/rate-limiter';

export const dynamic = 'force-dynamic';

const MOCK_STORIES = [
  {
    id: "breaking-001",
    type: "breaking",
    title: "REGIME SHIFT: AI/Tech Rotation dominant as DeFi inflows cool",
    summary: "AlphaWire Shift Detector flagged a transition to NAR_04 (AI/Tech Rotation) with 88% confidence, triggering automated spot reallocation.",
    body: `### Narrative Regime Shift Detected

The AlphaWire narrative tracking system has triggered a major regime shift alert. Momentum in **Institutional Accumulation (NAR_01)** has leveled off, while **AI/Tech Rotation (NAR_04)** has surged, driven by massive developer activity and GPU compute-related tokens.

#### Supporting Signals & Evidence

| Signal Source | Metric Status | Confidence Contribution |
|---|---|---|
| ETF Flows | Neutral to slightly negative | 15% |
| Sector Heatmap | AI-based tokens +24.5% vs BTC | 45% |
| Social Sentiment | "Compute", "DePIN" keywords spike | 28% |

#### Automated Execution Log

Following the regime shift confirmation, the AlphaWire trade execution system placed rebalancing orders:

- **Action:** Reallocated 15% of spot portfolio from BTC to native compute protocols.
- **Order Details:** Market buy order executed on testnet.
- **Execution Status:** FILLED at 15:42:01 UTC.
- **Sodex Order ID:** sodex_9874521_acc
`,
    chart_data: JSON.stringify({
      etf_flows: [
        { date: "2026-07-06", net_flow: 145.2, asset: "BTC" },
        { date: "2026-07-07", net_flow: 89.1, asset: "BTC" },
        { date: "2026-07-08", net_flow: -34.8, asset: "BTC" },
        { date: "2026-07-09", net_flow: 12.0, asset: "BTC" },
        { date: "2026-07-10", net_flow: -85.5, asset: "BTC" },
        { date: "2026-07-11", net_flow: -110.2, asset: "BTC" },
        { date: "2026-07-12", net_flow: -45.0, asset: "BTC" }
      ],
      sectors: [
        { sector: "AI / Tech", performance_7d: 24.5, performance_30d: 48.2, correlation_btc: 0.35 },
        { sector: "DeFi Renaissance", performance_7d: -4.2, performance_30d: 18.5, correlation_btc: 0.85 },
        { sector: "L2 / Infra", performance_7d: 2.1, performance_30d: 8.4, correlation_btc: 0.92 },
        { sector: "Retail Meme", performance_7d: -12.4, performance_30d: -5.1, correlation_btc: 0.70 }
      ]
    }),
    narrative_state: JSON.stringify({
      NAR_01: 42.0,
      NAR_04: 88.0,
      NAR_05: 35.0
    }),
    published_at: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
  },
  {
    id: "deep-001",
    type: "deep_dive",
    title: "Weekly Deep Dive: Evaluating the Institutional ETF Outflows & Sector Rotation",
    summary: "A comprehensive analysis of crypto ETF net flows, sector correlations, and macro narrative heatmaps.",
    body: `### Executive Summary

Over the last 7 trading days, we have witnessed a significant shift in capital flows and market sentiment. While the headline BTC spot ETF flow has turned negative, relative strength remains highly concentrated in AI and DePIN projects. 

This deep dive evaluates the underlying flow patterns and the structural rotation occurring across major crypto sectors.

### Institutional Capital Flows

ETF flows represent the primary gateway for traditional capital into the digital asset ecosystem. Recent data shows a cooling period. After weeks of steady accumulation, net outflows have dominated the last few sessions, leading to a flattening of the narrative temperature for **Institutional Accumulation**.

[ETF Flow Trend Chart]

As visualized in the chart above, the three-day rolling net flow has slipped into negative territory, which historically indicates short-term consolidation before the next leg of accumulation.

### Sector Rotation & Relative Strength

As capital pauses in major large-caps, it has rotated aggressively into technological utility, specifically AI-focused protocols.

[Sector Heatmap]

Our quantitative sector analysis shows a high correlation between AI sector outperformance and the decline in BTC dominance. This suggests that native crypto liquidity is actively looking for high-beta sectors during large-cap consolidations.

### Outlook & Risk Analysis

- **Downside Risk:** If ETF outflows accelerate past $200M/day, we expect a broader correction to test primary support.
- **Upside Catalyst:** A cooling of regulatory pressure (NAR_03) could trigger a DeFi renaissance.
`,
    chart_data: JSON.stringify({
      etf_flows: [
        { date: "2026-07-06", net_flow: 145.2, asset: "BTC" },
        { date: "2026-07-07", net_flow: 89.1, asset: "BTC" },
        { date: "2026-07-08", net_flow: -34.8, asset: "BTC" },
        { date: "2026-07-09", net_flow: 12.0, asset: "BTC" },
        { date: "2026-07-10", net_flow: -85.5, asset: "BTC" },
        { date: "2026-07-11", net_flow: -110.2, asset: "BTC" },
        { date: "2026-07-12", net_flow: -45.0, asset: "BTC" }
      ],
      sectors: [
        { sector: "AI / Tech", performance_7d: 24.5, performance_30d: 48.2, correlation_btc: 0.35 },
        { sector: "DeFi Renaissance", performance_7d: -4.2, performance_30d: 18.5, correlation_btc: 0.85 },
        { sector: "L2 / Infra", performance_7d: 2.1, performance_30d: 8.4, correlation_btc: 0.92 },
        { sector: "Retail Meme", performance_7d: -12.4, performance_30d: -5.1, correlation_btc: 0.70 }
      ]
    }),
    narrative_state: JSON.stringify({
      NAR_01: 52.0,
      NAR_04: 65.0,
      NAR_05: 45.0
    }),
    published_at: new Date(Date.now() - 7200000).toISOString() // 2 hours ago
  },
  {
    id: "pulse-001",
    type: "pulse",
    title: "Market Pulse: Institutional Accumulation Slows Down",
    summary: "BTC ETF net outflows reach $45M as market consolidation continues.",
    body: `Net inflows into spot ETFs have turned negative, with a net outflow of $45.0M recorded in the latest session. AI-based tokens continue to lead sector performance with +24.5% returns over 7 days, while meme sectors lag at -12.4%.

### AI Analysis
We expect the market consolidation to persist as institutional buyers await CPI prints. The shift to tech/AI sectors reflects a tactical hedge by crypto-native funds.

Dominant narrative: Institutional Accumulation (NAR_01) at 42° (Cooling).
`,
    chart_data: JSON.stringify({
      etf_flows: [],
      sectors: []
    }),
    narrative_state: JSON.stringify({
      NAR_01: 42.0,
      NAR_04: 55.0
    }),
    published_at: new Date(Date.now() - 14400000).toISOString() // 4 hours ago
  }
];

async function ensureDbData() {
  try {
    const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='stories'");
    if (tables.length === 0) {
      const migrationPath = path.join(process.cwd(), 'migrations', '0001_init.sql');
      if (fs.existsSync(migrationPath)) {
        const sqlContent = fs.readFileSync(migrationPath, 'utf8');
        const statements = sqlContent
          .split(/;\s*[\r\n]+/)
          .map(stmt => {
            return stmt
              .split('\n')
              .filter(line => !line.trim().startsWith('--'))
              .join('\n')
              .trim();
          })
          .filter(stmt => stmt.length > 0);
        for (const sql of statements) {
          await execute(sql.endsWith(';') ? sql : sql + ';');
        }
      }
    }

    const countRes = await query('SELECT COUNT(*) as count FROM stories');
    if (countRes[0]?.count === 0) {
      console.log('Seeding database with initial mock stories...');
      for (const story of MOCK_STORIES) {
        await execute(
          `INSERT INTO stories (id, type, title, body, summary, chart_data, narrative_state, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            story.id,
            story.type,
            story.title,
            story.body,
            story.summary,
            story.chart_data,
            story.narrative_state,
            story.published_at
          ]
        );
      }
    }
  } catch (err) {
    console.error('Error auto-seeding DB:', err);
  }
}

export async function GET(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateResult = rateLimit(ip);
    if (!rateResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    await ensureDbData();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const type = searchParams.get('type');

    let storiesQuery = `
      SELECT id, type, title, body, summary, chart_data, narrative_state, published_at, created_at
      FROM stories
    `;
    let countQuery = `SELECT COUNT(*) as total FROM stories`;
    const params = [];
    const countParams = [];

    if (type) {
      storiesQuery += ` WHERE type = ?`;
      countQuery += ` WHERE type = ?`;
      params.push(type);
      countParams.push(type);
    }

    storiesQuery += ` ORDER BY published_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query(storiesQuery, params);
    const countResult = await query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    const stories = rows.map(story => {
      let chartData = null;
      let narrativeState = null;

      try {
        if (story.chart_data) {
          chartData = typeof story.chart_data === 'string' ? JSON.parse(story.chart_data) : story.chart_data;
        }
      } catch (e) {
        console.error('Failed to parse chart_data for story', story.id, e);
      }

      try {
        if (story.narrative_state) {
          narrativeState = typeof story.narrative_state === 'string' ? JSON.parse(story.narrative_state) : story.narrative_state;
        }
      } catch (e) {
        console.error('Failed to parse narrative_state for story', story.id, e);
      }

      return {
        ...story,
        chart_data: chartData,
        narrative_state: narrativeState
      };
    });

    return NextResponse.json({
      success: true,
      stories,
      pagination: {
        total,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('Error fetching stories in API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateResult = rateLimit(ip);
    if (!rateResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    await ensureDbData();
    const body = await request.json();
    const {
      type,
      title,
      body: storyBody,
      summary,
      chart_data,
      narrative_state,
      published_at
    } = body;

    if (!type || !title || !storyBody) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: type, title, body are required.'
      }, { status: 400 });
    }

    const id = body.id || `story_${crypto.randomUUID()}`;
    const publishedAt = published_at || new Date().toISOString();

    const chartDataStr = chart_data ? (typeof chart_data === 'object' ? JSON.stringify(chart_data) : chart_data) : null;
    const narrativeStateStr = narrative_state ? (typeof narrative_state === 'object' ? JSON.stringify(narrative_state) : narrative_state) : null;

    await execute(
      `INSERT INTO stories (id, type, title, body, summary, chart_data, narrative_state, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        title,
        storyBody,
        summary || null,
        chartDataStr,
        narrativeStateStr,
        publishedAt
      ]
    );

    const newStory = {
      id,
      type,
      title,
      body: storyBody,
      summary: summary || null,
      chart_data: chart_data || null,
      narrative_state: narrative_state || null,
      published_at: publishedAt
    };

    if (global.broadcastStory) {
      global.broadcastStory(newStory);
    }

    return NextResponse.json({
      success: true,
      storyId: id,
      message: 'Story created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/stories:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
