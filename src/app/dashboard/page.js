'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import { useWallet } from '../../context/WalletContext';
import { useNarrative } from '../../lib/use-narrative';
import { NARRATIVE_NAMES } from '../../lib/narratives';
import '../../styles/narratives.css';

// Readings are recorded hourly; check for a new one every 5 minutes
const REFRESH_MS = 5 * 60 * 1000;

function utcTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function utcDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day}, ${utcTime(dateString)}`;
}

/** Recent temperatures on a fixed 0–100 scale, so rows can be compared at a glance. */
function Trend({ series, highlight }) {
  if (series.length < 2) {
    return <span className="narr-trend-empty">First reading</span>;
  }
  const width = 112;
  const height = 30;
  const step = width / (series.length - 1);
  const y = t => height - 2 - (Math.max(0, Math.min(100, t)) / 100) * (height - 4);
  const points = series.map((t, i) => `${(i * step).toFixed(1)},${y(t).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  const low = Math.round(Math.min(...series));
  const high = Math.round(Math.max(...series));

  return (
    <svg
      className={`narr-trend${highlight ? ' is-leader' : ''}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={low === high
        ? `Last ${series.length} readings, steady at ${low}°`
        : `Last ${series.length} readings, between ${low}° and ${high}°`}
    >
      <polyline points={points} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last)} r="2.5" />
    </svg>
  );
}

export default function DashboardPage() {
  const { isConnected, walletChecked } = useWallet();
  const router = useRouter();
  const narrative = useNarrative(REFRESH_MS);

  // Route protection: only redirect after the wallet check is complete
  useEffect(() => {
    if (walletChecked && !isConnected) {
      router.push('/');
    }
  }, [isConnected, walletChecked, router]);

  if (!walletChecked || !isConnected) {
    return <main className="narr-page" />;
  }

  const { status, rows, readAt, risk, shifts } = narrative;
  const leader = rows[0];
  const allocation = risk ? Math.round(risk.maxAllocation * 100) : 30;
  const stopLoss = risk ? Math.round(risk.stopLossPercentage * 100) : 8;
  const cooldown = risk ? risk.cooldownHours : 48;

  return (
    <main className="narr-page">
      <Header />

      <div className="narr-wrap">
        <header className="narr-head">
          <h1 className="narr-title">Narratives</h1>
          <p className="narr-intro">
            The eight stories Cinder tracks, how hard the market is trading each one, and which data is driving it.
          </p>
          {status === 'ready' && leader && (
            <p className="narr-status">
              {leader.name} leads at {leader.temperature}°.
              {readAt && ` Last reading ${utcTime(readAt)}.`}
              {risk && ` Automatic trading is ${risk.autoTradeEnabled ? 'on' : 'off'}.`}
            </p>
          )}
        </header>

        <section className="narr-section" aria-labelledby="narr-table-title">
          <div className="narr-section-head">
            <h2 id="narr-table-title" className="narr-section-title">Temperature and what drives it</h2>
            <p className="narr-section-intro">
              Each temperature blends three scores from 0 to 100: news 40%, ETF flows 35%, sector moves 25%.
              Readings are taken every hour.
            </p>
          </div>

          {status === 'loading' && (
            <div className="narr-loading" aria-label="Loading readings">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="narr-skeleton" />)}
            </div>
          )}

          {status === 'empty' && (
            <p className="narr-message">The first reading appears after Cinder&apos;s next hourly check.</p>
          )}

          {status === 'error' && (
            <p className="narr-message">The readings could not be loaded. Refresh the page to try again.</p>
          )}

          {status === 'ready' && (
            <div className="narr-table-wrap">
              <table className="narr-table">
                <thead>
                  <tr>
                    <th scope="col">Narrative</th>
                    <th scope="col" className="is-number">Temperature</th>
                    <th scope="col">Recent readings</th>
                    <th scope="col" className="is-number">News</th>
                    <th scope="col" className="is-number">ETF flows</th>
                    <th scope="col" className="is-number">Sectors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className={index === 0 ? 'is-leader' : undefined}>
                      <th scope="row">{row.name}</th>
                      <td className="is-number">
                        <span className="narr-temp">{row.temperature}°</span>
                        <span
                          className={`narr-change${row.change > 0 ? ' is-up' : ''}${row.change < 0 ? ' is-down' : ''}`}
                          aria-label={row.change ? `${row.change > 0 ? 'up' : 'down'} ${Math.abs(row.change)} degrees since the last reading` : undefined}
                        >
                          {row.change ? `${row.change > 0 ? '+' : '−'}${Math.abs(row.change)}` : ''}
                        </span>
                      </td>
                      <td><Trend series={row.series} highlight={index === 0} /></td>
                      <td className="is-number narr-score">{row.scores.news}</td>
                      <td className="is-number narr-score">{row.scores.flows}</td>
                      <td className="is-number narr-score">{row.scores.sectors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="narr-section" aria-labelledby="narr-shifts-title">
          <div className="narr-section-head">
            <h2 id="narr-shifts-title" className="narr-section-title">Shifts</h2>
            <p className="narr-section-intro">
              A shift is when the leading narrative cools at least 15° over 48 hours while another heats at least
              20° to 40° or more, with two of the three sources agreeing and 80% confidence. Each one gets a
              breaking story, and a trade if the limits below allow it.
            </p>
          </div>

          {status === 'ready' && shifts.length === 0 && (
            <p className="narr-message">
              No shift detected yet. Cinder compares each narrative with its reading 48 hours earlier, so the first
              shift needs two days of readings.
            </p>
          )}

          {shifts.length > 0 && (
            <ol className="narr-shifts">
              {shifts.map(shift => (
                <li key={shift.id} className="narr-shift">
                  <time className="narr-shift-time" dateTime={shift.detected_at}>{utcDateTime(shift.detected_at)}</time>
                  <div className="narr-shift-main">
                    <p className="narr-shift-title">
                      {NARRATIVE_NAMES[shift.from_narrative] || shift.from_narrative} gave way to{' '}
                      {NARRATIVE_NAMES[shift.to_narrative] || shift.to_narrative}
                    </p>
                    <p className="narr-shift-meta">
                      {Math.round(shift.confidence)}% confidence. {shift.trade_id ? 'Trade placed.' : 'No trade placed.'}
                    </p>
                    {Array.isArray(shift.signals) && shift.signals.length > 0 && (
                      <ul className="narr-shift-signals">
                        {shift.signals.map((signal, i) => <li key={i}>{signal}</li>)}
                      </ul>
                    )}
                    {shift.story_id && (
                      <Link href={`/story/${shift.story_id}`} className="narr-link">Read the story</Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="narr-section" aria-labelledby="narr-limits-title">
          <div className="narr-section-head">
            <h2 id="narr-limits-title" className="narr-section-title">Trading limits</h2>
            <p className="narr-section-intro">
              Every automatic trade on SoDEX testnet has to fit inside these limits.
              {risk && ` Automatic trading is currently ${risk.autoTradeEnabled ? 'on' : 'off'}.`}
            </p>
          </div>
          <dl className="narr-limits">
            <div><dt>Largest trade</dt><dd>{allocation}% of the portfolio</dd></div>
            {/* Confidence floor is fixed in src/engine/shift-detector.js */}
            <div><dt>Confidence needed</dt><dd>80%</dd></div>
            <div><dt>Trailing stop-loss</dt><dd>{stopLoss}%</dd></div>
            <div><dt>Time between trades</dt><dd>{cooldown} h</dd></div>
            <div><dt>Daily loss limit</dt><dd>15%</dd></div>
            <div><dt>Open positions</dt><dd>5 at most</dd></div>
          </dl>
          <Link href="/portfolio" className="narr-link">See your portfolio and trades</Link>
        </section>
      </div>

      <Footer />
    </main>
  );
}
