import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  execute: vi.fn().mockResolvedValue({ rowsAffected: 1 })
}));

vi.mock('../sosovalue.js', () => ({
  getAINewsFeed: vi.fn().mockResolvedValue([]),
  getETFFlows: vi.fn().mockResolvedValue([]),
  getSectorPerformance: vi.fn().mockResolvedValue([])
}));

vi.mock('../../engine/narrative.js', () => ({
  updateNarrativeTemperatures: vi.fn().mockResolvedValue({ NAR_01: 50 })
}));

vi.mock('../../engine/trade-engine.js', () => ({
  checkMarketAndTrade: vi.fn(),
  executeStopLossMonitoring: vi.fn(),
  sendDailyDigestAlert: vi.fn()
}));

vi.mock('../openai.js', () => ({
  generateMarketPulse: vi.fn().mockResolvedValue('# Pulse'),
  generateDailyDeepDive: vi.fn().mockResolvedValue('# Deep Dive'),
  classifyNewsBatch: vi.fn(),
  generateStoryFromNewsItem: vi.fn(),
  refineAllNews: vi.fn()
}));

import { query } from '../db.js';
import { generateMarketPulse, generateDailyDeepDive } from '../openai.js';
import scheduler, { runInitialSync } from '../scheduler.js';

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

function latestStories(rows) {
  query.mockImplementation(async (sql) => (sql.includes('MAX(published_at)') ? rows : []));
}

describe('scheduler startup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not start cron jobs when imported in tests', () => {
    // node-cron keeps a pending timeout only while a task is started
    const jobs = ['hourlyNewsJob', 'etfFlowsJob', 'sectorPerformanceJob', 'marketPulseJob', 'dailyDeepDiveJob', 'stopLossMonitoringJob', 'pruningJob'];
    for (const job of jobs) {
      expect(scheduler[job]._scheduler.timeout, job).toBeFalsy();
    }
    expect(scheduler.jobTracker.runningJobs()).toEqual([]);
  });

  it('gives every job its own name and UTC timezone', () => {
    const jobs = ['hourlyNewsJob', 'etfFlowsJob', 'sectorPerformanceJob', 'marketPulseJob', 'dailyDeepDiveJob', 'stopLossMonitoringJob', 'pruningJob'];
    const names = jobs.map(job => scheduler[job].options.name);
    expect(new Set(names).size).toBe(jobs.length);
    for (const job of jobs) {
      expect(scheduler[job].options.timezone).toBe('Etc/UTC');
    }
  });

  it('stopAllJobs stops started schedules', () => {
    scheduler.pruningJob.start();
    expect(scheduler.pruningJob._scheduler.timeout).toBeTruthy();

    scheduler.stopAllJobs();
    expect(scheduler.pruningJob._scheduler.timeout).toBeFalsy();
  });

  it('skips startup stories published recently (e.g. after a redeploy)', async () => {
    latestStories([{ type: 'pulse', latest: hoursAgo(1) }, { type: 'deep_dive', latest: hoursAgo(5) }]);

    await runInitialSync();

    expect(generateMarketPulse).not.toHaveBeenCalled();
    expect(generateDailyDeepDive).not.toHaveBeenCalled();
  });

  it('publishes startup stories when the last ones are old', async () => {
    latestStories([{ type: 'pulse', latest: hoursAgo(5) }, { type: 'deep_dive', latest: hoursAgo(30) }]);

    await runInitialSync();

    expect(generateMarketPulse).toHaveBeenCalledOnce();
    expect(generateDailyDeepDive).toHaveBeenCalledOnce();
  });

  it('publishes startup stories on an empty database', async () => {
    latestStories([]);

    await runInitialSync();

    expect(generateMarketPulse).toHaveBeenCalledOnce();
    expect(generateDailyDeepDive).toHaveBeenCalledOnce();
  });
});
