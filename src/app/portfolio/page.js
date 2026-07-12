'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Header from '../../components/shared/Header';
import PortfolioView from '../../components/trading/PortfolioView';
import TradeHistory from '../../components/trading/TradeHistory';
import RiskDashboard from '../../components/trading/RiskDashboard';
import QuickTrade from '../../components/trading/QuickTrade';

export default function PortfolioPage() {
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

  const fetchPortfolioData = async () => {
    try {
      const tradeRes = await fetch('/api/trade');
      const tradeJson = await tradeRes.json();
      if (tradeJson.success) {
        setTradeData(tradeJson);
      }
    } catch (e) {
      console.error('Error fetching portfolio page data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolioData();
    const interval = setInterval(fetchPortfolioData, 30000);
    return () => clearInterval(interval);
  }, []);

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
    : 1.85;

  const isProfit = avgPnl >= 0;

  // Extract last trade pair
  const lastTradePair = tradeData.trades.length > 0
    ? tradeData.trades[0].pair
    : 'None';

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-obsidian)' }}>
      <Header />
      
      <div className="container" style={{ padding: 'var(--space-xl) var(--space-lg)' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
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
        <div className="stat-bar-grid">
          <div className="clay-glass stat-card">
            <div className="stat-label">Net Asset Value</div>
            <div className="stat-val">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          
          <div className="clay-glass stat-card">
            <div className="stat-label">Portfolio Return</div>
            <div className="stat-val" style={{ color: isProfit ? 'var(--color-pulse-green)' : 'var(--color-shift-red)' }}>
              {isProfit ? '+' : ''}{avgPnl.toFixed(2)}%
            </div>
          </div>
          
          <div className="clay-glass stat-card">
            <div className="stat-label">Open Positions</div>
            <div className="stat-val">
              {openPositionsCount}
            </div>
          </div>
          
          <div className="clay-glass stat-card">
            <div className="stat-label">Last Execution</div>
            <div className="stat-val" style={{ fontSize: '1.25rem', paddingHeight: '4px' }}>
              {lastTradePair}
            </div>
          </div>
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
          </div>
          
          {/* Column 4: Quick Trade & Risk Dashboard */}
          <div className="portfolio-col-4">
            <QuickTrade onTradeSuccess={handleTradeSuccess} />
            <RiskDashboard 
              positions={tradeData.positions}
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
