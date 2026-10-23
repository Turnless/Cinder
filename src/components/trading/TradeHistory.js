'use client';

import Link from 'next/link';

const STATUS_LABELS = {
  filled: 'Filled',
  simulated: 'Simulated',
  stopped: 'Stopped out',
  closed: 'Closed',
  cancelled: 'Cancelled',
  new: 'Pending',
  pending: 'Pending'
};

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatQuantity = (n) => parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

// SQLite datetime('now') values carry no zone but are UTC
function parseTime(value) {
  if (!value) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(String(value).trim());
  const date = new Date(hasZone ? value : String(value).trim().replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = parseTime(value);
  if (!date) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Every trade for this wallet, newest first.
 * @param {{trades: Array}} props
 */
export default function TradeHistory({ trades = [] }) {
  if (trades.length === 0) {
    return <p className="pf-message">No trades yet. Your orders and any automatic trades for this wallet appear here.</p>;
  }

  return (
    <ol className="pf-history">
      {trades.map((trade, idx) => {
        const isBuy = String(trade.side).toLowerCase() === 'buy';
        const asset = String(trade.pair || '').split('-')[0];
        const status = String(trade.status || '').toLowerCase();

        return (
          <li key={trade.id || idx} className="pf-history-row">
            <time className="pf-history-time" dateTime={parseTime(trade.created_at)?.toISOString()}>
              {formatTime(trade.created_at)}
            </time>
            <div className="pf-history-main">
              <p className="pf-history-title">
                {isBuy ? 'Bought' : 'Sold'} {formatQuantity(trade.quantity)} {asset}
                {trade.fill_price ? ` at $${formatAmount(trade.fill_price)}` : ''}
              </p>
              <p className="pf-history-meta">
                <span className={`pf-status is-${status}`}>{STATUS_LABELS[status] || status}</span>
                {isBuy && trade.stop_loss_price && status === 'filled' && (
                  <span>Stop-loss at ${formatAmount(trade.stop_loss_price)}</span>
                )}
                {trade.story_id
                  ? <Link href={`/story/${trade.story_id}`} className="pf-link">Read the story behind it</Link>
                  : <span>Placed by you</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
