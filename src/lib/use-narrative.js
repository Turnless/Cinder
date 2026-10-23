'use client';

import { useEffect, useState } from 'react';
import { NARRATIVE_NAMES } from './narratives';

/**
 * Turns the narrative API response into rows sorted hottest first,
 * with the change since each narrative's previous hourly reading.
 */
export function buildTemperatureRows(temperatures = {}, history = []) {
  return Object.entries(temperatures)
    .map(([id, reading]) => {
      // Oldest first; the API returns the most recent 100 readings across all narratives
      const series = history
        .filter(h => h.narrative_id === id)
        .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1))
        .map(h => h.temperature);
      const previous = history
        .filter(h => h.narrative_id === id && h.recorded_at < reading.recordedAt)
        .sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))[0];
      return {
        id,
        name: NARRATIVE_NAMES[id] || id,
        temperature: Math.round(reading.temperature),
        change: previous ? Math.round(reading.temperature - previous.temperature) : null,
        recordedAt: reading.recordedAt,
        scores: {
          news: Math.round(reading.newsScore ?? 0),
          flows: Math.round(reading.flowScore ?? 0),
          sectors: Math.round(reading.sectorScore ?? 0)
        },
        series
      };
    })
    .sort((a, b) => b.temperature - a.temperature);
}

/**
 * Loads /api/narrative once (and every `refreshMs` if given).
 * @returns {{status: 'loading'|'ready'|'empty'|'error', rows: Array, readAt: string|null, risk: Object|null, shifts: Array}}
 */
export function useNarrative(refreshMs = 0) {
  const [state, setState] = useState({ status: 'loading', rows: [], readAt: null, risk: null, shifts: [] });

  useEffect(() => {
    let cancelled = false;

    const load = () => fetch('/api/narrative')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (!data.success) throw new Error(data.error);
        const rows = buildTemperatureRows(data.temperatures, data.history);
        const readAt = rows.reduce((latest, row) => (row.recordedAt > latest ? row.recordedAt : latest), '') || null;
        setState({
          status: rows.length ? 'ready' : 'empty',
          rows,
          readAt,
          risk: data.riskConfig || null,
          shifts: data.shifts || []
        });
      })
      .catch(() => {
        // Keep showing the last good reading on a failed refresh
        if (!cancelled) setState(prev => (prev.status === 'ready' ? prev : { ...prev, status: 'error' }));
      });

    load();
    const timer = refreshMs > 0 ? setInterval(load, refreshMs) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [refreshMs]);

  return state;
}
