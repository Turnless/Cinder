import cron from 'node-cron';
import { getETFFlows, getAINewsFeed, getSectorPerformance } from './sosovalue.js';
import { updateNarrativeTemperatures } from '../engine/narrative.js';
import { checkMarketAndTrade, executeStopLossMonitoring, sendDailyDigestAlert } from '../engine/trade-engine.js';
import { query, execute } from './db.js';
import { generateMarketPulse, generateDailyDeepDive, classifyNewsBatch, generateStoryFromNewsItem, refineAllNews } from './openai.js';
import { createJobTracker } from './job-runner.js';

// Tracks every job so runs never overlap and their status can be reported (see scripts/worker.js)
export const jobTracker = createJobTracker();

// Jobs are started explicitly below, and run on UTC whatever the host's timezone is.
// A fresh object per job: node-cron writes the task name into the options it's given.
const cronOptions = (name) => ({ name, scheduled: false, timezone: 'Etc/UTC' });

console.log('[SCHEDULER] Initializing Cinder Scheduler...');

/**
 * Caches news items from SoSoValue AI news feed into local database.
 */
async function cacheNewsItems(news) {
  if (!news || news.length === 0) return;

  let refinedNews = news;
  try {
    refinedNews = await refineAllNews(news);
  } catch (err) {
    console.error('Failed to refine news items:', err);
  }

  for (const item of refinedNews) {
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
}

/**
 * Caches ETF flows for BTC and ETH in the local database.
 */
async function cacheEtfFlows(flows, asset) {
  if (!flows || flows.length === 0) return;
  for (const item of flows) {
    const id = `${asset}_${item.date}`;
    await execute(
      `INSERT INTO etf_flows (id, asset, date, net_flow, total_net_assets, details, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         net_flow = excluded.net_flow,
         total_net_assets = excluded.total_net_assets,
         details = excluded.details`,
      [
        id,
        asset,
        item.date,
        item.netFlow || 0,
        item.totalNetAssets || 0,
        JSON.stringify(item.details || []),
        new Date().toISOString()
      ]
    );
  }
}

/**
 * Caches sector performance data in local database.
 */
async function cacheSectors(sectors) {
  if (!sectors || sectors.length === 0) return;
  for (const item of sectors) {
    await execute(
      `INSERT INTO sector_data (sector, performance_7d, performance_30d, correlation_btc, constituents, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        item.displayName || item.indexName,
        item.performance7d || 0,
        item.performance30d || 0,
        item.correlationToBtc || 0,
        JSON.stringify(item.tokens || []),
        new Date().toISOString()
      ]
    );
  }
}

/**
 * Fetches latest indicators and narrative states, invokes OpenAI, and publishes a Cinder Market Pulse story.
 */
export async function generateAndPublishMarketPulse() {
  console.log('[PUBLISH] Generating 4-hourly Cinder Market Pulse story...');
  try {
    const btcFlows = await getETFFlows('BTC', 1);
    const ethFlows = await getETFFlows('ETH', 1);
    const btcFlowStr = btcFlows && btcFlows[0] ? `$${(btcFlows[0].netFlow / 1e6).toFixed(1)}M` : 'N/A';
    const ethFlowStr = ethFlows && ethFlows[0] ? `$${(ethFlows[0].netFlow / 1e6).toFixed(1)}M` : 'N/A';

    const sectors = await getSectorPerformance();
    let topSector = 'N/A';
    let topSectorReturn = '0.0%';
    let bottomSector = 'N/A';
    let bottomSectorReturn = '0.0%';

    if (sectors && sectors.length > 0) {
      const sortedSectors = [...sectors].sort((a, b) => (b.performance7d || 0) - (a.performance7d || 0));
      const top = sortedSectors[0];
      const bottom = sortedSectors[sortedSectors.length - 1];
      if (top) {
        topSector = top.displayName || top.indexName;
        topSectorReturn = `${(top.performance7d * 100).toFixed(2)}%`;
      }
      if (bottom) {
        bottomSector = bottom.displayName || bottom.indexName;
        bottomSectorReturn = `${(bottom.performance7d * 100).toFixed(2)}%`;
      }
    }

    const news = await getAINewsFeed(5);
    const headlines = news ? news.map(n => n.title) : [];

    const narrativeHistory = await query(
      `SELECT temperature FROM narrative_history WHERE narrative_id = 'NAR_01' ORDER BY recorded_at DESC LIMIT 1`
    );
    const narrativeTemp = narrativeHistory && narrativeHistory[0] ? narrativeHistory[0].temperature : '50.0';

    const body = await generateMarketPulse({
      btcFlow: btcFlowStr,
      ethFlow: ethFlowStr,
      topSector,
      topSectorReturn,
      bottomSector,
      bottomSectorReturn,
      headlines,
      narrativeTemp
    });

    let title = `Market Pulse: ETF Flows & Sector Rotation`;
    const lines = body.split('\n');
    const firstLine = lines[0]?.trim() || '';
    if (firstLine.startsWith('#')) {
      title = firstLine.replace(/^#+\s*/, '');
    }

    const id = `pulse_${Date.now()}`;
    const publishedAt = new Date().toISOString();
    const summary = `BTC net flow: ${btcFlowStr}, ETH net flow: ${ethFlowStr}. Top performing sector: ${topSector}.`;

    const currentTemps = {};
    const latestTemps = await query(
      `SELECT nh.narrative_id, nh.temperature
       FROM narrative_history nh
       INNER JOIN (
         SELECT narrative_id, MAX(recorded_at) as max_recorded
         FROM narrative_history
         GROUP BY narrative_id
       ) latest ON nh.narrative_id = latest.narrative_id AND nh.recorded_at = latest.max_recorded`
    );
    for (const t of latestTemps) {
      currentTemps[t.narrative_id] = t.temperature;
    }

    const chartData = {
      etf_flows: [
        { date: new Date().toISOString().split('T')[0], net_flow: btcFlows && btcFlows[0] ? btcFlows[0].netFlow : 0, asset: 'BTC' },
        { date: new Date().toISOString().split('T')[0], net_flow: ethFlows && ethFlows[0] ? ethFlows[0].netFlow : 0, asset: 'ETH' }
      ],
      sectors: sectors ? sectors.map(s => ({
        sector: s.displayName || s.indexName,
        performance_7d: parseFloat((s.performance7d * 100).toFixed(2)),
        performance_30d: parseFloat((s.performance30d * 100).toFixed(2)),
        correlation_btc: s.correlationToBtc
      })) : []
    };

    await execute(
      `INSERT INTO stories (id, type, title, body, summary, chart_data, narrative_state, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        'pulse',
        title,
        body,
        summary,
        JSON.stringify(chartData),
        JSON.stringify(currentTemps),
        publishedAt
      ]
    );

    const newStory = {
      id,
      type: 'pulse',
      title,
      body,
      summary,
      chart_data: chartData,
      narrative_state: currentTemps,
      published_at: publishedAt
    };

    if (global.broadcastStory) {
      global.broadcastStory(newStory);
    }
    console.log('[SUCCESS] Cinder Market Pulse story successfully published!');
  } catch (err) {
    console.error('[ERROR] Failed to generate and publish Market Pulse story:', err);
  }
}

/**
 * Fetches 7d metrics, AI sentiment, and narrative state, invokes OpenAI, and publishes a Cinder Daily Deep Dive report.
 */
export async function generateAndPublishDailyDeepDive() {
  console.log('[PUBLISH] Generating Cinder Daily Deep Dive story...');
  try {
    const btcHistorical = await query(
      `SELECT date, net_flow FROM etf_flows WHERE asset = 'BTC' ORDER BY date DESC LIMIT 7`
    );
    const ethHistorical = await query(
      `SELECT date, net_flow FROM etf_flows WHERE asset = 'ETH' ORDER BY date DESC LIMIT 7`
    );
    const etfFlowTrend = {
      btc: btcHistorical.map(h => ({ date: h.date, net_flow: h.net_flow })).reverse(),
      eth: ethHistorical.map(h => ({ date: h.date, net_flow: h.net_flow })).reverse()
    };

    const sectorRows = await query(`
      SELECT sd.sector, sd.performance_7d, sd.performance_30d, sd.correlation_btc
      FROM sector_data sd
      INNER JOIN (
          SELECT sector, MAX(fetched_at) as max_fetched
          FROM sector_data
          GROUP BY sector
      ) latest ON sd.sector = latest.sector AND sd.fetched_at = latest.max_fetched
    `);
    const sectorComparison = sectorRows.map(s => ({
      sector: s.sector,
      performance_7d: `${(s.performance_7d * 100).toFixed(2)}%`,
      performance_30d: `${(s.performance_30d * 100).toFixed(2)}%`,
      correlation_btc: s.correlation_btc
    }));

    const newsRows = await query(
      `SELECT title, sentiment FROM news_items WHERE fetched_at >= datetime('now', '-24 hours')`
    );
    const newsSentiment = newsRows.map(n => ({
      title: n.title,
      sentiment: n.sentiment
    }));

    const currentTemps = {};
    const latestTemps = await query(
      `SELECT nh.narrative_id, nh.temperature
       FROM narrative_history nh
       INNER JOIN (
         SELECT narrative_id, MAX(recorded_at) as max_recorded
         FROM narrative_history
         GROUP BY narrative_id
       ) latest ON nh.narrative_id = latest.narrative_id AND nh.recorded_at = latest.max_recorded`
    );
    for (const t of latestTemps) {
      currentTemps[t.narrative_id] = t.temperature;
    }

    const body = await generateDailyDeepDive({
      etfFlowTrend,
      sectorComparison,
      newsSentiment,
      narrativeState: currentTemps
    });

    let title = `Daily Deep Dive: Evaluating Capital Flows & Sector Rotations`;
    const lines = body.split('\n');
    const firstLine = lines[0]?.trim() || '';
    if (firstLine.startsWith('#')) {
      title = firstLine.replace(/^#+\s*/, '');
    }

    const id = `deep_${Date.now()}`;
    const publishedAt = new Date().toISOString();
    const summary = `A comprehensive daily report analyzing recent ETF flow trends, sector rotations, and current narrative temperatures.`;

    const chartData = {
      etf_flows: [
        ...etfFlowTrend.btc.map(b => ({ ...b, asset: 'BTC' })),
        ...etfFlowTrend.eth.map(e => ({ ...e, asset: 'ETH' }))
      ],
      sectors: sectorRows.map(s => ({
        sector: s.sector,
        performance_7d: parseFloat((s.performance_7d * 100).toFixed(2)),
        performance_30d: parseFloat((s.performance_30d * 100).toFixed(2)),
        correlation_btc: s.correlation_btc
      }))
    };

    await execute(
      `INSERT INTO stories (id, type, title, body, summary, chart_data, narrative_state, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        'deep_dive',
        title,
        body,
        summary,
        JSON.stringify(chartData),
        JSON.stringify(currentTemps),
        publishedAt
      ]
    );

    const newStory = {
      id,
      type: 'deep_dive',
      title,
      body,
      summary,
      chart_data: chartData,
      narrative_state: currentTemps,
      published_at: publishedAt
    };

    if (global.broadcastStory) {
      global.broadcastStory(newStory);
    }
    console.log('[SUCCESS] Cinder Daily Deep Dive story successfully published!');
  } catch (err) {
    console.error('[ERROR] Failed to generate and publish Daily Deep Dive story:', err);
  }
}

// Hours since an ISO timestamp; Infinity when there is none
function hoursSince(timestamp) {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? Infinity : (Date.now() - ms) / (60 * 60 * 1000);
}

/**
 * Runs an initial sync to populate the database with real news feed data on boot.
 */
export async function runInitialSync() {
  console.log('[SYNC] Running initial sync to populate real news feed...');
  try {
    const news = await getAINewsFeed(50);
    if (news && news.length > 0) {
      await cacheNewsItems(news);
      console.log(`[SUCCESS] Cached ${news.length} real news items in database`);
    }

    const btcFlows = await getETFFlows('BTC', 7);
    const ethFlows = await getETFFlows('ETH', 7);
    await cacheEtfFlows(btcFlows, 'BTC');
    await cacheEtfFlows(ethFlows, 'ETH');
    console.log('[SUCCESS] Cached ETF flows in database');

    const sectors = await getSectorPerformance();
    await cacheSectors(sectors);
    console.log('[SUCCESS] Cached sector performance in database');

    console.log('[TEMP] Updating narrative temperatures...');
    const temps = await updateNarrativeTemperatures();
    console.log('[TEMP] Current narrative temperatures:', temps);

    // Generate first real stories from live data, unless recent ones exist:
    // a worker host restarts on every deploy, which would otherwise publish duplicates
    const latestRows = await query(
      `SELECT type, MAX(published_at) as latest FROM stories WHERE type IN ('pulse', 'deep_dive') GROUP BY type`
    );
    const latest = Object.fromEntries(latestRows.map(row => [row.type, row.latest]));

    if (hoursSince(latest.pulse) >= 4) {
      console.log('[PUBLISH] Generating Market Pulse from live data...');
      await generateAndPublishMarketPulse();
    } else {
      console.log('[SYNC] Skipping startup Market Pulse: one was published in the last 4 hours.');
    }

    if (hoursSince(latest.deep_dive) >= 24) {
      console.log('[PUBLISH] Generating Daily Deep Dive from live data...');
      await generateAndPublishDailyDeepDive();
    } else {
      console.log('[SYNC] Skipping startup Deep Dive: one was published in the last 24 hours.');
    }
  } catch (err) {
    console.error('[ERROR] Failed running initial sync:', err);
  }
}


/**
 * Prunes historical news items and ETF flows older than their TTL.
 */
export async function runPruningCycle() {
  console.log('[INFO] Initiating database cache pruning cycle...');
  try {
    const newsTtlHours = Number(process.env.NEWS_TTL_HOURS) || 48;
    const flowsTtlHours = Number(process.env.ETF_FLOWS_TTL_HOURS) || 24;
    const newsResult = await execute(`DELETE FROM news_items WHERE fetched_at < datetime('now', '-${newsTtlHours} hours')`);
    const flowsResult = await execute(`DELETE FROM etf_flows WHERE fetched_at < datetime('now', '-${flowsTtlHours} hours')`);

    console.log(`[SUCCESS] Database cache successfully pruned. News affected: ${newsResult.rowsAffected}, Flows affected: ${flowsResult.rowsAffected}`);
  } catch (err) {
    console.error('[ERROR] Failed running database cache pruning cycle:', err);
  }
}

// 1. Fetch AI news feed every hour (0 * * * *)

const hourlyNewsJob = cron.schedule('0 * * * *', () => jobTracker.runExclusive('hourlyNewsCycle', async () => {
  console.log('[SCHEDULER] Running hourly news fetch and narrative intelligence cycle...');
  try {
    const news = await getAINewsFeed(50);
    await cacheNewsItems(news);
    console.log(`[PUBLISH] Fetched and cached news feed. Items: ${news ? news.length : 0}`);

    if (news && news.length > 0) {
      console.log('[AI] Classifying news items via OpenAI...');
      try {
        const classifications = await classifyNewsBatch(news);
        
        // Gather current market context
        const btcFlows = await getETFFlows('BTC', 1);
        const ethFlows = await getETFFlows('ETH', 1);
        const btcFlowStr = btcFlows && btcFlows[0] ? `$${(btcFlows[0].netFlow / 1e6).toFixed(1)}M` : 'N/A';
        const ethFlowStr = ethFlows && ethFlows[0] ? `$${(ethFlows[0].netFlow / 1e6).toFixed(1)}M` : 'N/A';
        const sectors = await getSectorPerformance();
        
        const currentTemps = {};
        const latestTemps = await query(
          `SELECT nh.narrative_id, nh.temperature
           FROM narrative_history nh
           INNER JOIN (
             SELECT narrative_id, MAX(recorded_at) as max_recorded
             FROM narrative_history
             GROUP BY narrative_id
           ) latest ON nh.narrative_id = latest.narrative_id AND nh.recorded_at = latest.max_recorded`
        );
        for (const t of latestTemps) {
          currentTemps[t.narrative_id] = t.temperature;
        }

        const marketContext = {
          btcFlow: btcFlowStr,
          ethFlow: ethFlowStr,
          sectorPerf: sectors ? sectors.map(s => ({ sector: s.displayName, change_24h: s.performance7d })) : [],
          temps: currentTemps
        };

        for (const item of news) {
          const clsType = classifications[item.id] || 'news';
          if (clsType !== 'news') {
            const storyId = `${clsType}_${item.id}`;
            // Check if already exists in stories
            const existing = await query('SELECT 1 FROM stories WHERE id = ?', [storyId]);
            if (existing.length === 0) {
              console.log(`[AI] Promoting high-signal news "${item.title}" to ${clsType.toUpperCase()} story...`);
              const body = await generateStoryFromNewsItem(clsType, item, marketContext);
              
              let title = item.title;
              const lines = body.split('\n');
              const firstLine = lines[0]?.trim() || '';
              if (firstLine.startsWith('#')) {
                title = firstLine.replace(/^#+\s*/, '');
              }

              const summary = item.summary || item.title;
              const publishedAt = item.publishedAt || new Date().toISOString();

              await execute(
                `INSERT INTO stories (id, type, title, body, summary, chart_data, narrative_state, published_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  storyId,
                  clsType,
                  title,
                  body,
                  summary,
                  JSON.stringify({ etf_flows: [], sectors: [] }),
                  JSON.stringify(currentTemps),
                  publishedAt
                ]
              );

              // Broadcast if SSE is active
              if (global.broadcastStory) {
                global.broadcastStory({
                  id: storyId,
                  type: clsType,
                  title,
                  body,
                  summary,
                  chart_data: { etf_flows: [], sectors: [] },
                  narrative_state: currentTemps,
                  published_at: publishedAt
                });
              }
            }
          }
        }
      } catch (clsErr) {
        console.error('Error during OpenAI news classification/promotion:', clsErr);
      }
    }
    
    console.log('[TEMP] Updating narrative temperatures...');
    const temps = await updateNarrativeTemperatures();
    console.log('[TEMP] Current narrative temperatures:', temps);
    
    console.log('[ALERT] Running shift detection and trading check...');
    await checkMarketAndTrade(temps);
  } catch (error) {
    console.error('[ERROR] Error in hourly news and narrative cycle:', error);
  }
}), cronOptions('hourlyNewsCycle'));

