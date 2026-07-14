'use client';

import React, { useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import StoryFeed from '../../components/wire/StoryFeed';
import TemperatureGauge from '../../components/narrative/TemperatureGauge';
import { useWallet } from '../../context/WalletContext';

export default function FeedPage() {
  const { isConnected } = useWallet();
  const router = useRouter();
  const { scrollY } = useScroll();

  // Parallax heading fade-out and translation on scroll
  const headingY = useTransform(scrollY, [0, 450], [0, -100]);
  const headingOpacity = useTransform(scrollY, [0, 320], [1, 0]);

  // Route protection gating: instantly redirect disconnected users back to landing page
  useEffect(() => {
    if (!isConnected) {
      router.push('/');
    }
  }, [isConnected, router]);

  // Render a clean, empty blank screen during redirect transition to prevent flashes
  if (!isConnected) {
    return <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-obsidian)' }} />;
  }

  return (
    <main style={{ backgroundColor: 'var(--color-obsidian)', minHeight: '100vh', overflowX: 'hidden' }}>
      <Header />

      {/* Main Feed Container */}
      <section style={{ padding: '40px 0 60px 0' }}>
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          
          {/* Parallax Display Heading (Edge MSN news style) */}
          {/* Generous bottom margin (120px) is configured to show the parallax fade-out effect beautifully before stories slide over it */}
          <motion.div style={{ y: headingY, opacity: headingOpacity, marginBottom: '120px', transition: 'none' }}>
            <h1 
              className="section-heading" 
              style={{ 
                fontSize: '2.5rem', 
                borderLeft: '4px solid var(--color-wire-gold)', 
                paddingLeft: '20px',
                fontFamily: 'var(--font-body)',
                fontWeight: 800,
                textTransform: 'uppercase',
                color: 'var(--color-linen)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1
              }}
            >
              Market News That Backs Its Own Trades
            </h1>
          </motion.div>
          
          {/* Dynamic 4-Column News Portal Feed */}
          <div style={{ marginTop: '24px', width: '100%' }}>
            <StoryFeed 
              temperatureWidget={
                <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
                  <div className="edge-widget-header" style={{ borderBottom: '1px solid rgba(236, 223, 204, 0.08)', paddingBottom: '8px', marginBottom: '4px' }}>
                    <span className="edge-widget-title">
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-wire-gold)', marginRight: '6px' }} />
                      Market Temperature
                    </span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-sage)' }}>Gauge</span>
                  </div>
                  <TemperatureGauge />
                </div>
              } 
            />
          </div>

          {/* Horizontal Live executions ticker */}
          <div style={{ marginTop: '56px', borderTop: '1px solid rgba(236,223,204,0.06)', paddingTop: '32px' }}>
            <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: '20px', borderLeft: '3px solid var(--color-wire-gold)', paddingLeft: '12px' }}>
              Live Order Executions
            </h3>
            <div 
              style={{ 
                width: '100%', 
                overflow: 'hidden', 
                background: 'rgba(60,61,55,0.2)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: '12px', 
                padding: '14px 0', 
                position: 'relative' 
              }}
            >
              <div className="ticker-scroll" style={{ display: 'flex', gap: '40px', width: 'max-content' }}>
                <div style={{ display: 'flex', gap: '40px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY CNDR/USDC • $1.24 • 12,450 CNDR • 2m ago</span>
                  <span style={{ color: 'var(--color-shift-red)' }}>● SELL ETH/USDC • $3,421.50 • 2.4 ETH • 8m ago</span>
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY WBTC/USDC • $62,450.00 • 0.15 WBTC • 15m ago</span>
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY CNDR/USDC • $1.22 • 8,900 CNDR • 28m ago</span>
                  <span style={{ color: 'var(--color-shift-red)' }}>● SELL SOL/USDC • $142.80 • 45 SOL • 34m ago</span>
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY DeFi Renaissance • EXECUTION SUCCESS • 42m ago</span>
                </div>
                <div style={{ display: 'flex', gap: '40px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }} aria-hidden="true">
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY CNDR/USDC • $1.24 • 12,450 CNDR • 2m ago</span>
                  <span style={{ color: 'var(--color-shift-red)' }}>● SELL ETH/USDC • $3,421.50 • 2.4 ETH • 8m ago</span>
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY WBTC/USDC • $62,450.00 • 0.15 WBTC • 15m ago</span>
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY CNDR/USDC • $1.22 • 8,900 CNDR • 28m ago</span>
                  <span style={{ color: 'var(--color-shift-red)' }}>● SELL SOL/USDC • $142.80 • 45 SOL • 34m ago</span>
                  <span style={{ color: 'var(--color-pulse-green)' }}>● BUY DeFi Renaissance • EXECUTION SUCCESS • 42m ago</span>
                </div>
              </div>
            </div>
          </div>

          {/* Performance statistics grids */}
          <div style={{ marginTop: '56px' }}>
            <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: '20px', borderLeft: '3px solid var(--color-wire-gold)', paddingLeft: '12px' }}>
              System Performance
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Autonomous Win Rate</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-pulse-green)' }}>74.8%</div>
              </div>
              <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total Volume Executed</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-linen)' }}>$1,248,390</div>
              </div>
              <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Average Execution Speed</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-wire-gold)' }}>240ms</div>
              </div>
              <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Average Order Slippage</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-data-blue)' }}>&lt; 0.08%</div>
              </div>
            </div>
          </div>

          {/* Autonomous Loop pillars grid */}
          <div style={{ marginTop: '56px' }}>
            <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: '20px', borderLeft: '3px solid var(--color-wire-gold)', paddingLeft: '12px' }}>
              Autonomous Loop Architecture
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
              <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-wire-gold)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Pillar 01</div>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-linen)', marginBottom: '8px', fontWeight: 600 }}>Regime Identification</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-sage)', lineHeight: '1.6' }}>
                  Analyzes live narrative flows, sentiment shift alerts, and institutional momentum indexes to map current market regimes.
                </p>
              </div>
              <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-wire-gold)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Pillar 02</div>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-linen)', marginBottom: '8px', fontWeight: 600 }}>SoDEX Contract Routing</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-sage)', lineHeight: '1.6' }}>
                  Signs and dispatches EIP-712 order messages directly to the SoDEX decentralized exchange router for sub-second execution.
                </p>
              </div>
              <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-wire-gold)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Pillar 03</div>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-linen)', marginBottom: '8px', fontWeight: 600 }}>On-Chain Risk Controls</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-sage)', lineHeight: '1.6' }}>
                  Enforces automated daily loss thresholds, execution cooldown windows, and maximum position sizes at the contract layer.
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </main>
  );
}
