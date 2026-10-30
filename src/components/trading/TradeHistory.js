'use client';

import { marketLabels } from '../../lib/sodex-orders';

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatQuantity = (n) => parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 8 });

function formatTime(ms) {
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Fills on the user's SoDEX account, newest first.
 * @param {{trades: Array, symbols: Array}} props - trades as SoDEX returns them (UserTrade)
 */
export default function TradeHistory({ trades = [], symbols = [] }) {
  if (trades.length === 0) {
    return <p className="pf-message">No trades yet. Your fills on SoDEX appear here.</p>;
  }

  return (
    <ol className="pf-history">
      {trades.map((trade) => {
        const isBuy = String(trade.side).toUpperCase() === 'BUY';
        const symbol = symbols.find(s => s.name === trade.symbol);
        const { base, quote } = symbol ? marketLabels(symbol) : { base: trade.symbol, quote: 'USDC' };
        const fee = parseFloat(trade.fee || 0);
        const builderFee = parseFloat(trade.builderFee || 0);
        const date = new Date(Number(trade.time));

        return (
          <li key={trade.tradeID} className="pf-history-row">
            <time className="pf-history-time" dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>
              {formatTime(trade.time)}
            </time>
            <div className="pf-history-main">
              <p className="pf-history-title">
                {isBuy ? 'Bought' : 'Sold'} {formatQuantity(trade.quantity)} {base} at {formatAmount(trade.price)} {quote}
              </p>
              <p className="pf-history-meta">
                <span>{isBuy ? 'Paid' : 'Received'} {formatAmount(parseFloat(trade.price) * parseFloat(trade.quantity))} {quote}</span>
                {fee > 0 && (
                  <span>
                    Fees {formatQuantity(fee)} {String(trade.feeCoin || '').replace(/^v(?=[A-Z])/, '')}
                    {builderFee > 0 ? `, of which Cinder ${formatQuantity(builderFee)}` : ''}
                  </span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