// 2. Fetch ETF flows every 4 hours (0 */4 * * *)
const etfFlowsJob = cron.schedule('0 */4 * * *', () => jobTracker.runExclusive('etfFlows', async () => {
  console.log('[SCHEDULER] Running 4-hourly ETF flows fetch...');
  try {
    const btcFlows = await getETFFlows('BTC');
    const ethFlows = await getETFFlows('ETH');
    await cacheEtfFlows(btcFlows, 'BTC');
    await cacheEtfFlows(ethFlows, 'ETH');
    console.log(`[STATS] ETF flows fetched. BTC records: ${btcFlows ? btcFlows.length : 0}, ETH records: ${ethFlows ? ethFlows.length : 0}`);
  } catch (error) {
    console.error('[ERROR] Error in ETF flows fetch job:', error);
  }
}), cronOptions('etfFlows'));

// 3. Fetch Sector performance every 4 hours (0 */4 * * *)
const sectorPerformanceJob = cron.schedule('0 */4 * * *', () => jobTracker.runExclusive('sectorPerformance', async () => {
  console.log('[SCHEDULER] Running 4-hourly sector performance fetch...');
  try {
    const sectors = await getSectorPerformance();
    await cacheSectors(sectors);
    console.log(`[SECTORS] Sector performance fetched. Records: ${sectors ? sectors.length : 0}`);
  } catch (error) {
    console.error('[ERROR] Error in sector performance fetch job:', error);
  }
}), cronOptions('sectorPerformance'));

