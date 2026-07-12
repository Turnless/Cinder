'use client';

import React from 'react';
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

export default function ShiftAlert({ shift, threshold = 80 }) {
  if (!shift) return null;

  const confidence = parseFloat(shift.confidence || 0);
  const isHighConfidence = confidence >= threshold;

  // Render standard state if confidence is not high enough for a trade alert
  if (!isHighConfidence) {
    return (
      <div 
        className="clay-glass" 
        style={{ 
          padding: 'var(--space-md)', 
          textAlign: 'center', 
          fontSize: '0.75rem', 
          color: 'var(--color-sage)',
          borderRadius: '12px'
        }}
      >
        Last shift confidence was <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{confidence.toFixed(1)}%</span> — below the trade threshold of <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{threshold}%</span>. No trade was placed.
      </div>
    );
  }

  const fromMeta = NARRATIVE_META[shift.from_narrative] || { name: shift.from_narrative, color: 'var(--color-sage)' };
  const toMeta = NARRATIVE_META[shift.to_narrative] || { name: shift.to_narrative, color: 'var(--color-data-blue)' };

  let signalsArray = [];
  if (shift.signals) {
    try {
      signalsArray = typeof shift.signals === 'string' ? JSON.parse(shift.signals) : shift.signals;
    } catch (e) {
      signalsArray = [shift.signals];
    }
  }

  return (
    <motion.div 
      className="clay-glass"
      style={{
        padding: 'var(--space-lg)',
        border: '2px solid var(--color-shift-red)',
        boxShadow: '6px 6px 16px var(--clay-shadow-dark), -4px -4px 12px var(--clay-shadow-light), 0 0 24px rgba(239, 68, 68, 0.16)',
        position: 'relative',
        overflow: 'hidden'
      }}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      {/* Live Execution indicator */}
      <div 
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          color: 'var(--color-shift-red)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.68rem',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em'
        }}
      >
        <span 
          style={{ 
            width: '6px', 
            height: '6px', 
            borderRadius: '50%', 
            backgroundColor: 'var(--color-shift-red)',
            animation: 'pulse-live 1.8s ease-in-out infinite'
          }} 
        />
        Active
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: 'var(--space-md)' }}>
        <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--color-shift-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Market Shift Detected
        </h4>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)' }}>
          The market narrative changed with {confidence.toFixed(1)}% confidence, crossing the {threshold}% threshold required to place a trade.
        </p>
      </div>

      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr', 
          gap: 'var(--space-md)', 
          backgroundColor: 'rgba(60, 61, 55, 0.2)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '8px', 
          padding: '12px',
          marginBottom: 'var(--space-md)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Previous</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-linen)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: fromMeta.color }} />
            {fromMeta.name}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-sm)' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-data-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Now Active</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-data-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: toMeta.color }} />
            {toMeta.name}
          </span>
        </div>
      </div>

      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px', 
          marginBottom: 'var(--space-md)', 
          fontSize: '0.75rem',
          fontFamily: 'var(--font-body)'
        }}
      >
        <div>
          <span style={{ color: 'var(--color-sage)' }}>Confidence Level:</span>{' '}
          <span style={{ color: 'var(--color-pulse-green)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {confidence.toFixed(1)}%
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--color-sage)' }}>Detected At:</span>{' '}
          <span style={{ color: 'var(--color-linen)', fontFamily: 'var(--font-mono)' }}>
            {new Date(shift.detected_at).toLocaleString('en-US', { hour12: false })}
          </span>
        </div>
        {shift.trade_id && (
          <div>
            <span style={{ color: 'var(--color-sage)' }}>Action Taken:</span>{' '}
            <span style={{ color: 'var(--color-data-blue)', fontWeight: 700 }}>
              ORDER PLACED
            </span>
          </div>
        )}
      </div>

      {signalsArray && signalsArray.length > 0 && (
        <div style={{ paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--glass-border)' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontFamily: 'var(--font-body)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Why this trade was made
          </span>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {signalsArray.map((sig, idx) => (
              <li 
                key={idx} 
                style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--color-sage)', 
                  display: 'flex', 
                  alignItems: 'start', 
                  gap: '6px',
                  marginBottom: '4px'
                }}
              >
                <span style={{ color: 'var(--color-shift-red)', fontWeight: 700 }}>•</span>
                <span>{sig}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
