import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { updateNarrativeTemperatures } from '../../../engine/narrative';
import { rateLimit } from '../../../lib/rate-limiter';
import { hasValidInternalSecret } from '../../../lib/secrets';
import { getRiskConfig } from '../../../lib/risk-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/narrative
 * Retrieves current narrative temperatures and historical regime shift records.
 */
export async function GET(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateResult = rateLimit(ip);
    if (!rateResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // Fetch latest temperature reading for each narrative archetype
    const latestTemps = await query(`
      SELECT nh.narrative_id, nh.temperature, nh.news_score, nh.flow_score, nh.sector_score, nh.recorded_at
      FROM narrative_history nh
      INNER JOIN (
          SELECT narrative_id, MAX(recorded_at) as max_recorded
          FROM narrative_history
          GROUP BY narrative_id
      ) latest ON nh.narrative_id = latest.narrative_id AND nh.recorded_at = latest.max_recorded
    `);

    // Fetch narrative shifts history
    const shifts = await query(`
      SELECT id, from_narrative, to_narrative, confidence, signals, story_id, trade_id, detected_at
      FROM narrative_shifts
      ORDER BY detected_at DESC
      LIMIT 50
    `);

    // Fetch narrative temperature history
    const history = await query(`
      SELECT id, narrative_id, temperature, news_score, flow_score, sector_score, recorded_at
      FROM narrative_history
      ORDER BY recorded_at DESC
      LIMIT 100
    `);

    // Format temperatures as a map: { [narrative_id]: { temperature, newsScore, ... } }
    const temperatures = {};
    latestTemps.forEach(row => {
      temperatures[row.narrative_id] = {
        temperature: row.temperature,
        newsScore: row.news_score,
        flowScore: row.flow_score,
        sectorScore: row.sector_score,
        recordedAt: row.recorded_at
      };
    });

    // Parse JSON fields where appropriate
    const formattedShifts = shifts.map(s => {
      let parsedSignals = [];
      try {
        parsedSignals = typeof s.signals === 'string' ? JSON.parse(s.signals) : (s.signals || []);
      } catch (e) {
        parsedSignals = [s.signals];
      }
      return {
        ...s,
        signals: parsedSignals
      };
    });

    return NextResponse.json({
      success: true,
      temperatures,
      shifts: formattedShifts,
      history,
      // Public, display-only: lets the landing page show the live trading limits
      riskConfig: getRiskConfig()
    });
  } catch (error) {
    console.error('Error fetching narrative details in API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/narrative
 * Programmatic trigger to update narrative scores manually.
 * Requires x-internal-api-secret: each call writes a full set of narrative_history rows.
 */
export async function POST(request) {
  try {
    if (!process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ success: false, error: 'Server misconfigured: INTERNAL_API_SECRET not set' }, { status: 500 });
    }
    if (!hasValidInternalSecret(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized: missing or invalid x-internal-api-secret header' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateResult = rateLimit(ip);
    if (!rateResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const updatedTemps = await updateNarrativeTemperatures();
    return NextResponse.json({
      success: true,
      updated: true,
      temperatures: updatedTemps
    });
  } catch (error) {
    console.error('Error updating narrative temperatures manually in API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