// 4. Generate Market Pulse every 4 hours (0 */4 * * *)
const marketPulseJob = cron.schedule('0 */4 * * *', () => jobTracker.runExclusive('marketPulse', async () => {
  console.log('[SCHEDULER] Running 4-hourly Market Pulse generation trigger...');
  try {
    await generateAndPublishMarketPulse();
  } catch (error) {
    console.error('[ERROR] Error in Market Pulse trigger job:', error);
  }
}), cronOptions('marketPulse'));

// 5. Generate Daily Deep Dive daily at 08:00 UTC (0 8 * * *)
const dailyDeepDiveJob = cron.schedule('0 8 * * *', () => jobTracker.runExclusive('dailyDeepDive', async () => {
  console.log('[SCHEDULER] Running daily Deep Dive generation trigger (08:00 UTC)...');
  try {
    await generateAndPublishDailyDeepDive();
    console.log('[SCHEDULER] Triggering Telegram Daily Digest Alert...');
    await sendDailyDigestAlert();
  } catch (error) {
    console.error('[ERROR] Error in Daily Deep Dive trigger job:', error);
  }
}), cronOptions('dailyDeepDive'));

// 6. Monitor Stop Losses every 5 minutes (*/5 * * * *)
const stopLossMonitoringJob = cron.schedule('*/5 * * * *', () => jobTracker.runExclusive('stopLossMonitoring', async () => {
  console.log('[SCHEDULER] Running 5-minute stop-loss monitoring job...');
  try {
    await executeStopLossMonitoring();
  } catch (error) {
    console.error('[ERROR] Error in stop-loss monitoring job:', error);
  }
}), cronOptions('stopLossMonitoring'));


