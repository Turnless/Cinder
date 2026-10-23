'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import StoryFeed from '../../components/wire/StoryFeed';
import NarrativePanel from '../../components/narrative/NarrativePanel';
import { getRelativeTimeString } from '../../components/wire/story-format';
import { useWallet } from '../../context/WalletContext';
import { useNarrative } from '../../lib/use-narrative';
import { NARRATIVE_NAMES } from '../../lib/narratives';
import '../../styles/feed.css';

// Temperatures are recorded hourly; refresh the rail every 5 minutes so a new reading shows up
const NARRATIVE_REFRESH_MS = 5 * 60 * 1000;

export default function FeedPage() {
  const { isConnected, walletChecked } = useWallet();
  const router = useRouter();
  const narrative = useNarrative(NARRATIVE_REFRESH_MS);

  // Route protection: only redirect after the wallet check is complete
  useEffect(() => {
    if (walletChecked && !isConnected) {
      router.push('/');
    }
  }, [isConnected, walletChecked, router]);

  // Nothing while the wallet check runs or during the redirect (prevents a flash of content)
  if (!walletChecked || !isConnected) {
    return <main className="feed-page" />;
  }

  const latestShift = narrative.shifts[0];

  return (
    <main className="feed-page">
      <Header />

      <div className="feed-wrap">
        <header className="feed-head">
          <h1 className="feed-title">The wire</h1>
          <p className="feed-intro">
            Cinder&apos;s own stories and the market news it reads, newest first. Breaking stories stay on top for a day.
          </p>
        </header>

        <div className="feed-layout">
          <section className="feed-main" aria-label="Stories">
            <StoryFeed />
          </section>

          <aside className="feed-rail" aria-label="Market state">
            <NarrativePanel narrative={narrative} as="section" titleId="feed-temps-title" />

            <section className="feed-rail-block" aria-labelledby="feed-shift-title">
              <h2 id="feed-shift-title" className="feed-rail-title">Latest shift</h2>
              {latestShift ? (
                <p className="feed-rail-text">
                  {NARRATIVE_NAMES[latestShift.from_narrative] || latestShift.from_narrative} gave way to{' '}
                  {NARRATIVE_NAMES[latestShift.to_narrative] || latestShift.to_narrative},{' '}
                  {Math.round(latestShift.confidence)}% confidence, {getRelativeTimeString(latestShift.detected_at)}.
                </p>
              ) : (
                <p className="feed-rail-text">
                  No shift detected yet. Cinder compares each narrative with its reading two days earlier.
                </p>
              )}
              {narrative.risk && (
                <p className="feed-rail-text">
                  Automatic trading is {narrative.risk.autoTradeEnabled ? 'on' : 'off'}.
                </p>
              )}
              <Link href="/dashboard" className="feed-rail-link">Open the dashboard</Link>
            </section>
          </aside>
        </div>
      </div>

      <Footer />
    </main>
  );
}
