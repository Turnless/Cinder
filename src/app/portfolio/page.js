'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ethers } from 'ethers';
import { useRouter } from 'next/navigation';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import PortfolioView from '../../components/trading/PortfolioView';
import TradeHistory from '../../components/trading/TradeHistory';
import QuickTrade from '../../components/trading/QuickTrade';
import OpenOrders from '../../components/trading/OpenOrders';
import { useWallet } from '../../context/WalletContext';
import { buildTelegramLinkMessage } from '../../lib/telegram-link';
import { getSpotSymbols, getSpotTicker, getSpotOpenOrders, getSpotTrades } from '../../lib/sodex-browser';
import { tradableMarkets, marketForCoin, availableOf, isCashCoin, coinLabel } from '../../lib/sodex-orders';
import '../../styles/portfolio-page.css';

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PortfolioPage() {
  const { isConnected, walletAddress, walletChecked, network, account, refreshAccount } = useWallet();
  const router = useRouter();
  const [symbols, setSymbols] = useState([]);
  const [prices, setPrices] = useState({});
  const [openOrders, setOpenOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isTelegramLoading, setIsTelegramLoading] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState(null);

  const handleConnectTelegram = async () => {
    if (!walletAddress) return;
    setIsTelegramLoading(true);
    setTelegramMessage(null);
    try {
      // Prove wallet ownership so nobody can link their Telegram to someone else's address
      const issuedAt = new Date().toISOString();
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signature = await provider.getSigner().signMessage(buildTelegramLinkMessage(walletAddress, issuedAt));

      const res = await fetch('/api/telegram-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, signature, issuedAt })
      });
      const data = await res.json();
      if (data.success && data.deepLink) {
        window.open(data.deepLink, '_blank');
        setTelegramMessage({ text: 'Telegram opened in a new tab. Press Start there within 15 minutes to finish linking.' });
      } else {
        setTelegramMessage({ error: true, text: data.error || 'The Telegram link could not be created.' });
      }
    } catch (e) {
      console.error('Error connecting Telegram:', e);
      setTelegramMessage({
        error: true,
        text: e.code === 'ACTION_REJECTED' || e.code === 4001
          ? 'You declined the signature. Signing proves you own this wallet.'
          : 'The Telegram link could not be created. Try again.'
      });
    } finally {
      setIsTelegramLoading(false);
    }
  };

  // Redirect if disconnected — only after wallet check is complete
  useEffect(() => {
    if (walletChecked && !isConnected) {
      router.push('/');
    }
  }, [isConnected, walletChecked, router]);

  useEffect(() => {
    let active = true;
    getSpotSymbols(network)
      .then(result => active && result.ok && setSymbols(tradableMarkets(result.json.data)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [network]);

  const accountID = account.accountID;
  const fetchPortfolioData = useCallback(async () => {
    if (!walletAddress || !accountID) return;
    try {
      const [ordersRes, tradesRes] = await Promise.all([
        getSpotOpenOrders(walletAddress, accountID, null, network),
        getSpotTrades(walletAddress, accountID, 50, network)
      ]);
      setOpenOrders(ordersRes.ok ? ordersRes.json.data?.orders || [] : []);
      setTrades(tradesRes.ok && Array.isArray(tradesRes.json.data) ? tradesRes.json.data : []);
      setLoadError(!ordersRes.ok || !tradesRes.ok);
    } catch (e) {
      console.error('Error fetching portfolio page data:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, accountID, network]);

  // Coins held on SoDEX, with the USDC market each one trades on
  const holdings = useMemo(() => account.balances
    .filter(b => !isCashCoin(b.coin) && parseFloat(b.total) > 0)
    .map(b => {
      const symbol = marketForCoin(symbols, b.coin);
      const price = symbol ? prices[symbol.name] ?? null : null;
      const total = parseFloat(b.total);
      return {
        coin: b.coin,
        label: coinLabel(b.coin),
        total,
        available: availableOf(account.balances, b.coin),
        symbol,
        price,
        value: price !== null ? total * price : null
      };
    }), [account.balances, symbols, prices]);

  // Last prices for the markets of held coins, refreshed whenever the balances are
  const heldMarkets = holdings.map(h => h.symbol?.name).filter(Boolean).join(',');
  useEffect(() => {
    if (!heldMarkets) return undefined;
    let active = true;
    Promise.all(heldMarkets.split(',').map(async name => {
      const ticker = await getSpotTicker(name, network).catch(() => null);
      const last = parseFloat(ticker?.json?.data?.[0]?.lastPx);
      return [name, last > 0 ? last : null];
    })).then(entries => active && setPrices(Object.fromEntries(entries)));
    return () => {
      active = false;
    };
  }, [heldMarkets, network, account.balances]);

  const refreshAll = useCallback(() => {
    refreshAccount();
    fetchPortfolioData();
  }, [refreshAccount, fetchPortfolioData]);

  const checkTelegramStatus = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/telegram-auth?address=${walletAddress}`);
      const data = await res.json();
      setTelegramConnected(data.connected === true);
    } catch (e) {
      setTelegramConnected(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!isConnected) return undefined;
    checkTelegramStatus();
    const interval = setInterval(checkTelegramStatus, 30000);
    return () => clearInterval(interval);
  }, [isConnected, checkTelegramStatus]);

  useEffect(() => {
    if (!accountID) return undefined;
    fetchPortfolioData();
    const interval = setInterval(() => {
      refreshAccount();
      fetchPortfolioData();
    }, 30000);
    return () => clearInterval(interval);
  }, [accountID, fetchPortfolioData, refreshAccount]);

  if (!walletChecked || !isConnected) {
    return <main className="pf-page" />;
  }

  const usdcTotal = parseFloat(account.balances.find(b => isCashCoin(b.coin))?.total || 0);
  const holdingsValue = holdings.reduce((sum, h) => sum + (h.value || 0), 0);
  const unpriced = holdings.some(h => h.value === null);
  const total = usdcTotal + holdingsValue;
  const accountReady = account.status === 'ready';

  return (
    <main className="pf-page">
      <Header />

      <div className="pf-wrap">
        <header className="pf-head">
          <h1 className="pf-title">Portfolio</h1>
          <p className="pf-intro">
            Your {network.label} account: the USDC and coins it holds, open orders and every fill.
          </p>
        </header>

        {account.status === 'missing' && (
          <p className="pf-message" role="status">
            This wallet has no {network.label} account yet.{' '}
            <a className="pf-link" href={network.appUrl} target="_blank" rel="noreferrer">Open SoDEX</a> with this
            wallet to create one and add USDC.
          </p>
        )}

        <dl className="pf-summary" aria-busy={!accountReady}>
          <div>
            <dt>Total value</dt>
            <dd className="pf-summary-total">
              {accountReady ? formatAmount(total) : '-'} <span>USDC</span>
            </dd>
          </div>
          <div>
            <dt>USDC available</dt>
            <dd>{accountReady ? formatAmount(account.usdc) : '-'}</dd>
          </div>
          <div>
            <dt>{unpriced ? 'In coins (priced ones)' : 'In coins'}</dt>
            <dd>{accountReady ? formatAmount(holdingsValue) : '-'}</dd>
          </div>
          <div>
            <dt>Open orders</dt>
            <dd>{accountReady ? openOrders.length : '-'}</dd>
          </div>
        </dl>

        {account.status === 'error' && (
          <p className="pf-message is-error" role="alert">
            Your {network.label} account could not be loaded: {account.error}
          </p>
        )}

        {loadError && (
          <p className="pf-message is-error" role="alert">
            Your open orders and trades could not be loaded. The page retries every 30 seconds.
          </p>
        )}

        <div className="pf-layout">
          <div className="pf-main">
            <section className="pf-section" aria-labelledby="pf-positions-title">
              <h2 id="pf-positions-title" className="pf-section-title">Coins</h2>
              <p className="pf-section-intro">Valued at the last price on SoDEX.</p>
              {!accountReady ? <div className="pf-skeleton" /> : <PortfolioView holdings={holdings} onTradeSuccess={refreshAll} />}
            </section>

            <section className="pf-section" aria-labelledby="pf-orders-title">
              <h2 id="pf-orders-title" className="pf-section-title">Open orders</h2>
              {loading && accountReady ? <div className="pf-skeleton" /> : <OpenOrders orders={openOrders} symbols={symbols} onChange={refreshAll} />}
            </section>

            <section className="pf-section" aria-labelledby="pf-history-title">
              <h2 id="pf-history-title" className="pf-section-title">Trades</h2>
              {loading && accountReady ? <div className="pf-skeleton" /> : <TradeHistory trades={trades} symbols={symbols} />}
            </section>
          </div>

          <aside className="pf-rail" aria-label="Trade and alerts">
            <QuickTrade onTradeSuccess={fetchPortfolioData} />

            <section className="pf-alerts" aria-labelledby="pf-alerts-title">
              <h2 id="pf-alerts-title" className="pf-alerts-title">Telegram alerts</h2>
              {telegramConnected ? (
                <p className="pf-alerts-text">
                  This wallet is linked. You get narrative shift alerts and trade notifications in Telegram.
                </p>
              ) : (
                <>
                  <p className="pf-alerts-text">
                    Get narrative shifts and trades in Telegram. Your wallet signs a message to prove it is yours.
                  </p>
                  <button
                    type="button"
                    className="pf-button"
                    onClick={handleConnectTelegram}
                    disabled={isTelegramLoading || !walletAddress}
                  >
                    {isTelegramLoading ? 'Waiting for your wallet' : 'Link Telegram'}
                  </button>
                </>
              )}
              {telegramMessage && (
                <p className={`pf-alerts-text${telegramMessage.error ? ' is-error' : ''}`} role={telegramMessage.error ? 'alert' : 'status'}>
                  {telegramMessage.text}
                </p>
              )}
            </section>

            <p className="pf-rail-note">
              Cinder&apos;s automatic trades run on its own account, never yours. Follow them on the{' '}
              <Link href="/dashboard" className="pf-link">narratives dashboard</Link>.
            </p>
          </aside>
        </div>
      </div>

      <Footer />
    </main>
  );
}
