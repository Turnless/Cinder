import crypto from 'crypto';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { query, execute } from '../../../lib/db';
import { rateLimit } from '../../../lib/rate-limiter';
import { getAINewsFeed } from '../../../lib/sosovalue';
import { refineAllNews } from '../../../lib/openai';

export const dynamic = 'force-dynamic';

async function ensureDbData() {
  try {
    const tables = await query("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map(t => t.name);
    const requiredTables = ['stories', 'news_items', 'etf_flows', 'sector_data', 'narrative_history'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    if (missingTables.length > 0) {
      console.log(`[DB] Missing tables detected: ${missingTables.join(', ')}. Running migration...`);
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
        console.log('[DB] Migration completed successfully');
      }
    }
  } catch (err) {
    console.error('Error ensuring DB schema:', err);
  }
}

export async function GET(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateResult = rateLimit(ip);
    if (!rateResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    if (process.env.NODE_ENV === 'development' && !global.schedulerInitialized) {
      global.schedulerInitialized = true;
      import('../../../lib/scheduler.js')
        .then(() => console.log('[SUCCESS] Local Cinder Scheduler started successfully in-process'))
        .catch(err => console.error('[ERROR] Failed to start local scheduler:', err));
    }

    await ensureDbData();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const type = searchParams.get('type');
    const refresh = searchParams.get('refresh') === 'true';

    // Manual refresh: fetch fresh news, refine via MiMo, cache all
    if (refresh) {
      try {
        console.log('[STORIES API] Manual news refresh triggered...');
        const freshNews = await getAINewsFeed(50);
        if (freshNews && freshNews.length > 0) {
          // Refine the latest 10 via MiMo AI (titles + sentiment)
          const toRefine = freshNews.slice(0, 10);
          let refined = toRefine;
          try {
            refined = await refineAllNews(toRefine);
          } catch (refineErr) {
            console.error('[STORIES API] MiMo refinement failed, using raw news:', refineErr.message);
          }

          // Merge refined back into full list
          const refinedMap = {};
          for (const item of refined) {
            refinedMap[String(item.id)] = item;
          }
          const allNews = freshNews.map(item => refinedMap[item.id] || item);

          for (const item of allNews) {
            await execute(
              `INSERT INTO news_items (id, title, summary, source, keywords, sentiment, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 summary = excluded.summary,
                 sentiment = excluded.sentiment,
                 keywords = excluded.keywords`,
              [
                item.id,
                item.title,
                item.summary || null,
                item.source || null,
                JSON.stringify(item.keywords || []),
                item.sentiment !== undefined ? item.sentiment : null,
                item.publishedAt || new Date().toISOString()
              ]
            );
          }
          console.log(`[STORIES API] Refreshed ${freshNews.length} news, refined top 10 via MiMo`);
        }

        // Backfill: refine old items missing sentiment (batch of 10 at a time, max 3 batches)
        const unrefined = await query(
          `SELECT id, title, summary, source, keywords, fetched_at FROM news_items
           WHERE sentiment IS NULL AND fetched_at >= datetime('now', '-30 days')
           ORDER BY fetched_at DESC LIMIT 30`
        );
        if (unrefined.length > 0) {
          console.log(`[STORIES API] Backfilling sentiment for ${unrefined.length} unrefined items...`);
          for (let i = 0; i < unrefined.length; i += 10) {
            const batch = unrefined.slice(i, i + 10);
            try {
              const refinedBatch = await refineAllNews(batch);
              for (const item of refinedBatch) {
                await execute(
                  `INSERT INTO news_items (id, title, summary, source, keywords, sentiment, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     title = excluded.title, summary = excluded.summary,
                     sentiment = excluded.sentiment, keywords = excluded.keywords`,
                  [item.id, item.title, item.summary || null, item.source || null,
                   JSON.stringify(item.keywords || []), item.sentiment, item.fetched_at]
                );
              }
              console.log(`[STORIES API] Backfilled batch ${Math.floor(i/10)+1} (${batch.length} items)`);
            } catch (batchErr) {
              console.error(`[STORIES API] Backfill batch ${Math.floor(i/10)+1} failed:`, batchErr.message);
              break;
            }
          }
        }
      } catch (refreshErr) {
        console.error('[STORIES API] Error during manual refresh:', refreshErr);
      }
    }

    // --- Fetch AI-generated stories from the stories table ---
    let storiesQuery = `
      SELECT id, type, title, body, summary, chart_data, narrative_state, published_at, created_at
      FROM stories
    `;
    const storyParams = [];

    if (type && type !== 'news') {
      storiesQuery += ` WHERE type = ?`;
      storyParams.push(type);
    }

    storiesQuery += ` ORDER BY published_at DESC`;

    const storyRows = type === 'news' ? [] : await query(storiesQuery, storyParams);

    // --- Also fetch real news from news_items table ---
    let newsRows = [];
    if (!type || type === 'news') {
      newsRows = await query(
        `SELECT id, title, summary, source, keywords, sentiment, fetched_at
         FROM news_items
         ORDER BY fetched_at DESC
         LIMIT 100`
      );
    }

    // Convert story rows
    const stories = storyRows.map(story => {
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

    // Convert real news items into story-compatible format
    const newsStories = newsRows.map(n => {
      let keywords = [];
      try { keywords = n.keywords ? JSON.parse(n.keywords) : []; } catch(e) { /* ignore */ }

      return {
        id: n.id,
        type: 'news',
        title: n.title,
        body: n.summary || n.title,
        summary: n.summary || n.title,
        chart_data: null,
        narrative_state: null,
        published_at: n.fetched_at,
        created_at: n.fetched_at,
        source: n.source || 'SoSoValue',
        keywords,
        sentiment: n.sentiment,
      };
    });

    // Merge and sort by published_at descending
    const allStories = [...stories, ...newsStories]
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(offset, offset + limit);

    const total = stories.length + newsStories.length;

    return NextResponse.json({
      success: true,
      stories: allStories,
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
    // Require internal API secret for story creation
    const apiSecret = request.headers.get('x-internal-api-secret');
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (!expectedSecret) {
      return NextResponse.json({ success: false, error: 'Server misconfigured: INTERNAL_API_SECRET not set' }, { status: 500 });
    }
    if (!apiSecret || apiSecret !== expectedSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized: missing or invalid x-internal-api-secret header' }, { status: 401 });
    }

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
