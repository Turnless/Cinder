'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';
import { getSpotSymbols, getSpotTicker, placeSpotOrder, newClientOrderId } from '../../lib/sodex-browser';
import {
  tradableMarkets,
  marketLabels,
  availableOf,
  prepareSpotOrder,
  batchError,
  formatFeeRate
} from '../../lib/sodex-orders';
import '../../styles/portfolio-page.css';

const DEFAULT_MARKET = 'vBTC_vUSDC';

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatQuantity = (n) => parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 8 });

/**
 * Asks the wallet for the approvals trading needs: a trading key for this browser and,
 * when Cinder charges a builder fee, approval of that fee.
 */
function EnableTrading() {
  const { network, builder, account, tradingKey, enableTrading } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const needsKey = !tradingKey;
  const needsFee = Boolean(builder) && account.builderFee < builder.fee;
  const signatures = Number(needsKey) + Number(needsFee);

  const handleEnable = async () => {
    setBusy(true);
    setError('');
    const result = await enableTrading();
    if (!result.ok) setError(result.error);
    setBusy(false);
  };

  return (
    <div className="qt-form">
      <h3 className="qt-subtitle">Enable trading</h3>
      <p className="qt-note">
        {signatures === 1
          ? 'Your wallet signs one request. It costs no gas.'
          : `Your wallet signs ${signatures} requests. Neither costs gas.`}
      </p>
      <ul className="qt-list">
        {needsKey && (
          <li>
            A trading key kept in this browser. It places and cancels orders on your {network.label} account
            for 7 days and can never withdraw or move your funds.
          </li>
        )}
        {needsFee && (
          <li>
            Cinder&apos;s fee of {formatFeeRate(builder.fee)} on each sale, paid from the sale in USDC. Buys carry no
            Cinder fee. You can withdraw this approval on SoDEX at any time.
          </li>
        )}
      </ul>
      {error && <p className="qt-error" role="alert">{error}</p>}
      <button type="button" className="qt-primary" onClick={handleEnable} disabled={busy}>
        {busy ? 'Waiting for your wallet' : 'Enable trading'}
      </button>
    </div>
  );
}

