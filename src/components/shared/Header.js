'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LiveIndicator from './LiveIndicator';

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <nav className="nav-container">
        <div className="logo-section">
          <Link href="/" className="logo-link">
            <span className="logo-alpha">Alpha</span>
            <span className="logo-wire">⚡Wire</span>
          </Link>
          <LiveIndicator />
        </div>
        
        <div className="nav-right">
          <ul className="nav-links">
            <li>
              <Link href="/" className={pathname === '/' ? 'active' : ''}>
                Wire Feed
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className={pathname === '/dashboard' ? 'active' : ''}>
                Narrative Dashboard
              </Link>
            </li>
            <li>
              <Link href="/portfolio" className={pathname === '/portfolio' ? 'active' : ''}>
                Portfolio
              </Link>
            </li>
          </ul>
          
          <Link href="/dashboard" className="btn-launch">
            Launch App
          </Link>
        </div>
      </nav>
    </header>
  );
}
