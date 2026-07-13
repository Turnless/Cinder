'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import StoryFeed from '../components/wire/StoryFeed';
import StoryCard from '../components/wire/StoryCard';
import TemperatureGauge from '../components/narrative/TemperatureGauge';
import { useWallet } from '../context/WalletContext';

export default function HomePage() {
  const { scrollY } = useScroll();
  const { isConnected, connectWallet, isConnecting } = useWallet();
  
  const [latestStory, setLatestStory] = useState(null);
  const [loadingStory, setLoadingStory] = useState(true);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  // Transform hero opacity, scale, and y translation based on scroll position
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.92]);
  const heroY = useTransform(scrollY, [0, 400], [0, -60]);

  // Fetch only the single latest story for the compact disconnected preview
  useEffect(() => {
    async function fetchLatest() {
      try {
        const res = await fetch('/api/stories?limit=1');
        const data = await res.json();
        if (data.success && data.stories.length > 0) {
          setLatestStory(data.stories[0]);
        }
      } catch (e) {
        console.error('Error fetching latest story:', e);
      } finally {
        setLoadingStory(false);
      }
    }
    fetchLatest();
  }, []);

  const handleConnectProvider = (provider) => {
    connectWallet(provider);
    setIsConnectModalOpen(false);
  };

  return (
    <main style={{ backgroundColor: 'var(--color-obsidian)', minHeight: '100vh', overflowX: 'hidden' }}>
      <Header />
      
      {/* Hero Section */}
      <section className="hero-section">
        {/* Ambient Blurred Bubble Map Background */}
        <svg className="hero-ambient-svg" viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="200" cy="200" r="120" fill="var(--color-wire-gold)" filter="blur(100px)" />
          <circle cx="600" cy="400" r="150" fill="var(--color-data-blue)" filter="blur(120px)" />
          <circle cx="400" cy="300" r="100" fill="var(--color-shift-red)" filter="blur(90px)" />
        </svg>

        <motion.div 
          className="container" 
          style={{ 
            width: '100%', 
            position: 'relative', 
            zIndex: 2,
            opacity: heroOpacity,
            scale: heroScale,
            y: heroY
          }}
        >
          <div className="hero-content">
            <motion.span 
              className="hero-eyebrow"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              Cinder
            </motion.span>
            
            <motion.h1 
              className="hero-headline"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            >
              Market News That Backs Its Own Trades
            </motion.h1>
            
            <motion.p 
              className="hero-subhead"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.25 }}
            >
              Tracks ETF flows and market momentum, then places trades on SoDEX when a clear shift is confirmed.
            </motion.p>
            
            <motion.div 
              className="hero-ctas"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
            >
              {isConnected ? (
                <>
                  <a href="/dashboard" className="btn-hero-primary">
                    Market Dashboard
                  </a>
                  <a href="/portfolio" className="btn-hero-secondary">
                    Risk Settings
                  </a>
                </>
              ) : (
                <button 
                  onClick={() => setIsConnectModalOpen(true)}
                  disabled={isConnecting}
                  className="btn-hero-primary"
                  style={{ 
                    cursor: 'pointer', 
                    padding: '12px 32px', 
                    borderRadius: '12px', 
                    fontWeight: 600,
                    border: 'none',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              )}
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Feed scrolls up and overlays the hero */}
      <div 
        className="feed-overlay container" 
        style={{ 
          position: 'relative', 
          zIndex: 10, 
          paddingBottom: '60px'
        }}
      >
        
        {/* Dynamic Connected vs Gated Landing Layout */}
        {isConnected ? (
          <div style={{ transition: 'all 0.5s ease' }}>
            <div className="feed-layout">
              <div className="feed-column">
                <StoryFeed />
              </div>
              <div className="sidebar-column">
                <div className="clay-glass" style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
                  <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: 'var(--space-md)' }}>Current Market Mood</h3>
                  <TemperatureGauge />
                </div>
              </div>
            </div>

            {/* Live executions list */}
            <div style={{ marginTop: '48px', borderTop: '1px solid rgba(236,223,204,0.06)', paddingTop: '32px' }}>
              <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: '20px' }}>Live Order Executions</h3>
              <div style={{ width: '100%', overflow: 'hidden', background: 'rgba(60,61,55,0.2)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '14px 0', position: 'relative' }}>
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

            {/* Performance Stats */}
            <div style={{ marginTop: '48px' }}>
              <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: '20px' }}>System Performance</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Autonomous Win Rate</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-pulse-green)' }}>74.8%</div>
                </div>
                <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total Volume Executed</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-linen)' }}>$1,248,390</div>
                </div>
                <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Average Execution Speed</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-wire-gold)' }}>240ms</div>
                </div>
                <div className="clay-glass" style={{ padding: '20px', borderRadius: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-sage)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Average Order Slippage</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-data-blue)' }}>&lt; 0.08%</div>
                </div>
              </div>
            </div>

            {/* Cool Feature: The Autonomous Loop */}
            <div style={{ marginTop: '48px' }}>
              <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: '20px' }}>Autonomous Loop Architecture</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-wire-gold)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Pillar 01</div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-linen)', marginBottom: '8px', fontWeight: 600 }}>Regime Identification</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-sage)', lineHeight: '1.6' }}>
                    Analyzes live narrative flows, sentiment shift alerts, and institutional momentum indexes to map current market regimes.
                  </p>
                </div>
                <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-wire-gold)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Pillar 02</div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-linen)', marginBottom: '8px', fontWeight: 600 }}>SoDEX Contract Routing</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-sage)', lineHeight: '1.6' }}>
                    Signs and dispatches EIP-712 order messages directly to the SoDEX decentralized exchange router for sub-second execution.
                  </p>
                </div>
                <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-wire-gold)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Pillar 03</div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--color-linen)', marginBottom: '8px', fontWeight: 600 }}>On-Chain Risk Controls</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-sage)', lineHeight: '1.6' }}>
                    Enforces automated daily loss thresholds, execution cooldown windows, and maximum position sizes at the contract layer.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Disconnected Gated View */
          <div>
            
            {/* Crisp readable section header outside the blurred container */}
            <div style={{ maxWidth: '480px', margin: '0 auto 20px auto' }}>
              <h3 style={{ 
                fontFamily: 'var(--font-display)', 
                fontSize: '1.4rem', 
                fontWeight: 800, 
                color: 'var(--color-linen)', 
                borderLeft: '4px solid var(--color-wire-gold)', 
                paddingLeft: '16px',
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                margin: 0
              }}>
                Latest Market News
              </h3>
            </div>

            {/* Clickable Gated Area Wrapper (Centers absolutely positioned children relative to it) */}
            <div 
              onClick={() => setIsConnectModalOpen(true)}
              style={{ 
                cursor: 'pointer', 
                maxWidth: '480px', 
                margin: '0 auto', 
                position: 'relative',
                borderRadius: '14px',
                overflow: 'hidden' // Keeps absolute overlay inside card boundaries
              }}
            >
              {/* Preview content container (unblurred here, blurred by overlay backdrop-filter) */}
              <div 
                style={{ 
                  opacity: 0.6, 
                  transition: 'all 0.5s ease',
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
              >
                {/* Single compact latest story card instead of full huge feed */}
                <div style={{ 
                  padding: '16px 20px', 
                  borderRadius: '14px', 
                  border: '1px solid var(--glass-border)',
                  background: 'var(--glass-surface)',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ 
                      fontSize: '0.65rem', 
                      fontFamily: 'var(--font-mono)', 
                      fontWeight: 700, 
                      textTransform: 'uppercase', 
                      color: latestStory?.type === 'breaking' ? 'var(--color-shift-red)' : 'var(--color-wire-gold)',
                      background: 'rgba(236, 223, 204, 0.05)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(236, 223, 204, 0.1)'
                    }}>
                      {latestStory?.type || 'Update'}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)' }}>
                      5m ago
                    </span>
                  </div>

                  <h4 style={{ 
                    fontFamily: 'var(--font-display)', 
                    fontSize: '0.95rem', 
                    color: 'var(--color-linen)', 
                    lineHeight: '1.4',
                    margin: 0
                  }}>
                    {latestStory?.title || 'Loading latest market shift intelligence...'}
                  </h4>

                  <p style={{ 
                    fontSize: '0.78rem', 
                    color: 'var(--color-sage)', 
                    lineHeight: '1.5',
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {latestStory?.summary || 'Autonomous agent monitoring ETF trends and on-chain order flows.'}
                  </p>
                </div>
              </div>

              {/* Central Call to Action Overlay (Fits EXACTLY 100% width and height on top of the card) */}
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 20,
                  borderRadius: '14px',
                  border: '1px solid rgba(212, 168, 83, 0.35)',
                  background: 'rgba(30, 32, 30, 0.65)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(212, 168, 83, 0.1)'
                }}
              >
                <h2 style={{ 
                  fontSize: '1.15rem', 
                  color: 'var(--color-wire-gold)', 
                  fontWeight: 700, 
                  fontFamily: 'var(--font-display)', 
                  margin: 0,
                  letterSpacing: '-0.01em'
                }}>
                  Unlock Market News
                </h2>
                <p style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--color-linen)', 
                  opacity: 0.8,
                  lineHeight: '1.45', 
                  fontFamily: 'var(--font-body)', 
                  margin: 0,
                  maxWidth: '360px'
                }}>
                  Connect Web3 wallet to read this story, track ETF flows, and view SoDEX trades.
                </p>
                <button 
                  onClick={() => setIsConnectModalOpen(true)}
                  className="btn-hero-primary"
                  style={{ 
                    padding: '8px 20px', 
                    fontSize: '0.75rem', 
                    fontWeight: 700, 
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    border: 'none'
                  }}
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Landing Page Features (Visible in both states, before footer) */}
        <div style={{ marginTop: '56px', borderTop: '1px solid rgba(236,223,204,0.06)', paddingTop: '40px' }}>
          <h3 style={{ 
            fontFamily: 'var(--font-display)', 
            fontSize: '1.25rem', 
            fontWeight: 800, 
            color: 'var(--color-linen)', 
            borderLeft: '4px solid var(--color-wire-gold)', 
            paddingLeft: '16px',
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            marginBottom: '28px',
            margin: '0 0 28px 0'
          }}>
            Protocol Capabilities
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            {/* Feature 1: Cryptographic Signatures */}
            <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '0.65rem', 
                  color: 'var(--color-wire-gold)', 
                  background: 'rgba(212, 168, 83, 0.08)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(212, 168, 83, 0.2)'
                }}>
                  SECURITY
                </span>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-linen)', margin: 0 }}>
                  EIP-712 Order Verification
                </h4>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-sage)', lineHeight: '1.6', margin: 0 }}>
                Cinder validates all trading parameters off-chain using signed typed structured data. This prevents unauthorized execution and guarantees order validity on the smart contract layer.
              </p>
              
              {/* Simulated signature console */}
              <div style={{ 
                background: 'rgba(15,16,14,0.4)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: '12px', 
                padding: '14px', 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.7rem', 
                color: 'var(--color-linen)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ color: 'var(--color-sage)' }}>// OFF-CHAIN ORDER PAYLOAD</div>
                <div>{`{`}</div>
                <div style={{ paddingLeft: '12px' }}>"signer": <span style={{ color: 'var(--color-wire-gold)' }}>"0x71C...39A"</span>,</div>
                <div style={{ paddingLeft: '12px' }}>"route": <span style={{ color: 'var(--color-data-blue)' }}>"SoDEX_Router"</span>,</div>
                <div style={{ paddingLeft: '12px' }}>"limit": <span style={{ color: 'var(--color-pulse-green)' }}>15,000 USDC</span></div>
                <div>{`}`}</div>
                <div style={{ borderTop: '1px solid rgba(236,223,204,0.06)', marginTop: '6px', paddingTop: '6px', color: 'var(--color-pulse-green)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  sig: 0x8b32f22d...15e21a
                </div>
              </div>
            </div>

            {/* Feature 2: Multi-Gate Risk Engine */}
            <div className="clay-glass" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '0.65rem', 
                  color: 'var(--color-wire-gold)', 
                  background: 'rgba(212, 168, 83, 0.08)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(212, 168, 83, 0.2)'
                }}>
                  RISK CONTROL
                </span>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-linen)', margin: 0 }}>
                  Multi-Gate Risk Engine
                </h4>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-sage)', lineHeight: '1.6', margin: 0 }}>
                Every automated transaction passes through five independent validation checkgates. These constraints prevent systemic slippage, run-away trading cycles, and excessive portfolio exposure.
              </p>
              
              {/* Checkgates visual list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.75rem', marginTop: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(236,223,204,0.04)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--color-linen)', fontWeight: 500 }}>1. Cooldown Constraint</span>
                  <span style={{ color: 'var(--color-pulse-green)', fontFamily: 'var(--font-mono)' }}>VERIFIED</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(236,223,204,0.04)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--color-linen)', fontWeight: 500 }}>2. Max Daily Drawdown (&lt;3.0%)</span>
                  <span style={{ color: 'var(--color-pulse-green)', fontFamily: 'var(--font-mono)' }}>VERIFIED</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(236,223,204,0.04)', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--color-linen)', fontWeight: 500 }}>3. Max Position Limit (&lt;15%)</span>
                  <span style={{ color: 'var(--color-pulse-green)', fontFamily: 'var(--font-mono)' }}>VERIFIED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connect Wallet Modal Pop-out Overlay */}
      <AnimatePresence>
        {isConnectModalOpen && (
          <div className="story-modal-wrapper-fixed">
            <motion.div 
              className="story-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConnectModalOpen(false)}
            />

            <motion.div 
              className="story-modal-content clay-glass"
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              style={{ maxWidth: '480px' }}
            >
              <div className="story-modal-header">
                <button 
                  onClick={() => setIsConnectModalOpen(false)} 
                  className="story-modal-back-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 8H2M2 8L7 13M2 8L7 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Back</span>
                </button>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-wire-gold)', fontWeight: 700 }}>
                  Demo Connection
                </div>
              </div>

              <div className="story-modal-scroll-area" style={{ padding: '28px 24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.40rem', color: 'var(--color-linen)', fontFamily: 'var(--font-display)', marginBottom: '12px', fontWeight: 700 }}>
                  Connect Wallet
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-sage)', lineHeight: '1.6', fontFamily: 'var(--font-body)', marginBottom: '24px' }}>
                  Connect Web3 wallet to access ETF flow trends, regime shift alerts, and automated execution signatures.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button 
                    onClick={() => handleConnectProvider('MetaMask')}
                    className="clay-glass"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(236,223,204,0.06)',
                      background: 'rgba(236,223,204,0.02)',
                      color: 'var(--color-linen)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#E2761B' }} />
                    <span>MetaMask</span>
                  </button>

                  <button 
                    onClick={() => handleConnectProvider('WalletConnect')}
                    className="clay-glass"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(236,223,204,0.06)',
                      background: 'rgba(236,223,204,0.02)',
                      color: 'var(--color-linen)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3B99FC' }} />
                    <span>WalletConnect</span>
                  </button>

                  <button 
                    onClick={() => handleConnectProvider('Coinbase Wallet')}
                    className="clay-glass"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(236,223,204,0.06)',
                      background: 'rgba(236,223,204,0.02)',
                      color: 'var(--color-linen)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0052FF' }} />
                    <span>Coinbase Wallet</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <Footer />
    </main>
  );
}
