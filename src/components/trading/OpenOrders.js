'use client';

import { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { cancelSpotOrder } from '../../lib/sodex-browser';
import { batchError, marketLabels } from '../../lib/sodex-orders';

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatQuantity = (n) => parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 8 });

/**
 * Limit orders still waiting on the book, each with a Cancel button.
 * @param {{orders: Array, symbols: Array, onChange?: Function}} props
 */
export default function OpenOrders({ orders = [], symbols = [], onChange }) {
  const { network, tradingKey, tradingReady } = useWallet();
  const [cancelling, setCancelling] = useState(null);
  const [message, setMessage] = useState(null);

  const handleCancel = async (order) => {
    const symbol = symbols.find(s => s.name === order.symbol);
    setMessage(null);
    if (!tradingReady || !symbol) {
      setMessage({ error: true, text: tradingReady ? 'This market is not available.' : 'Enable trading in the trade panel first.' });
      return;
    }
    setCancelling(order.orderID);
    try {
      const result = await cancelSpotOrder({
        key: tradingKey,
        symbolID: symbol.id,
        origClOrdID: order.clOrdID || undefined,
        orderID: order.orderID,
        network
      });
      const error = batchError(result);
      if (error) throw new Error(error);
      setMessage({ text: 'Order cancelled.' });
      if (onChange) setTimeout(onChange, 1000);
    } catch (err) {
      setMessage({ error: true, text: `SoDEX refused the cancel: ${err.message}` });
    } finally {
      setCancelling(null);
    }
  };

  if (orders.length === 0) {
    return <p className="pf-message">No open orders. Limit orders wait here until they fill or you cancel them.</p>;
  }

  return (
    <>
      <ol className="pf-history">
        {orders.map((order) => {
          const symbol = symbols.find(s => s.name === order.symbol);
          const { base, quote } = symbol ? marketLabels(symbol) : { base: order.symbol, quote: 'USDC' };
          const filled = parseFloat(order.executedQty || 0);

          return (
            <li key={order.orderID} className="pf-history-row">
              <div className="pf-history-main">
                <p className="pf-history-title">
                  {String(order.side).toUpperCase() === 'BUY' ? 'Buy' : 'Sell'} {formatQuantity(order.origQty)} {base} at{' '}
                  {formatAmount(order.price)} {quote}
                </p>
                <p className="pf-history-meta">
                  {filled > 0 ? <span>{formatQuantity(filled)} {base} filled so far</span> : <span>Waiting on the book</span>}
                </p>
              </div>
              <button
                type="button"
                className="pf-cancel"
                onClick={() => handleCancel(order)}
                disabled={cancelling === order.orderID}
              >
                {cancelling === order.orderID ? 'Cancelling' : 'Cancel'}
              </button>
            </li>
          );
        })}
      </ol>
      {message && (
        <p className={`pf-message${message.error ? ' is-error' : ''}`} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </>
  );
}
