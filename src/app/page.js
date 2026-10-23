'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import NarrativePanel from '../components/narrative/NarrativePanel';
import { useWallet } from '../context/WalletContext';
import { useNarrative } from '../lib/use-narrative';
import { getRelativeTimeString as timeAgo, getTypeBadgeLabel } from '../components/wire/story-format';
import '../styles/landing.css';

export default function HomePage() {
  const { isConnected, walletChecked, connectWallet, isConnecting } = useWallet();
  const router = useRouter();

  const narrative = useNarrative();
  const [stories, setStories] = useState({ status: 'loading', items: [] });

  // Connected wallets go straight to the feed
  useEffect(() => {
    if (walletChecked && isConnected) {
      router.push('/feed');
    }
  }, [isConnected, walletChecked, router]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/stories?limit=5')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setStories({ status: 'ready', items: data.success ? data.stories || [] : [] });
      })
      .catch(() => !cancelled && setStories({ status: 'error', items: [] }));

    return () => { cancelled = true; };
  }, []);

  const latest = stories.items[0];
  const risk = narrative.risk;
  const allocation = risk ? Math.round(risk.maxAllocation * 100) : 30;
  const stopLoss = risk ? Math.round(risk.stopLossPercentage * 100) : 8;
  const cooldown = risk ? risk.cooldownHours : 48;

  return (
    <main className="landing">
      <Header />

      <div className="landing-wrap">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div>
            <h1 id="landing-title" className="landing-headline">
              A newsroom that trades its own stories.
            </h1>
            <p className="landing-lede">
              Every hour Cinder reads ETF flows, sector indices and the crypto news, and scores which
              story the market is trading. When that story changes, it publishes the reason first,
              then places the trade on SoDEX.
            </p>

            <div className="landing-actions">
              <button
                type="button"
                className="landing-button"
                onClick={connectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? 'Waiting for your wallet' : 'Connect wallet'}
              </button>
              <a href="#method" className="landing-textlink">How it decides</a>
            </div>

            {latest && (
              <div className="landing-latest">
                <span className="landing-latest-meta">
                  Latest on the wire, {timeAgo(latest.published_at)}
                </span>
                <button type="button" className="landing-latest-title" onClick={connectWallet}>
                  {latest.title}
                </button>
              </div>
            )}
          </div>

          <NarrativePanel narrative={narrative} />
        </section>
      </div>

      <section id="method" className="landing-section" aria-labelledby="method-title">
        <div className="landing-wrap">
          <div className="landing-section-head">
            <h2 id="method-title" className="landing-section-title">How a story becomes a trade</h2>
            <p className="landing-section-intro">
              Every trade Cinder makes has an article behind it, published before the order is placed.
            </p>
          </div>

          <ol className="landing-steps">
            <li>
              <span className="landing-step-number" aria-hidden="true">1</span>
              <h3 className="landing-step-title">Read</h3>
              <p className="landing-step-text">
                Bitcoin and Ether ETF flows, SoSoValue sector indices and the news feed, every hour.
              </p>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">2</span>
              <h3 className="landing-step-title">Score</h3>
              <p className="landing-step-text">
                Eight market narratives each get a temperature: 40% news, 35% ETF flows, 25% sector moves.
              </p>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">3</span>
              <h3 className="landing-step-title">Decide</h3>
              <p className="landing-step-text">
                A shift needs the leading story to cool 15° in two days while another heats 20°,
                with two of the three sources agreeing.
              </p>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">4</span>
              <h3 className="landing-step-title">Publish, then trade</h3>
              <p className="landing-step-text">
                The breaking story goes out, then the order is placed on SoDEX testnet within the limits below.
              </p>
            </li>
          </ol>

          <p className="landing-limits">
            <span><strong>{allocation}%</strong>of the portfolio at most per trade</span>
            {/* Confidence floor is fixed in src/engine/shift-detector.js */}
            <span><strong>80%</strong>confidence needed to act</span>
            <span><strong>{stopLoss}%</strong>trailing stop-loss</span>
            <span><strong>{cooldown} h</strong>between trades</span>
            {risk && <span>Automatic trading is {risk.autoTradeEnabled ? 'on' : 'off'}</span>}
          </p>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="wire-title">
        <div className="landing-wrap">
          <div className="landing-section-head">
            <h2 id="wire-title" className="landing-section-title">The wire</h2>
            <p className="landing-section-intro">
              Headlines are public. Full stories, the dashboard and trading need a connected wallet.
            </p>
          </div>

          {stories.status === 'ready' && stories.items.length > 0 && (
            <div className="landing-wire">
              {stories.items.map(story => (
                <button key={story.id} type="button" className="landing-wire-row" onClick={connectWallet}>
                  <span className="landing-wire-time">{timeAgo(story.published_at)}</span>
                  <span>
                    <span className="landing-wire-title">{story.title}</span>
                    <span className={`landing-wire-kind${story.type === 'breaking' ? ' is-breaking' : ''}`}>
                      {getTypeBadgeLabel(story.type)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {stories.status === 'ready' && stories.items.length === 0 && (
            <p className="landing-section-intro" style={{ marginTop: 32 }}>
              No stories yet. The first ones are published after Cinder&apos;s next hourly check.
            </p>
          )}

          {stories.status === 'error' && (
            <p className="landing-section-intro" style={{ marginTop: 32 }}>
              Headlines could not be loaded. Refresh the page to try again.
            </p>
          )}

          <div className="landing-gate">
            <button type="button" className="landing-button" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting ? 'Waiting for your wallet' : 'Connect wallet to read'}
            </button>
            <p>Uses the wallet installed in your browser, such as MetaMask or Rabby, on Arbitrum Sepolia.</p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
