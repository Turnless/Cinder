'use client';

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/shared/Header';
import Timeline from '../../components/narrative/Timeline';
import ShiftAlert from '../../components/narrative/ShiftAlert';
import TemperatureGauge from '../../components/narrative/TemperatureGauge';
import { useWallet } from '../../context/WalletContext';

const BubbleMap = lazy(() => import('../../components/narrative/BubbleMap'));

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
  const { isConnected, walletChecked, walletAddress } = useWallet();
  const router = useRouter();
  const [narrativeData, setNarrativeData] = useState({ temperatures: {}, shifts: [] });
  const [tradeData, setTradeData] = useState({ riskConfig: { threshold: 80 } });
  const [loading, setLoading] = useState(true);

  // Redirect if disconnected — only after wallet check is complete
  useEffect(() => {
    if (walletChecked && !isConnected) {
      router.push('/');
    }
  }, [isConnected, walletChecked, router]);

  const fetchData = useCallback(async () => {
    try {
      const narrRes = await fetch('/api/narrative');
      const narrJson = await narrRes.json();
      if (narrJson.success) {
        setNarrativeData({
          temperatures: narrJson.temperatures || {},
          shifts: narrJson.shifts || []
        });
      }

      const addressParam = walletAddress ? `?address=${walletAddress}` : '';
      const tradeRes = await fetch(`/api/trade${addressParam}`);
      const tradeJson = await tradeRes.json();
      if (tradeJson.success) {
        setTradeData(tradeJson);
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    // Only poll when connected
    if (!isConnected) return;
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isConnected, fetchData]);

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

  if (!walletChecked || !isConnected) {
    return <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-obsidian)' }} />;
  }

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
              <span className="shimmer-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-wire-gold)', display: 'inline-block' }} />
              Loading...
            </div>
          )}
        </div>

        {/* KPI Cards Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: 'var(--space-xl)' }}>
          {/* Card 1: Dominant Narrative */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease' }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Dominant Regime</div>
              <div style={{ fontSize: '0.92rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-linen)', lineHeight: 1.2 }}>
                {sortedNarratives[0]?.name || 'N/A'}
              </div>
            </div>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-wire-gold)', boxShadow: '0 0 8px var(--color-wire-gold)' }} />
          </motion.div>

          {/* Card 2: Highest Temperature */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease' }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Regime Temperature</div>
              <div style={{ fontSize: '1.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: (sortedNarratives[0]?.temperature || 0) > 80 ? 'var(--color-shift-red)' : 'var(--color-linen)' }}>
                {(sortedNarratives[0]?.temperature || 0).toFixed(1)}&deg;
              </div>
            </div>
            {sortedNarratives[0] && (
              <TemperatureGauge temperature={sortedNarratives[0].temperature} label="" diameter={45} />
            )}
          </motion.div>

          {/* Card 3: Execution Mode */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease' }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Execution State</div>
              <div style={{ fontSize: '1rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: tradeData.autoTradeEnabled ? 'var(--color-pulse-green)' : 'var(--color-alert-amber)' }}>
                {tradeData.autoTradeEnabled ? 'AUTOPILOT' : 'MONITORING'}
              </div>
            </div>
            <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', padding: '4px 8px', borderRadius: '6px', background: tradeData.autoTradeEnabled ? 'rgba(74, 222, 128, 0.08)' : 'rgba(212, 168, 83, 0.08)', color: tradeData.autoTradeEnabled ? 'var(--color-pulse-green)' : 'var(--color-wire-gold)', border: '1px solid rgba(212, 168, 83, 0.15)', fontWeight: 700 }}>
              {tradeData.autoTradeEnabled ? 'ACTIVE' : 'MANUAL'}
            </span>
          </motion.div>

          {/* Card 4: Trade Threshold */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease' }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Trade Trigger Gate</div>
              <div style={{ fontSize: '1.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-linen)' }}>
                {threshold}&deg;
              </div>
            </div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', fontWeight: 600 }}>MIN TEMP</div>
          </motion.div>
        </div>

        {/* Dashboard Grid */}
        <div className="dashboard-grid">
          {/* Left Column: Bubble Map */}
          <div className="main-viz">
            <div className="clay-glass bubble-map-panel">
              <div className="bubble-map-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', color: 'var(--color-linen)', borderBottom: '1px solid rgba(236,223,204,0.08)', paddingBottom: '10px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-wire-gold)' }} />
                Narrative Heat Map
              </div>
              <Suspense fallback={<div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-sage)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Loading heatmap...</div>}>
                <BubbleMap temperatures={narrativeData.temperatures} />
              </Suspense>
            </div>
          </div>

          {/* Right Column: Key Stats & Narrative List */}
          <div className="side-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Regime Shift Alerts */}
            <ShiftAlert shift={latestShift} threshold={threshold} />

            {/* Active Narratives Ranked */}
            <div className="clay-glass active-narratives-card" style={{ padding: '20px', borderRadius: '16px' }}>
              <div className="card-header" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', color: 'var(--color-linen)', borderBottom: '1px solid rgba(236,223,204,0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
                Active Narratives
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sortedNarratives.map((item, idx) => {
                  const isActive = item.temperature >= threshold;
                  return (
                    <motion.div 
                      key={item.id} 
                      className="clay-glass"
                      whileHover={{ scale: 1.01, x: 4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
                      style={{ 
                        padding: '12px 16px', 
                        borderRadius: '12px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        border: '1px solid rgba(236,223,204,0.05)',
                        background: isActive ? 'rgba(212, 168, 83, 0.03)' : 'rgba(30, 32, 30, 0.25)',
                        transition: 'border-color 0.2s ease, background 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-linen)' }}>
                          {item.name}
                        </span>
                        <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)' }}>
                          Rank #{idx + 1}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ 
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.9rem',
                          color: item.temperature > 85 ? 'var(--color-shift-red)' : 
                                 item.temperature > 65 ? 'var(--color-wire-gold)' : 
                                 'var(--color-linen)',
                          fontWeight: 700
                        }}>
                          {item.temperature.toFixed(1)}&deg;
                        </span>
                        <div style={{ 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          backgroundColor: item.temperature > 85 ? 'var(--color-shift-red)' : 
                                           item.temperature > 65 ? 'var(--color-wire-gold)' : 
                                           'var(--color-sage)',
                          boxShadow: item.temperature > 85 ? '0 0 8px var(--color-shift-red)' : 'none'
                        }} />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Narrative Timelines & System Logs */}
        <div className="dashboard-row" style={{ marginTop: 'var(--space-2xl)' }}>
          <h3 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 'var(--space-md)', borderLeft: '4px solid var(--color-wire-gold)', paddingLeft: '16px' }}>
            Historical Regime Timelines
          </h3>
          <Timeline shifts={narrativeData.shifts} />
        </div>

        <div className="dashboard-row" style={{ marginTop: 'var(--space-2xl)' }}>
          <h3 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 'var(--space-md)', borderLeft: '4px solid var(--color-wire-gold)', paddingLeft: '16px' }}>
            Autonomous Execution Logs
          </h3>
          <div className="clay-glass table-container" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Timestamp</th>
                  <th style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Regime Transition</th>
                  <th style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Action Code</th>
                  <th style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Execution Status</th>
                </tr>
              </thead>
              <tbody>
                {narrativeData.shifts.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--color-sage)', padding: '40px 0', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                      No execution logs generated yet. Waiting for market shifts.
                    </td>
                  </tr>
                ) : (
                  narrativeData.shifts.map((shift) => {
                    const dateString = new Date(shift.detected_at).toLocaleString();
                    const hasTrade = !!shift.trade_id;
                    return (
                      <tr key={shift.id} style={{ transition: 'background-color 0.2s ease' }}>
                        <td className="data-mono" style={{ fontSize: '0.75rem' }}>{dateString}</td>
                        <td style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-linen)' }}>
                          <span style={{ opacity: 0.7 }}>{NARRATIVE_NAMES[shift.from_narrative] || shift.from_narrative}</span>
                          <span style={{ color: 'var(--color-wire-gold)', margin: '0 8px' }}>&rarr;</span>
                          <span>{NARRATIVE_NAMES[shift.to_narrative] || shift.to_narrative}</span>
                        </td>
                        <td>
                          {hasTrade ? (
                            <span style={{ 
                              fontFamily: 'var(--font-mono)', 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              background: 'rgba(212, 168, 83, 0.08)', 
                              color: 'var(--color-wire-gold)', 
                              border: '1px solid rgba(212, 168, 83, 0.2)' 
                            }}>
                              REGIME_SHIFT_BUY
                            </span>
                          ) : (
                            <span style={{ 
                              fontFamily: 'var(--font-mono)', 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              background: 'rgba(236, 223, 204, 0.04)', 
                              color: 'var(--color-sage)', 
                              border: '1px solid rgba(236, 223, 204, 0.1)' 
                            }}>
                              RISK_GATE_HOLD
                            </span>
                          )}
                        </td>
                        <td>
                          {hasTrade ? (
                            <span className="data-mono" style={{ 
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              background: 'rgba(74, 222, 128, 0.08)', 
                              color: 'var(--color-pulse-green)', 
                              border: '1px solid rgba(74, 222, 128, 0.2)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <span style={{ 
                                width: '6px', 
                                height: '6px', 
                                borderRadius: '50%', 
                                backgroundColor: 'var(--color-pulse-green)', 
                                display: 'inline-block',
                                boxShadow: '0 0 6px var(--color-pulse-green)',
                                animation: 'pulse 1.5s infinite'
                              }} />
                              Executed
                            </span>
                          ) : (
                            <span style={{ 
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.68rem', 
                              fontWeight: 700, 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              background: 'rgba(239, 68, 68, 0.04)', 
                              color: 'var(--color-sage)', 
                              border: '1px solid rgba(239, 68, 68, 0.1)' 
                            }}>
                              Ignored
                            </span>
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
