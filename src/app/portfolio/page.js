'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ethers } from 'ethers';
import { useRouter } from 'next/navigation';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import PortfolioView from '../../components/trading/PortfolioView';
import TradeHistory from '../../components/trading/TradeHistory';
import QuickTrade from '../../components/trading/QuickTrade';
import { useWallet } from '../../context/WalletContext';
import { buildTelegramLinkMessage } from '../../lib/telegram-link';
import '../../styles/portfolio-page.css';

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PortfolioPage() {
  const { isConnected, walletAddress, balance: cndrBalance, isDemoBalance, walletChecked } = useWallet();
  const router = useRouter();
  const [tradeData, setTradeData] = useState({ positions: [], trades: [] });
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

  const fetchPortfolioData = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const tradeRes = await fetch(`/api/trade?address=${walletAddress}`);
      const tradeJson = await tradeRes.json();
      if (tradeJson.success) {
        setTradeData(tradeJson);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch (e) {
      console.error('Error fetching portfolio page data:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

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
    if (!isConnected) return;
    fetchPortfolioData();
    checkTelegramStatus();
    const interval = setInterval(() => {
      fetchPortfolioData();
      checkTelegramStatus();
    }, 30000);
    return () => clearInterval(interval);
    // cndrBalance: refetch when the CNDR balance changes (e.g. after a faucet claim)
  }, [isConnected, fetchPortfolioData, checkTelegramStatus, cndrBalance]);

  if (!walletChecked || !isConnected) {
    return <main className="pf-page" />;
  }

  const positions = tradeData.positions || [];
  const positionsValue = positions.reduce((sum, p) => sum + parseFloat(p.value || 0), 0);
  // Size-weighted: total value against what the positions cost
  const positionsCost = positions.reduce((sum, p) => sum + parseFloat(p.quantity || 0) * parseFloat(p.entryPrice || 0), 0);
  const positionsReturn = positionsCost > 0 ? ((positionsValue - positionsCost) / positionsCost) * 100 : null;
  const cash = parseFloat(cndrBalance || 0);
  const total = cash + positionsValue;

  return (
    <main className="pf-page">
      <Header />

      <div className="pf-wrap">
        <header className="pf-head">
          <h1 className="pf-title">Portfolio</h1>
          <p className="pf-intro">
            Your CNDR, the positions you have bought with it, and every trade placed from this wallet.
          </p>
        </header>

        <dl className="pf-summary" aria-busy={loading}>
          <div>
            <dt>Total value</dt>
            <dd className="pf-summary-total">{formatAmount(total)} <span>CNDR</span></dd>
          </div>
          <div>
            <dt>{isDemoBalance ? 'CNDR available (demo balance)' : 'CNDR in your wallet'}</dt>
            <dd>{formatAmount(cash)}</dd>
          </div>
          <div>
            <dt>In positions</dt>
            <dd>{formatAmount(positionsValue)}</dd>
          </div>
          <div>
            <dt>Return on positions</dt>
            <dd className={positionsReturn > 0 ? 'is-up' : positionsReturn < 0 ? 'is-down' : undefined}>
              {positionsReturn === null
                ? 'No positions'
                : `${positionsReturn > 0 ? '+' : positionsReturn < 0 ? '−' : ''}${Math.abs(positionsReturn).toFixed(2)}%`}
            </dd>
          </div>
        </dl>

        {loadError && (
          <p className="pf-message is-error" role="alert">
            Your positions and trades could not be loaded. The page retries every 30 seconds.
          </p>
        )}

        <div className="pf-layout">
          <div className="pf-main">
            <section className="pf-section" aria-labelledby="pf-positions-title">
              <h2 id="pf-positions-title" className="pf-section-title">Positions</h2>
              <p className="pf-section-intro">
                Prices are in USDC; 1 CNDR is treated as 1 USDC when you buy or sell.
              </p>
              {loading ? <div className="pf-skeleton" /> : <PortfolioView positions={positions} onTradeSuccess={fetchPortfolioData} />}
            </section>

            <section className="pf-section" aria-labelledby="pf-history-title">
              <h2 id="pf-history-title" className="pf-section-title">Trades</h2>
              {loading ? <div className="pf-skeleton" /> : <TradeHistory trades={tradeData.trades || []} />}
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
              Automatic trades follow the limits on the <Link href="/dashboard" className="pf-link">narratives dashboard</Link>.
            </p>
          </aside>
        </div>
      </div>

      <Footer />
    </main>
  );
}
