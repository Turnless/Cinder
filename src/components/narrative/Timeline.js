'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

const NARRATIVE_META = {
  'NAR_01': { name: 'Institutional Accumulation', color: 'var(--color-wire-gold)' },
  'NAR_02': { name: 'Retail FOMO', color: 'var(--color-alert-amber)' },
  'NAR_03': { name: 'Regulatory Storm', color: 'var(--color-shift-red)' },
  'NAR_04': { name: 'AI/Tech Rotation', color: 'var(--color-data-blue)' },
  'NAR_05': { name: 'DeFi Renaissance', color: 'var(--color-pulse-green)' },
  'NAR_06': { name: 'Risk-Off Flight', color: 'var(--color-sage)' },
  'NAR_07': { name: 'L2/Infra Cycle', color: 'var(--color-data-blue)' },
  'NAR_08': { name: 'Black Swan', color: 'var(--color-shift-red)' }
};

export default function Timeline({ shifts = [] }) {
  if (!shifts || shifts.length === 0) {
    return (
      <div className="clay-glass" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-sage)' }}>
          No shifts on record yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', marginTop: 'var(--space-md)' }}>
      {/* Horizontal Scrollable Timeline Wrapper */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 'var(--space-lg)',
          overflowX: 'auto',
          paddingBottom: 'var(--space-md)',
          paddingTop: 'var(--space-xs)',
          position: 'relative',
          zIndex: 2
        }}
      >
        {shifts.map((shift, idx) => {
          const fromMeta = NARRATIVE_META[shift.from_narrative] || { name: shift.from_narrative, color: 'var(--color-sage)' };
          const toMeta = NARRATIVE_META[shift.to_narrative] || { name: shift.to_narrative, color: 'var(--color-data-blue)' };
          const formattedDate = new Date(shift.detected_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          const isHighConfidence = shift.confidence >= 80;
          const signalsParsed = typeof shift.signals === 'string' 
            ? JSON.parse(shift.signals) 
            : (shift.signals || []);

          return (
            <motion.div
              key={shift.id || idx}
              className="clay-glass"
              style={{
                flexShrink: 0,
                width: '320px',
                padding: 'var(--space-lg)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.28s var(--ease-spring)'
              }}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              whileHover={{ y: -3 }}
            >
              {/* Date & Confidence Marker */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-sage)', fontWeight: 500 }}>
                  {formattedDate}
                </span>
                <span 
                  style={{ 
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: isHighConfidence ? 'rgba(74, 222, 128, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                    color: isHighConfidence ? 'var(--color-pulse-green)' : 'var(--color-alert-amber)',
                    border: '1px solid',
                    borderColor: isHighConfidence ? 'rgba(74, 222, 128, 0.25)' : 'rgba(245, 158, 11, 0.25)'
                  }}
                >
                  {shift.confidence.toFixed(0)}% CONF
                </span>
              </div>

              {/* Path of Shift */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: fromMeta.color }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-sage)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {fromMeta.name}
                  </span>
                </div>
                <div style={{ paddingLeft: '16px', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-wire-gold)', letterSpacing: '0.05em' }}>
                  SHIFT TO
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: toMeta.color }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-linen)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {toMeta.name}
                  </span>
                </div>
              </div>

              {/* Evidence Signals */}
              {signalsParsed && signalsParsed.length > 0 && (
                <div 
                  style={{
                    backgroundColor: 'rgba(60, 61, 55, 0.2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '10px',
                    marginBottom: 'var(--space-md)',
                    flexGrow: 1
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-sage)', letterSpacing: '0.05em', marginBottom: '6px' }}>What triggered it</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {signalsParsed.slice(0, 3).map((sig, sigIdx) => (
                      <li 
                        key={sigIdx} 
                        style={{ 
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.72rem', 
                          color: 'var(--color-sage)', 
                          lineHeight: 1.4, 
                          display: 'flex', 
                          alignItems: 'start', 
                          gap: '6px',
                          marginBottom: '4px'
                        }}
                      >
                        <span style={{ color: 'var(--color-wire-gold)', flexShrink: 0 }}>•</span>
                        <span>{sig}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bottom Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'auto' }}>
                {shift.story_id ? (
                  <Link 
                    href={`/story/${shift.story_id}`}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      backgroundColor: 'rgba(236, 223, 204, 0.05)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '8px 0',
                      color: 'var(--color-linen)'
                    }}
                  >
                    Read Report
                  </Link>
                ) : (
                  <div 
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      backgroundColor: 'transparent',
                      border: '1px dashed var(--glass-border)',
                      borderRadius: '8px',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      color: 'var(--color-sage)',
                      padding: '8px 0'
                    }}
                  >
                    No Report
                  </div>
                )}
                
                {shift.trade_id ? (
                  <Link 
                    href="/portfolio"
                    style={{
                      backgroundColor: 'rgba(96, 165, 250, 0.12)',
                      border: '1px solid rgba(96, 165, 250, 0.3)',
                      color: 'var(--color-data-blue)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '8px 16px',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}
                  >
                    Trade
                  </Link>
                ) : (
                  <div 
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      color: 'var(--color-sage)',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      textAlign: 'center'
                    }}
                  >
                    Ignored
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
