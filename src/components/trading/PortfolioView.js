'use client';

import { Fragment, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { placeSpotOrder, newClientOrderId } from '../../lib/sodex-browser';
import { prepareSpotOrder, batchError, formatFeeRate } from '../../lib/sodex-orders';

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatQuantity = (n) => parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 8 });

/**
 * Coins held on SoDEX, valued at the last price, with a two-step "Sell all" per coin.
 * @param {{holdings: Array<{coin: string, label: string, total: number, available: number,
 *   symbol?: Object, price: number|null, value: number|null}>, onTradeSuccess?: Function}} props
 */
export default function PortfolioView({ holdings = [], onTradeSuccess }) {
  const { network, builder, tradingKey, tradingReady } = useWallet();
  const [confirming, setConfirming] = useState(null);
  const [selling, setSelling] = useState(null);
  const [message, setMessage] = useState(null);

  const handleSellAll = async (holding) => {
    setConfirming(null);
    setMessage(null);
    if (!tradingReady) {
      setMessage({ coin: holding.coin, error: true, text: 'Enable trading in the trade panel first.' });
      return;
    }

    const draft = prepareSpotOrder({
      symbol: holding.symbol,
      side: 'sell',
      type: 'market',
      amount: holding.available,
      lastPrice: holding.price
    });
    if (!draft.ok) {
      setMessage({ coin: holding.coin, error: true, text: draft.error });
      return;
    }

    setSelling(holding.coin);
    try {
      const result = await placeSpotOrder({
        key: tradingKey,
        order: { symbolID: holding.symbol.id, clOrdID: newClientOrderId('s'), ...draft.order },
        builder: builder ? { id: builder.id, fee: builder.fee } : null,
        network
      });
      const error = batchError(result);
      if (error) throw new Error(error);
      setMessage({ coin: holding.coin, text: `Sell order for ${draft.order.quantity} ${holding.label} sent to SoDEX.` });
      if (onTradeSuccess) setTimeout(onTradeSuccess, 1500);
    } catch (err) {
      setMessage({ coin: holding.coin, error: true, text: `SoDEX refused the sale: ${err.message}` });
    } finally {
      setSelling(null);
    }
  };

  if (holdings.length === 0) {
    return (
      <p className="pf-message">
        No coins on your {network.label} account yet. Buy with the trade form; your USDC pays for it.
      </p>
    );
  }

  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col" className="is-number">Amount</th>
            <th scope="col" className="is-number">Price, USDC</th>
            <th scope="col" className="is-number">Value, USDC</th>
            <th scope="col"><span className="pf-visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => {
            const rowMessage = message?.coin === holding.coin ? message : null;
            const locked = holding.total - holding.available;

            return (
              <Fragment key={holding.coin}>
                <tr className={rowMessage ? 'has-message' : undefined}>
                  <th scope="row">{holding.label}</th>
                  <td className="is-number">
                    {formatQuantity(holding.total)}
                    {locked > 0 && <span className="pf-sub">{formatQuantity(locked)} in open orders</span>}
                  </td>
                  <td className="is-number">{holding.price ? formatAmount(holding.price) : 'No price'}</td>
                  <td className="is-number pf-strong">{holding.value !== null ? formatAmount(holding.value) : 'Unknown'}</td>
                  <td className="pf-action">
                    {!holding.symbol ? (
                      <span className="pf-sub">No USDC market</span>
                    ) : confirming === holding.coin ? (
                      <span className="pf-confirm">
                        <button type="button" className="pf-sell is-confirm" onClick={() => handleSellAll(holding)}>
                          Sell all {holding.label}
                        </button>
                        <button type="button" className="pf-cancel" onClick={() => setConfirming(null)}>Keep</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="pf-sell"
                        disabled={selling === holding.coin || holding.available <= 0}
                        onClick={() => { setMessage(null); setConfirming(holding.coin); }}
                      >
                        {selling === holding.coin ? 'Selling' : 'Sell'}
                      </button>
                    )}
                  </td>
                </tr>
                {confirming === holding.coin && builder && (
                  <tr className="pf-message-row">
                    <td colSpan={5}>
                      <span className="pf-row-message">
                        Sells at the market price. Cinder&apos;s fee is {formatFeeRate(builder.fee)} of the sale.
                      </span>
                    </td>
                  </tr>
                )}
                {rowMessage && (
                  <tr className="pf-message-row">
                    <td colSpan={5}>
                      <span className={`pf-row-message${rowMessage.error ? ' is-error' : ''}`} role={rowMessage.error ? 'alert' : 'status'}>
                        {rowMessage.text}
                      </span>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