export default function QuickTrade({ onTradeSuccess }) {
  const { network, builder, account, tradingKey, tradingReady, refreshAccount } = useWallet();

  const [symbols, setSymbols] = useState([]);
  const [marketsError, setMarketsError] = useState('');
  const [marketName, setMarketName] = useState(DEFAULT_MARKET);
  const [side, setSide] = useState('buy');
  const [orderType, setOrderType] = useState('market');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [lastPrice, setLastPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);

  const [step, setStep] = useState('input'); // 'input', 'review', 'placing', 'done', 'error'
  const [prepared, setPrepared] = useState(null);
  const [formError, setFormError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [placedId, setPlacedId] = useState(null);

  useEffect(() => {
    let active = true;
    getSpotSymbols(network)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setSymbols(tradableMarkets(result.json.data));
        } else {
          setMarketsError(result.error);
        }
      })
      .catch(err => active && setMarketsError(err.message));
    return () => {
      active = false;
    };
  }, [network]);

  const symbol = symbols.find(s => s.name === marketName) || symbols[0];
  const symbolName = symbol?.name;

  // Last traded price of the selected market, refreshed every 10 seconds
  useEffect(() => {
    if (!symbolName) return undefined;
    let active = true;
    setLastPrice(null);
    setPriceLoading(true);
    const load = async () => {
      try {
        const ticker = await getSpotTicker(symbolName, network);
        const last = parseFloat(ticker.json?.data?.[0]?.lastPx);
        if (active) setLastPrice(ticker.ok && last > 0 ? last : null);
      } catch {
        if (active) setLastPrice(null);
      } finally {
        if (active) setPriceLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [symbolName, network]);

  const { base, quote } = symbol ? marketLabels(symbol) : { base: '', quote: 'USDC' };
  const spendsQuote = side === 'buy' && orderType === 'market';
  const available = side === 'buy' ? account.usdc : availableOf(account.balances, symbol?.baseCoin);
  const chargesFee = Boolean(builder) && side === 'sell';

  const draft = symbol
    ? prepareSpotOrder({ symbol, side, type: orderType, amount, price, lastPrice })
    : null;

  const handleReview = () => {
    if (!draft?.ok) {
      setFormError(draft?.error || 'Pick a market.');
      return;
    }
    if (side === 'buy' && draft.notional !== null && draft.notional > account.usdc) {
      setFormError(`You have ${formatAmount(account.usdc)} USDC available.`);
      return;
    }
    if (side === 'sell' && parseFloat(draft.order.quantity) > available) {
      setFormError(`You have ${formatQuantity(available)} ${base} available.`);
      return;
    }
    setFormError('');
    setPrepared({ ...draft, symbol, base, quote });
    setStep('review');
  };

  const handlePlace = async () => {
    setStep('placing');
    setErrorMessage('');
    try {
      const result = await placeSpotOrder({
        key: tradingKey,
        order: { symbolID: prepared.symbol.id, clOrdID: newClientOrderId('q'), ...prepared.order },
        builder: builder ? { id: builder.id, fee: builder.fee } : null,
        network
      });
      const error = batchError(result);
      if (error) throw new Error(error);
      setPlacedId(result.json.data[0]?.orderID ?? null);
      setStep('done');
      // Give SoDEX a moment to settle the fill before reading balances again
      setTimeout(() => {
        refreshAccount();
        if (onTradeSuccess) onTradeSuccess();
      }, 1500);
    } catch (err) {
      setErrorMessage(err.message || 'SoDEX refused the order.');
      setStep('error');
    }
  };

  const resetForm = () => {
    setAmount('');
    setPrice('');
    setFormError('');
    setPrepared(null);
    setStep('input');
  };

  const intro = (
    <p className="qt-intro">
      Orders go from this browser straight to your {network.label} account
      {network.isMainnet ? ' and use real USDC.' : ' and use test USDC.'}
    </p>
  );

  if (account.status !== 'ready') {
    return (
      <section className="qt" aria-labelledby="qt-title">
        <h2 id="qt-title" className="qt-title">Trade</h2>
        {intro}
        {account.status === 'missing' ? (
          <p className="qt-note">
            This wallet has no {network.label} account yet.{' '}
            <a className="pf-link" href={network.appUrl} target="_blank" rel="noreferrer">Open SoDEX</a> with this
            wallet, create the account and move USDC to Spot, then come back.
          </p>
        ) : account.status === 'error' ? (
          <>
            <p className="qt-error" role="alert">SoDEX could not be reached: {account.error}</p>
            <button type="button" className="qt-secondary" onClick={refreshAccount}>Try again</button>
          </>
        ) : (
          <p className="qt-note" role="status">Loading your SoDEX account</p>
        )}
      </section>
    );
  }

  if (!tradingReady) {
    return (
      <section className="qt" aria-labelledby="qt-title">
        <h2 id="qt-title" className="qt-title">Trade</h2>
        {intro}
        <EnableTrading />
      </section>
    );
  }

  return (
    <section className="qt" aria-labelledby="qt-title">
      <h2 id="qt-title" className="qt-title">Trade</h2>
      {intro}

      {step === 'input' && (
        <div className="qt-form">
          <div className="qt-side" role="group" aria-label="Order side">
            <button type="button" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>Buy</button>
            <button type="button" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>Sell</button>
          </div>

          <label className="qt-field">
            <span>Market</span>
            <select value={symbol?.name || ''} onChange={(e) => setMarketName(e.target.value)} disabled={!symbols.length}>
              {symbols.length === 0 && <option value="">{marketsError ? 'Markets unavailable' : 'Loading markets'}</option>}
              {symbols.map(s => (
                <option key={s.id} value={s.name}>{s.displayName}</option>
              ))}
            </select>
          </label>
          {marketsError && <p className="qt-error" role="alert">SoDEX markets could not be loaded: {marketsError}</p>}
          <p className="qt-price" aria-live="polite">
            {lastPrice
              ? `1 ${base} = ${formatAmount(lastPrice)} ${quote}`
              : priceLoading ? 'Loading the last price' : 'No recent trades on this market'}
          </p>

          <div className="qt-row">
            <label className="qt-field">
              <span>Order type</span>
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </label>
            <label className="qt-field">
              <span>{spendsQuote ? `Amount in ${quote}` : `Quantity in ${base}`}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </div>

          {orderType === 'limit' && (
            <label className="qt-field">
              <span>Limit price in {quote}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder={lastPrice ? String(lastPrice) : '0.00'}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          )}

          <p className="qt-note">
            Available: {side === 'buy' ? `${formatAmount(available)} ${quote}` : `${formatQuantity(available)} ${base}`}
          </p>

          {draft?.ok && draft.notional !== null && (
            <p className="qt-estimate">
              {spendsQuote
                ? <>About <strong>{lastPrice ? formatQuantity(draft.notional / lastPrice) : '?'} {base}</strong> at the last price</>
                : <>About <strong>{formatAmount(draft.notional)} {quote}</strong> {side === 'buy' ? 'to pay' : 'to receive'}</>}
            </p>
          )}

          {formError && <p className="qt-error" role="alert">{formError}</p>}

          <button type="button" className="qt-primary" onClick={handleReview} disabled={!symbol}>Review order</button>
        </div>
      )}

      {step === 'review' && prepared && (
        <div className="qt-form">
          <h3 className="qt-subtitle">Check your order</h3>
          <dl className="qt-summary">
            <div>
              <dt>Order</dt>
              <dd>
                {side === 'buy' ? 'Buy' : 'Sell'}{' '}
                {prepared.order.funds ? `${prepared.base} with ${formatAmount(prepared.order.funds)} ${prepared.quote}` : `${prepared.order.quantity} ${prepared.base}`}
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{prepared.order.price ? `Limit at ${formatAmount(prepared.order.price)} ${prepared.quote}` : 'Market'}</dd>
            </div>
            {prepared.notional !== null && !prepared.order.funds && (
              <div><dt>{side === 'buy' ? 'You pay' : 'You receive'}</dt><dd>about {formatAmount(prepared.notional)} {prepared.quote}</dd></div>
            )}
            <div>
              <dt>Cinder fee</dt>
              <dd>{chargesFee ? `${formatFeeRate(builder.fee)} of the sale` : 'None'}</dd>
            </div>
          </dl>
          <p className="qt-note">
            {prepared.order.price
              ? 'A limit order waits on the book until the price is reached. Cancel it from your portfolio.'
              : 'A market order fills straight away at the best prices on the book.'}{' '}
            SoDEX also charges its own trading fee.
          </p>
          <button type="button" className="qt-primary" onClick={handlePlace}>
            {side === 'buy' ? 'Place buy order' : 'Place sell order'}
          </button>
          <button type="button" className="qt-secondary" onClick={() => setStep('input')}>Edit order</button>
        </div>
      )}

      {step === 'placing' && (
        <div className="qt-status" role="status" aria-live="polite">
          <span className="qt-spinner" aria-hidden="true" />
          <p className="qt-status-title">Sending the order to SoDEX</p>
        </div>
      )}

      {step === 'done' && (
        <div className="qt-status" role="status">
          <p className="qt-status-title">SoDEX accepted the order</p>
          <p className="qt-note">
            {prepared?.order.price
              ? 'It is on the book now. Your open orders and balances update below.'
              : 'Your balances and trades update below in a moment.'}
          </p>
          {placedId !== null && (
            <dl className="qt-summary">
              <div><dt>Order ID</dt><dd className="qt-id">{String(placedId)}</dd></div>
            </dl>
          )}
          <button type="button" className="qt-secondary" onClick={resetForm}>Place another order</button>
        </div>
      )}

      {step === 'error' && (
        <div className="qt-status" role="alert">
          <p className="qt-status-title is-error">SoDEX refused the order</p>
          <p className="qt-note">{errorMessage}</p>
          <button type="button" className="qt-primary" onClick={() => setStep('review')}>Try again</button>
          <button type="button" className="qt-secondary" onClick={() => setStep('input')}>Edit order</button>
        </div>
      )}
    </section>
  );
}
