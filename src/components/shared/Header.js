'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '../../context/WalletContext';
import '../../styles/header.css';

const NAV_ITEMS = [
  { href: '/feed', label: 'Feed' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/portfolio', label: 'Portfolio' }
];

// Closes a pop-up on Escape or on a click outside `containerRef`, then hands focus back to `returnRef`
function useDismiss(open, setOpen, containerRef, returnRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        returnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, containerRef, returnRef]);
}

export default function Header() {
  const pathname = usePathname();
  const { isConnected, walletAddress, network, account, tradingKey, disconnectWallet } = useWallet();

  const [walletOpen, setWalletOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const walletRef = useRef(null);
  const walletButtonRef = useRef(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  useDismiss(walletOpen, setWalletOpen, walletRef, walletButtonRef);
  useDismiss(menuOpen, setMenuOpen, menuRef, menuButtonRef);

  const shortAddress = walletAddress
    ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
    : '';

  // Close the phone menu after navigating, and when the window grows past the phone layout
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const usdc = account.usdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const buttonBalance = {
    ready: `${usdc} USDC`,
    loading: 'Loading',
    missing: 'No SoDEX account',
    error: 'SoDEX unavailable'
  }[account.status] || '';
  const keyExpires = tradingKey
    ? new Date(Number(tradingKey.expiresAt)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  const handleDisconnect = () => {
    setWalletOpen(false);
    disconnectWallet();
  };

  return (
    <header className="hd">
      <nav className="hd-bar" aria-label="Main">
        <Link href="/" className="hd-logo">
          <span className="hd-logo-a">Cin</span><span className="hd-logo-b">der</span>
        </Link>

        {isConnected && (
          <div className="hd-right">
            <ul className="hd-links">
              {NAV_ITEMS.map(item => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hd-link"
                    aria-current={pathname === item.href ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hd-wallet" ref={walletRef}>
              <button
                ref={walletButtonRef}
                type="button"
                className="hd-wallet-button"
                aria-expanded={walletOpen}
                aria-controls="hd-wallet-panel"
                onClick={() => setWalletOpen(open => !open)}
              >
                <span className="hd-wallet-balance">{buttonBalance}</span>
                <span className="hd-wallet-address">{shortAddress}</span>
              </button>

              {walletOpen && (
                <div id="hd-wallet-panel" className="hd-panel hd-wallet-panel">
                  <p className="hd-panel-label">Connected wallet</p>
                  <p className="hd-wallet-full">{walletAddress}</p>

                  {account.status === 'missing' ? (
                    <p className="hd-panel-note">
                      This wallet has no {network.label} account yet. Open SoDEX with this wallet to create one and add USDC.
                    </p>
                  ) : (
                    <dl className="hd-wallet-figures">
                      <div>
                        <dt>USDC available</dt>
                        <dd>{account.status === 'ready' ? usdc : 'Loading'}</dd>
                      </div>
                      <div>
                        <dt>Trading</dt>
                        <dd>{keyExpires ? `On until ${keyExpires}` : 'Off'}</dd>
                      </div>
                    </dl>
                  )}
                  {account.status === 'error' && (
                    <p className="hd-panel-note">SoDEX could not be reached: {account.error}</p>
                  )}
                  <p className="hd-panel-note">
                    Funds stay in your own {network.label} account. Cinder never holds them.
                  </p>

                  <div className="hd-panel-actions">
                    <a className="hd-button hd-button-primary" href={network.appUrl} target="_blank" rel="noreferrer">
                      {account.status === 'missing' ? 'Open SoDEX' : 'Add USDC on SoDEX'}
                    </a>
                    <button type="button" className="hd-button" onClick={handleDisconnect}>
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="hd-menu" ref={menuRef}>
              <button
                ref={menuButtonRef}
                type="button"
                className="hd-menu-button"
                aria-expanded={menuOpen}
                aria-controls="hd-menu-panel"
                onClick={() => setMenuOpen(open => !open)}
              >
                {menuOpen ? 'Close' : 'Menu'}
              </button>

              {menuOpen && (
                <ul id="hd-menu-panel" className="hd-panel hd-menu-panel">
                  {NAV_ITEMS.map(item => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="hd-menu-link"
                        aria-current={pathname === item.href ? 'page' : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
