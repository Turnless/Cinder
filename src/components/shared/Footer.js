'use client';

import Link from 'next/link';
import { getSodexNetwork } from '../../lib/sodex-network';

const network = getSodexNetwork();

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="site-footer-logo" aria-label="Cinder home">
            <span style={{ color: 'var(--color-linen)' }}>Cin</span>
            <span style={{ color: 'var(--color-wire-gold)' }}>der</span>
          </Link>
          <p>
            Trades run on {network.label}{network.isMainnet ? ' with real funds' : ' with test funds'}. Nothing on this
            site is financial advice.
          </p>
        </div>

        <nav className="site-footer-nav" aria-label="Footer">
          <Link href="/feed">Feed</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/portfolio">Portfolio</Link>
          <a href="https://github.com/Turnless/Cinder" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
        </nav>
      </div>

      <div className="site-footer-inner site-footer-legal">
        <span>&copy; {new Date().getFullYear()} Cinder. MIT License.</span>
        <span>Data from SoSoValue. Execution on SoDEX.</span>
      </div>
    </footer>
  );
}
