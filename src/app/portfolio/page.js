'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import { useRouter } from 'next/navigation';
import Header from '../../components/shared/Header';
import PortfolioView from '../../components/trading/PortfolioView';
import TradeHistory from '../../components/trading/TradeHistory';
import RiskDashboard from '../../components/trading/RiskDashboard';
import QuickTrade from '../../components/trading/QuickTrade';
import { useWallet } from '../../context/WalletContext';
import { buildTelegramLinkMessage } from '../../lib/telegram-link';

export default function PortfolioPage() {
  const { isConnected, walletAddress, balance: cndrBalance, walletChecked } = useWallet();
  const router = useRouter();
  const [tradeData, setTradeData] = useState({
    balance: '0.00',
    positions: [],
    trades: [],
    riskConfig: {
      autoTradeEnabled: false,
      cooldownHours: 48,
      maxAllocation: 0.30,
      stopLossPercentage: 0.08
    }
  });
  const [loading, setLoading] = useState(true);
  const [isTelegramLoading, setIsTelegramLoading] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);

  const handleConnectTelegram = async () => {
    if (!walletAddress) return;
    setIsTelegramLoading(true);
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
      } else {
        alert(data.error || 'Failed to generate Telegram connection link.');
      }
    } catch (e) {
      console.error('Error connecting Telegram:', e);
      alert(e.code === 'ACTION_REJECTED' || e.code === 4001
        ? 'Signature request was rejected. Signing is needed to prove you own this wallet.'
        : 'An error occurred. Please try again.');
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
      }
    } catch (e) {
      console.error('Error fetching portfolio page data:', e);
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

  const handleTradeSuccess = () => {
    fetchPortfolioData();
  };

  // Calculate stats bar figures
  const parsedBalance = parseFloat(tradeData.balance || 0);
  const positionsValue = tradeData.positions.reduce((acc, pos) => acc + parseFloat(pos.value || 0), 0);
  const totalValue = parsedBalance + positionsValue;

  const openPositionsCount = tradeData.positions.length;
  
  // Calculate average PNL or fallback to nominal default
  const avgPnl = tradeData.positions.length > 0
    ? tradeData.positions.reduce((acc, pos) => acc + parseFloat(pos.return || 0), 0) / tradeData.positions.length
    : 0.00;

  const isProfit = avgPnl >= 0;

  // Extract last trade pair
  const lastTradePair = tradeData.trades.length > 0
    ? tradeData.trades[0].pair
    : 'None';

  if (!walletChecked || !isConnected) {
    return <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-obsidian)' }} />;
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-obsidian)', position: 'relative' }}>
      <Header />
      
      <div className="container portfolio-page-container">
        {/* Page Header */}
        <div className="portfolio-card-header" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
          <div>
            <h1 className="section-heading">Portfolio & Risk Management</h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-sage)', marginTop: 'var(--space-xs)' }}>
              Verify smart contract balances, trailing stops, and configure manual execution parameters.
            </p>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-wire-gold)', fontWeight: 700 }}>
              Syncing Balances...
            </div>
          )}
        </div>

        {/* Top Stat Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: 'var(--space-xl)' }}>
          {/* Card 1: NAV */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Asset Value</div>
            <div style={{ fontSize: '1.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-linen)' }}>
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--color-sage)' }}>CNDR + positions value</div>
          </motion.div>

          {/* Card 2: Return */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio Return</div>
            <div style={{ fontSize: '1.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isProfit ? 'var(--color-pulse-green)' : 'var(--color-shift-red)' }}>
              {isProfit ? '+' : ''}{avgPnl.toFixed(2)}%
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--color-sage)' }}>Average of active positions</div>
          </motion.div>

          {/* Card 3: Open Positions */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open Positions</div>
            <div style={{ fontSize: '1.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-linen)' }}>
              {openPositionsCount}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--color-sage)' }}>Active risk assets on SoDEX</div>
          </motion.div>

          {/* Card 4: Last Execution */}
          <motion.div 
            whileHover={{ y: -4, borderColor: 'rgba(212, 168, 83, 0.4)' }}
            className="clay-glass" 
            style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)', transition: 'border-color 0.2s ease', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Execution</div>
            <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-wire-gold)', marginTop: '4px', textTransform: 'uppercase' }}>
              {lastTradePair}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--color-sage)' }}>Most recent regime trigger</div>
          </motion.div>
        </div>

        {/* Portfolio Content Layout */}
        <div className="portfolio-grid">
          {/* Column 8: Portfolio View & Trade History */}
          <div className="portfolio-col-8">
            <PortfolioView 
              balance={tradeData.balance}
              positions={tradeData.positions}
              onTradeSuccess={handleTradeSuccess}
            />
            <div style={{ marginTop: 'var(--space-md)' }}>
              <TradeHistory trades={tradeData.trades} />
            </div>

            {/* Telegram Alerts Connection Widget */}
            <div className="clay-glass" style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-linen)' }}>
                  {telegramConnected ? 'Telegram Alerts Active' : 'Receive Real-Time Telegram Alerts'}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)' }}>
                  {telegramConnected
                    ? 'You will receive narrative shift alerts, trade notifications, and daily digests.'
                    : 'Link your wallet to get immediate notifications on narrative shifts, executed trades, and trailing stops.'}
                </span>
              </div>
              <button 
                onClick={telegramConnected ? undefined : handleConnectTelegram}
                disabled={isTelegramLoading || !walletAddress}
                style={{
                  backgroundColor: telegramConnected ? 'rgba(74, 222, 128, 0.08)' : 'rgba(212, 168, 83, 0.08)',
                  color: telegramConnected ? 'var(--color-pulse-green)' : 'var(--color-wire-gold)',
                  border: telegramConnected ? '1px solid rgba(74, 222, 128, 0.25)' : '1px solid rgba(212, 168, 83, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 16px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: telegramConnected ? 'default' : (!walletAddress || isTelegramLoading) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {telegramConnected && (
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-pulse-green)', display: 'inline-block', boxShadow: '0 0 6px var(--color-pulse-green)' }} />
                )}
                {isTelegramLoading ? 'GENERATING LINK...' : telegramConnected ? 'CONNECTED' : 'CONNECT TELEGRAM BOT'}
              </button>
            </div>
          </div>
          
          {/* Column 4: Quick Trade & Risk Dashboard */}
          <div className="portfolio-col-4">
            <QuickTrade onTradeSuccess={handleTradeSuccess} />
            <RiskDashboard 
              positions={tradeData.positions}
              trades={tradeData.trades || []}
              autoTradeEnabled={tradeData.riskConfig?.autoTradeEnabled}
              cooldownHours={tradeData.riskConfig?.cooldownHours}
              maxAllocation={tradeData.riskConfig?.maxAllocation}
              stopLossPercentage={tradeData.riskConfig?.stopLossPercentage}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
