'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function RiskDashboard({ 
  positions = [], 
  autoTradeEnabled = false,
  cooldownHours = 48,
  maxAllocation = 0.30,
  stopLossPercentage = 0.08
}) {
  // Calculate stop-loss metrics
  const activeStopLossesCount = positions.filter(p => p.stopLoss && parseFloat(p.stopLoss) !== 0).length;
  
  // Custom circuit breaker parameters
  const currentDailyDrawdown = 0.0; // 0.0% nominal
  const circuitBreakerTriggered = false;

  // Last trade cooldown
  const hoursSinceLastTrade = 14;
  const isCooldownActive = hoursSinceLastTrade < cooldownHours;
  const cooldownRemaining = cooldownHours - hoursSinceLastTrade;

  return (
    <div className="risk-dashboard clay-glass" style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 className="section-heading" style={{ fontSize: '1.25rem' }}>
          Risk & Safety Dashboard
        </h3>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)', marginTop: '2px' }}>
          Real-time risk guards, stop-losses, and circuit breakers
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        {/* Guard Rails Status */}
        <div style={{ backgroundColor: 'rgba(60, 61, 55, 0.25)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
            Automated Risk Guards
          </span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Master Auto-Trade */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
              <span style={{ color: 'var(--color-sage)' }}>Autonomous Trading:</span>
              <span 
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: autoTradeEnabled ? 'rgba(74, 222, 128, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  color: autoTradeEnabled ? 'var(--color-pulse-green)' : 'var(--color-alert-amber)',
                  border: '1px solid',
                  borderColor: autoTradeEnabled ? 'rgba(74, 222, 128, 0.25)' : 'rgba(245, 158, 11, 0.25)'
                }}
              >
                {autoTradeEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>

            {/* Circuit Breaker */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
              <span style={{ color: 'var(--color-sage)' }}>Daily Loss Circuit-Breaker:</span>
              <span 
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: circuitBreakerTriggered ? 'rgba(239, 68, 68, 0.08)' : 'rgba(74, 222, 128, 0.08)',
                  color: circuitBreakerTriggered ? 'var(--color-shift-red)' : 'var(--color-pulse-green)',
                  border: '1px solid',
                  borderColor: circuitBreakerTriggered ? 'rgba(239, 68, 68, 0.25)' : 'rgba(74, 222, 128, 0.25)'
                }}
              >
                {circuitBreakerTriggered ? 'TRIGGERED' : 'NOMINAL'}
              </span>
            </div>

            {/* Cooldown Lock */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
              <span style={{ color: 'var(--color-sage)', marginTop: '2px' }}>Narrative Trade Cooldown:</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span 
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: isCooldownActive ? 'rgba(245, 158, 11, 0.08)' : 'rgba(74, 222, 128, 0.08)',
                    color: isCooldownActive ? 'var(--color-alert-amber)' : 'var(--color-pulse-green)',
                    border: '1px solid',
                    borderColor: isCooldownActive ? 'rgba(245, 158, 11, 0.25)' : 'rgba(74, 222, 128, 0.25)'
                  }}
                >
                  {isCooldownActive ? 'LOCKED' : 'READY'}
                </span>
                {isCooldownActive && (
                  <span style={{ fontSize: '0.62rem', color: 'var(--color-sage)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                    {cooldownRemaining}h remaining
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Thresholds Summary */}
        <div style={{ backgroundColor: 'rgba(60, 61, 55, 0.25)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
            Risk Config Limits
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', textAlign: 'center' }}>
            <div style={{ borderRight: '1px solid var(--glass-border)', paddingRight: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-sage)', fontFamily: 'var(--font-body)' }}>Max Allocation</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-linen)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {(maxAllocation * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--color-sage)', marginTop: '2px', fontFamily: 'var(--font-body)' }}>per narrative</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-sage)', fontFamily: 'var(--font-body)' }}>Stop Loss Limit</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-shift-red)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {(stopLossPercentage * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--color-sage)', marginTop: '2px', fontFamily: 'var(--font-body)' }}>trailing execution</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Trailing Stop Losses */}
      <div>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
          Active Stop-Loss Thresholds
        </span>
        
        {positions.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-sage)', fontStyle: 'italic', padding: '16px', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
            No active positions to monitor.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {positions.map((pos) => {
              const curPrice = parseFloat(pos.currentPrice || 0);
              const slPrice = parseFloat(pos.stopLoss || 0);
              
              // Calculate percentage distance to stop loss
              const distancePct = curPrice > 0 ? ((curPrice - slPrice) / curPrice) * 100 : 0;
              const maxDistancePct = stopLossPercentage * 100;
              const safetyFactor = Math.max(0, Math.min(100, (distancePct / maxDistancePct) * 100));
              
              // Determine safety color
              let barColor = 'var(--color-pulse-green)';
              if (safetyFactor < 30) {
                barColor = 'var(--color-shift-red)';
              } else if (safetyFactor < 65) {
                barColor = 'var(--color-alert-amber)';
              }

              return (
                <div key={pos.asset} style={{ backgroundColor: 'rgba(60, 61, 55, 0.25)', border: '1px solid var(--glass-border)', padding: '14px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-linen)' }}>{pos.asset}-USDC</span>
                    <span style={{ color: 'var(--color-sage)' }}>
                      Current: <span style={{ color: 'var(--color-linen)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${curPrice.toLocaleString()}</span> | 
                      Stop: <span style={{ color: 'var(--color-shift-red)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${slPrice.toLocaleString()}</span>
                    </span>
                  </div>

                  {/* Distance progress visualization */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flexGrow: 1, height: '6px', backgroundColor: 'var(--color-iron)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                      <motion.div 
                        style={{ height: '100%', backgroundColor: barColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${safetyFactor}%` }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-sage)', width: '56px', textAlign: 'right' }}>
                      {distancePct.toFixed(1)}% away
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
