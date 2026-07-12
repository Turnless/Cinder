'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function TradeHistory({ trades = [] }) {
  return (
    <div className="trade-history clay-glass" style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h3 className="section-heading" style={{ fontSize: '1.25rem' }}>
            Completed Execution History
          </h3>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)', marginTop: '2px' }}>
            Logs of autonomous and manual trades on SoDEX
          </p>
        </div>
        <span 
          style={{ 
            fontFamily: 'var(--font-mono)', 
            fontSize: '0.72rem', 
            color: 'var(--color-sage)', 
            backgroundColor: 'var(--color-iron)', 
            padding: '4px 10px', 
            borderRadius: 'var(--radius-full)', 
            border: '1px solid var(--glass-border)' 
          }}
        >
          {trades.length} Total Trades
        </span>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Side</th>
              <th>Market</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Fill Price</th>
              <th style={{ textAlign: 'right' }}>Stop Loss</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Story</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', color: 'var(--color-sage)', fontStyle: 'italic', padding: 'var(--space-lg) 0' }}>
                  No execution logs found in the database.
                </td>
              </tr>
            ) : (
              trades.map((trade, idx) => {
                const dateStr = new Date(trade.created_at || Date.now()).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                });

                const isBuy = trade.side.toLowerCase() === 'buy';
                const status = trade.status.toUpperCase();

                let statusColor = 'var(--color-sage)';
                let statusBg = 'rgba(105, 117, 101, 0.08)';
                let statusBorder = 'rgba(105, 117, 101, 0.25)';

                if (status === 'FILLED') {
                  statusColor = 'var(--color-pulse-green)';
                  statusBg = 'rgba(74, 222, 128, 0.08)';
                  statusBorder = 'rgba(74, 222, 128, 0.25)';
                } else if (status === 'STOPPED') {
                  statusColor = 'var(--color-shift-red)';
                  statusBg = 'rgba(239, 68, 68, 0.08)';
                  statusBorder = 'rgba(239, 68, 68, 0.25)';
                } else if (status === 'CANCELLED') {
                  statusColor = 'var(--color-alert-amber)';
                  statusBg = 'rgba(245, 158, 11, 0.08)';
                  statusBorder = 'rgba(245, 158, 11, 0.25)';
                }

                return (
                  <motion.tr
                    key={trade.id || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.5) }}
                  >
                    <td className="data-mono" style={{ color: 'var(--color-sage)' }}>{dateStr}</td>
                    <td>
                      <span 
                        style={{ 
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: isBuy ? 'rgba(74, 222, 128, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          color: isBuy ? 'var(--color-pulse-green)' : 'var(--color-shift-red)',
                          border: '1px solid',
                          borderColor: isBuy ? 'rgba(74, 222, 128, 0.25)' : 'rgba(239, 68, 68, 0.25)'
                        }}
                      >
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--color-linen)' }}>{trade.pair}</td>
                    <td className="data-mono" style={{ textAlign: 'right' }}>{parseFloat(trade.quantity).toFixed(4)}</td>
                    <td className="data-mono" style={{ textAlign: 'right' }}>
                      ${trade.fill_price ? parseFloat(trade.fill_price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                    </td>
                    <td className="data-mono" style={{ textAlign: 'right', color: 'var(--color-sage)' }}>
                      {trade.stop_loss_price ? `$${parseFloat(trade.stop_loss_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'N/A'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span 
                        style={{ 
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.65rem', 
                          fontWeight: 700, 
                          padding: '2px 8px', 
                          borderRadius: 'var(--radius-full)', 
                          border: '1px solid',
                          color: statusColor,
                          backgroundColor: statusBg,
                          borderColor: statusBorder
                        }}
                      >
                        {status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {trade.story_id ? (
                        <Link 
                          href={`/story/${trade.story_id}`}
                          style={{ color: 'var(--color-data-blue)', fontWeight: 600, fontSize: '0.72rem', textDecoration: 'underline' }}
                        >
                          View Coverage
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--color-sage)', fontSize: '0.72rem' }}>System Order</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
