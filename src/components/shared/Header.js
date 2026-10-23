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
  const {
    isConnected,
    walletAddress,
    balance,
    isDemoBalance,
    ethBalance,
    isClaiming,
    disconnectWallet,
    claimFaucet
  } = useWallet();

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

  // Claiming keeps the panel open so the result is visible in the balance
  const handleClaim = async () => {
    await claimFaucet();
  };

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
                <span className="hd-wallet-balance">
                  {balance.toLocaleString()} CNDR{isDemoBalance ? ' (demo)' : ''}
                </span>
                <span className="hd-wallet-address">{shortAddress}</span>
              </button>

              {walletOpen && (
                <div id="hd-wallet-panel" className="hd-panel hd-wallet-panel">
                  <p className="hd-panel-label">Connected wallet</p>
                  <p className="hd-wallet-full">{walletAddress}</p>

                  <dl className="hd-wallet-figures">
                    <div>
                      <dt>CNDR</dt>
                      <dd>{balance.toLocaleString()}</dd>
                    </div>
                    {ethBalance !== null && (
                      <div>
                        <dt>ETH for gas</dt>
                        <dd>{ethBalance}</dd>
                      </div>
                    )}
                  </dl>
                  {isDemoBalance && (
                    <p className="hd-panel-note">
                      Demo balance, kept in this browser. No CNDR contract is configured.
                    </p>
                  )}

                  <div className="hd-panel-actions">
                    <button
                      type="button"
                      className="hd-button hd-button-primary"
                      onClick={handleClaim}
                      disabled={isClaiming}
                    >
                      {isClaiming ? 'Claiming 10,000 test CNDR' : 'Claim 10,000 test CNDR'}
                    </button>
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
