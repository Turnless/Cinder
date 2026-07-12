'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Header from '../../components/shared/Header';
import BubbleMap from '../../components/narrative/BubbleMap';
import Timeline from '../../components/narrative/Timeline';
import ShiftAlert from '../../components/narrative/ShiftAlert';
import TemperatureGauge from '../../components/narrative/TemperatureGauge';

const NARRATIVE_NAMES = {
  NAR_01: 'Institutional Accumulation',
  NAR_02: 'Retail FOMO',
  NAR_03: 'Regulatory Storm',
  NAR_04: 'AI/Tech Rotation',
  NAR_05: 'DeFi Renaissance',
  NAR_06: 'Risk-Off Flight',
  NAR_07: 'L2/Infra Cycle',
  NAR_08: 'Black Swan',
};

export default function DashboardPage() {
  const [narrativeData, setNarrativeData] = useState({ temperatures: {}, shifts: [] });
  const [tradeData, setTradeData] = useState({ riskConfig: { threshold: 80 } });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const narrRes = await fetch('/api/narrative');
      const narrJson = await narrRes.json();
      if (narrJson.success) {
        setNarrativeData({
          temperatures: narrJson.temperatures || {},
          shifts: narrJson.shifts || []
        });
      }

      const tradeRes = await fetch('/api/trade');
      const tradeJson = await tradeRes.json();
      if (tradeJson.success) {
        setTradeData(tradeJson);
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const latestShift = narrativeData.shifts?.[0];
  const threshold = tradeData.riskConfig?.threshold || 80;

  // Format active narratives list, sorted by temperature descending
  const sortedNarratives = Object.entries(NARRATIVE_NAMES).map(([id, name]) => {
    const data = narrativeData.temperatures[id] || { temperature: 0, recordedAt: new Date().toISOString() };
    return {
      id,
      name,
      temperature: data.temperature,
      recordedAt: data.recordedAt
    };
  }).sort((a, b) => b.temperature - a.temperature);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-obsidian)' }}>
      <Header />
      
      <div className="container" style={{ padding: 'var(--space-xl) var(--space-lg)' }}>
        {/* Dashboard Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
          <div>
            <h1 className="section-heading">Narrative Intelligence</h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-sage)', marginTop: 'var(--space-xs)' }}>
              Tracks which market narratives are gaining or losing momentum based on ETF flows and sector data.
            </p>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-wire-gold)', fontWeight: 700 }}>
              Loading...
            </div>
          )}
        </div>

        {/* Dashboard Grid */}
        <div className="dashboard-grid">
          {/* Left Column: Bubble Map */}
          <div className="main-viz">
            <div className="clay-glass bubble-map-panel">
              <div className="bubble-map-title">Narrative Heat Map</div>
              <BubbleMap temperatures={narrativeData.temperatures} />
            </div>
          </div>

          {/* Right Column: Active Narratives List */}
          <div className="alert-side">
            {latestShift && (
              <ShiftAlert shift={latestShift} threshold={threshold} />
            )}
            
            <div className="active-narratives-list">
              <h3 className="section-heading" style={{ fontSize: '1.1rem', marginBottom: 'var(--space-sm)' }}>Market Narratives</h3>
              {sortedNarratives.map((nar) => {
                // Determine Trend Arrow Icon based on temp range:
                // >80 is spike (red), >50 is up (gold), else down (sage)
                let trendIcon = '▼';
                let trendColor = 'var(--color-sage)';
                if (nar.temperature >= 80) {
                  trendIcon = '▲';
                  trendColor = 'var(--color-shift-red)';
                } else if (nar.temperature >= 50) {
                  trendIcon = '▲';
                  trendColor = 'var(--color-wire-gold)';
                }

                const lastUpdatedDate = new Date(nar.recordedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                });

                return (
                  <div key={nar.id} className="clay-glass narrative-card">
                    <div className="narrative-card-info">
                      <div className="narrative-card-name">{nar.name}</div>
                      <div className="narrative-card-meta">
                        Updated {lastUpdatedDate} • <span style={{ color: trendColor }}>{trendIcon}</span>
                      </div>
                    </div>
                    
                    <div className="narrative-card-right">
                      <TemperatureGauge temperature={nar.temperature} diameter={80} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Timeline Section */}
        <div className="timeline-section clay-glass" style={{ padding: 'var(--space-lg)' }}>
          <h3 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 'var(--space-md)' }}>Shift History</h3>
          <Timeline shifts={narrativeData.shifts} />
        </div>

        {/* Shift History Log Table */}
        <div className="shift-history-section clay-glass" style={{ padding: 'var(--space-lg)', marginTop: 'var(--space-xl)' }}>
          <h3 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 'var(--space-md)' }}>Trade & Shift Log</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Confidence</th>
                  <th>Report</th>
                  <th>Trade</th>
                </tr>
              </thead>
              <tbody>
                {narrativeData.shifts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-sage)' }}>No shifts logged yet.</td>
                  </tr>
                ) : (
                  narrativeData.shifts.map((shift) => {
                    const shiftDate = new Date(shift.detected_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    });
                    
                    return (
                      <tr key={shift.id}>
                        <td className="data-mono">{shiftDate}</td>
                        <td>{NARRATIVE_NAMES[shift.from_narrative] || shift.from_narrative}</td>
                        <td style={{ fontWeight: 600, color: 'var(--color-wire-gold)' }}>
                          {NARRATIVE_NAMES[shift.to_narrative] || shift.to_narrative}
                        </td>
                        <td className="data-mono" style={{ color: shift.confidence >= threshold ? 'var(--color-pulse-green)' : 'var(--color-sage)' }}>
                          {shift.confidence.toFixed(1)}%
                        </td>
                        <td>
                          {shift.story_id ? (
                            <Link href={`/story/${shift.story_id}`} style={{ color: 'var(--color-data-blue)', textDecoration: 'underline' }}>
                              View Report
                            </Link>
                          ) : (
                            <span style={{ color: 'var(--color-sage)' }}>N/A</span>
                          )}
                        </td>
                        <td>
                          {shift.trade_id ? (
                            <span className="data-mono" style={{ color: 'var(--color-pulse-green)' }}>
                              Executed
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-sage)' }}>Ignored</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
