'use client';

import { motion } from 'framer-motion';
import Header from '../components/shared/Header';
import StoryFeed from '../components/wire/StoryFeed';
import TemperatureGauge from '../components/narrative/TemperatureGauge';

export default function HomePage() {
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

        <div className="hero-content">
          <motion.span 
            className="hero-eyebrow"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            AlphaWire Financial Intelligence
          </motion.span>
          
          <motion.h1 
            className="hero-headline"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          >
            The AI Newsroom That Trades Its Own Stories
          </motion.h1>
          
          <motion.p 
            className="hero-subhead"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.25 }}
          >
            Real-time ETF flow analytics and market sentiment classification, driving autonomous risk-managed trade execution on SoDEX.
          </motion.p>
          
          <motion.div 
            className="hero-ctas"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
          >
            <a href="/dashboard" className="btn-hero-primary">
              Narrative Dashboard
            </a>
            <a href="/portfolio" className="btn-hero-secondary">
              Configure Risk Limits
            </a>
          </motion.div>
        </div>
      </section>

      {/* Main Wire Feed Layout */}
      <div className="container">
        <div className="feed-layout">
          <div className="feed-column">
            <StoryFeed />
          </div>
          <div className="sidebar-column">
            <div className="clay-glass" style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
              <h3 className="section-heading" style={{ fontSize: '1.15rem', marginBottom: 'var(--space-md)' }}>Active Market Sentiment</h3>
              <TemperatureGauge />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