// 7. Prune cache every 24 hours at 00:00 UTC (0 0 * * *)
const pruningJob = cron.schedule('0 0 * * *', () => jobTracker.runExclusive('pruning', async () => {
  console.log('[INFO] Running 24-hourly database pruning job...');
  try {
    await runPruningCycle();
  } catch (error) {
    console.error('[ERROR] Error in database pruning job:', error);
  }
}), cronOptions('pruning'));

if (process.env.NODE_ENV !== 'test') {
  // Start all jobs
  hourlyNewsJob.start();
  etfFlowsJob.start();
  sectorPerformanceJob.start();
  marketPulseJob.start();
  dailyDeepDiveJob.start();
  stopLossMonitoringJob.start();
  pruningJob.start();

  // Run the initial sync in the background
  jobTracker.runExclusive('initialSync', runInitialSync);

  console.log('[SCHEDULER] All cron schedules successfully started!');
} else {
  console.log('[SCHEDULER] Running in test environment - cron jobs and initial sync disabled on import');
}

/**
 * Stops every cron schedule (jobs already running are left to finish; see jobTracker.waitForIdle).
 */
export function stopAllJobs() {
  for (const job of [hourlyNewsJob, etfFlowsJob, sectorPerformanceJob, marketPulseJob, dailyDeepDiveJob, stopLossMonitoringJob, pruningJob]) {
    job.stop();
  }
}

const scheduler = {
  hourlyNewsJob,
  etfFlowsJob,
  sectorPerformanceJob,
  marketPulseJob,
  dailyDeepDiveJob,
  stopLossMonitoringJob,
  pruningJob,
  runInitialSync,
  runPruningCycle,
  stopAllJobs,
  jobTracker
};

export default scheduler;
