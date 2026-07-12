'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Header from '../components/shared/Header';
import StoryFeed from '../components/wire/StoryFeed';
import TemperatureGauge from '../components/narrative/TemperatureGauge';

export default function HomePage() {
  const { scrollY } = useScroll();
  
  // Transform hero opacity, scale, and y translation based on scroll position
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.92]);
  const heroY = useTransform(scrollY, [0, 400], [0, -60]);

  return (
    <main>
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
              <a href="/dashboard" className="btn-hero-primary">
                Market Dashboard
              </a>
              <a href="/portfolio" className="btn-hero-secondary">
                Risk Settings
              </a>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Feed scrolls up and overlays the hero */}
      <div className="feed-overlay container">
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
      </div>
    </main>
  );
}

