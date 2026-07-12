'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer style={{ 
      borderTop: '1px solid var(--glass-border)', 
      backgroundColor: 'rgba(30, 32, 30, 0.85)', 
      backdropFilter: 'blur(20px)',
      padding: '48px 24px 32px 24px',
      marginTop: 'auto',
      fontFamily: 'var(--font-body)'
    }}>
      <div className="container" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '40px',
        maxWidth: '1280px',
        margin: '0 auto'
      }}>
        {/* Top footer row */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '32px'
        }}>
          {/* Brand Col */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              <span style={{ color: 'var(--color-linen)' }}>Cin</span>
              <span style={{ color: 'var(--color-wire-gold)' }}>der</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-sage)', lineHeight: '1.6', maxWidth: '280px' }}>
              Autonomous narrative-driven trade execution and real-time ETF flow analytics.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: 'var(--color-pulse-green)',
                display: 'inline-block',
                boxShadow: '0 0 8px var(--color-pulse-green)'
              }} />
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-pulse-green)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                All systems operational
              </span>
            </div>
          </div>

          {/* Links Col 1: Protocol */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-linen)', letterSpacing: '0.08em', fontWeight: 600 }}>Protocol</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
              <Link href="/" style={{ color: 'var(--color-sage)', transition: 'color 0.2s' }} className="footer-link">Intelligence Feed</Link>
              <Link href="/dashboard" style={{ color: 'var(--color-sage)', transition: 'color 0.2s' }} className="footer-link">Market Dashboard</Link>
              <Link href="/portfolio" style={{ color: 'var(--color-sage)', transition: 'color 0.2s' }} className="footer-link">Risk Portfolio</Link>
            </div>
          </div>

          {/* Links Col 2: Developers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-linen)', letterSpacing: '0.08em', fontWeight: 600 }}>Developers</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
              <a href="https://github.com/Turnless/Cinder" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-sage)', transition: 'color 0.2s' }} className="footer-link">GitHub Repository</a>
              <span style={{ color: 'rgba(105, 117, 101, 0.5)', cursor: 'default' }}>API Docs (Coming Soon)</span>
              <span style={{ color: 'rgba(105, 117, 101, 0.5)', cursor: 'default' }}>Security Audits</span>
            </div>
          </div>

          {/* Links Col 3: Network */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-linen)', letterSpacing: '0.08em', fontWeight: 600 }}>Network</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--color-sage)' }}>Target: Turso DB</span>
              <span style={{ color: 'var(--color-sage)' }}>Execution: SoDEX</span>
              <span style={{ color: 'var(--color-sage)' }}>Version: v1.0.4-demo</span>
            </div>
          </div>
        </div>

        {/* Bottom footer row */}
        <div style={{ 
          borderTop: '1px solid rgba(236, 223, 204, 0.05)', 
          paddingTop: '24px', 
          display: 'flex', 
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          fontSize: '0.75rem',
          color: 'var(--color-sage)'
        }}>
          <div>
            &copy; {new Date().getFullYear()} Cinder. Distributed under the MIT License.
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span style={{ cursor: 'pointer' }}>Terms of Service</span>
            <span style={{ cursor: 'pointer' }}>Privacy Policy</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
