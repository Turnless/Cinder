'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LiveIndicator from './LiveIndicator';
import { useWallet } from '../../context/WalletContext';

export default function Header() {
  const pathname = usePathname();
  const { 
    isConnected, 
    walletAddress, 
    balance, 
    ethBalance,
    isClaiming, 
    disconnectWallet, 
    claimFaucet 
  } = useWallet();
  
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const shortAddress = walletAddress 
    ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}` 
    : '';

  // Close dropdown when clicking anywhere outside of it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Handle claiming test tokens and then automatically close the dropdown
  const handleClaim = async () => {
    await claimFaucet();
    setShowDropdown(false);
  };

  return (
    <header className="site-header" style={{ position: 'sticky', top: 0, zIndex: 1000 }}>
      <nav className="nav-container">
        <div className="logo-section">
          <Link href="/" className="logo-link">
            <span className="logo-alpha">Cin</span>
            <span className="logo-wire">der</span>
          </Link>
          <LiveIndicator />
        </div>
        
        <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          {isConnected && (
            <ul className="nav-links">
              <li>
                <Link href="/" className={pathname === '/' ? 'active' : ''}>
                  Feed
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className={pathname === '/dashboard' ? 'active' : ''}>
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className={pathname === '/portfolio' ? 'active' : ''}>
                  Portfolio
                </Link>
              </li>
            </ul>
          )}
          
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            {isConnected && (
              <div 
                className="wallet-pill clay-glass" 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '6px 12px', 
                  borderRadius: '12px', 
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid rgba(212, 168, 83, 0.25)',
                  backgroundColor: 'rgba(60, 61, 55, 0.45)',
                  userSelect: 'none'
                }}
              >
                <span style={{ color: 'var(--color-wire-gold)', fontWeight: 700 }}>
                  {balance.toLocaleString()} CNDR
                </span>
                <span style={{ width: '1px', height: '12px', backgroundColor: 'var(--glass-border)' }}></span>
                <span style={{ color: 'var(--color-linen)', opacity: 0.9 }}>
                  {shortAddress}
                </span>
              </div>
            )}

            {/* Wallet Dropdown Options */}
            {isConnected && showDropdown && (
              <div 
                className="clay-glass"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '240px',
                  padding: '16px',
                  borderRadius: '16px',
                  zIndex: 999,
                  backgroundColor: 'var(--color-obsidian)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                }}
              >
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-sage)', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 600 }}>Active Wallet</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-linen)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px' }}>{walletAddress}</div>
                  {ethBalance !== null && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-sage)', fontFamily: 'var(--font-mono)' }}>
                      Balance: <span style={{ color: 'var(--color-linen)' }}>{ethBalance} ETH</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleClaim}
                  disabled={isClaiming}
                  className="clay-glass"
                  style={{ 
                    width: '100%', 
                    padding: '10px 0', 
                    borderRadius: '10px', 
                    backgroundColor: 'rgba(212, 168, 83, 0.08)', 
                    color: 'var(--color-wire-gold)', 
                    border: '1px solid rgba(212, 168, 83, 0.3)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isClaiming ? (
                    <>
                      <span className="shimmer-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-wire-gold)', display: 'inline-block' }} />
                      <span>Claiming 10,000 CNDR...</span>
                    </>
                  ) : (
                    <span>Claim 10,000 Test CNDR</span>
                  )}
                </button>

                <button 
                  onClick={() => {
                    disconnectWallet();
                    setShowDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 0',
                    borderRadius: '10px',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: 'var(--color-shift-red)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Disconnect Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
