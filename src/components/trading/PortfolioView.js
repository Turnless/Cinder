'use client';

import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../../context/WalletContext';

export default function PortfolioView({ balance = '0.00', positions = [], onTradeSuccess }) {
  const [isLiquidating, setIsLiquidating] = useState(null);
  const { walletAddress: globalWalletAddress, connectWallet: globalConnect, ensureCorrectNetwork } = useWallet();
  const [localWalletAddress, setLocalWalletAddress] = useState('');
  const activeWalletAddress = globalWalletAddress || localWalletAddress;

  const handleConnectWallet = async () => {
    if (globalConnect) {
      await globalConnect();
      return;
    }
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask or another EVM wallet was not detected.');
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      setLocalWalletAddress(accounts[0]);
    } catch (e) {
      console.error(e);
      alert('Failed to connect wallet: ' + e.message);
    }
  };

  const parsedBalance = parseFloat(balance || 0);
  const positionsValue = positions.reduce((acc, pos) => acc + parseFloat(pos.value || 0), 0);
  const totalValue = parsedBalance + positionsValue;
  const safeTotal = totalValue || 1; // prevent division by zero

  const handleClosePosition = async (pos) => {
    if (!confirm(`Are you sure you want to close/sell your entire position in ${pos.asset}?`)) return;
    
    if (!activeWalletAddress) {
      alert('Please connect your wallet first to close positions.');
      return;
    }

    setIsLiquidating(pos.asset);
    try {
      // The server verifies signatures against Arbitrum Sepolia; switch before creating the provider
      if (ensureCorrectNetwork && !(await ensureCorrectNetwork())) {
        throw new Error('Please switch your wallet to Arbitrum Sepolia to close positions.');
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const network = await provider.getNetwork();

      const orderParams = {
        pair: `${pos.asset}-USDC`,
        side: 'sell',
        orderType: 'market',
        quantity: String(pos.quantity),
        price: String(pos.currentPrice),
        stopPrice: '0.0'
      };

      const domain = {
        name: 'spot',
        version: '1',
        chainId: network.chainId,
        verifyingContract: '0x0000000000000000000000000000000000000000'
      };

      const types = {
        ExchangeAction: [
          { name: 'payloadHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint64' }
        ]
      };

      const payloadJson = JSON.stringify({ type: 'newOrder', params: orderParams });
      const payloadHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadJson));
      const nonce = Date.now();
      const signature = await signer._signTypedData(domain, types, { payloadHash, nonce });

      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pair: `${pos.asset}-USDC`,
          side: 'sell',
          orderType: 'market',
          quantity: pos.quantity,
          price: pos.currentPrice,
          clientWallet: activeWalletAddress,
          signature,
          nonce
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Successfully closed position. Order ID: ${data.sodexOrderId}`);
        if (onTradeSuccess) onTradeSuccess();
      } else {
        alert(`Failed to close position: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Error executing sell order: ' + e.message);
    } finally {
      setIsLiquidating(null);
    }
  };

  return (
    <div className="portfolio-view clay-glass" style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <div className="portfolio-card-header">
        <div>
          <h3 className="section-heading" style={{ fontSize: '1.25rem' }}>
            Live Portfolio Overview
          </h3>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)', marginTop: '2px' }}>
            Asset allocations and position values on SoDEX
          </p>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-sage)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
            Total Portfolio Value
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-linen)', marginTop: '2px' }}>
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Allocation breakdown bar */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)', marginBottom: '8px' }}>
          <span>Asset Allocation</span>
          <span>
            Cash: <span style={{ fontFamily: 'var(--font-mono)' }}>{((parsedBalance / safeTotal) * 100).toFixed(1)}%</span> | 
            Positions: <span style={{ fontFamily: 'var(--font-mono)' }}>{((positionsValue / safeTotal) * 100).toFixed(1)}%</span>
          </span>
        </div>
        <div style={{ width: '100%', height: '12px', backgroundColor: 'var(--color-iron)', borderRadius: 'var(--radius-full)', overflow: 'hidden', display: 'flex' }}>
          {/* Cash portion */}
          <div 
            style={{ width: `${(parsedBalance / safeTotal) * 100}%`, height: '100%', backgroundColor: 'var(--color-data-blue)' }}
            title={`Cash (CNDR): $${parsedBalance.toFixed(2)}`}
          />
          {/* Position portions */}
          {positions.map((pos, idx) => {
            const width = (parseFloat(pos.value || 0) / safeTotal) * 100;
            const colors = ['var(--color-wire-gold)', 'var(--color-pulse-green)', 'var(--color-alert-amber)', 'var(--color-shift-red)', 'var(--color-sage)'];
            const color = colors[idx % colors.length];
            return (
              <div 
                key={pos.asset}
                style={{ width: `${width}%`, height: '100%', backgroundColor: color }}
                title={`${pos.asset}: $${parseFloat(pos.value).toFixed(2)}`}
              />
            );
          })}
        </div>
        
        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--color-sage)' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'var(--color-data-blue)' }} />
            <span>CNDR: <span style={{ fontFamily: 'var(--font-mono)' }}>${parsedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
          </div>
          {positions.map((pos, idx) => {
            const colors = ['var(--color-wire-gold)', 'var(--color-pulse-green)', 'var(--color-alert-amber)', 'var(--color-shift-red)', 'var(--color-sage)'];
            const color = colors[idx % colors.length];
            return (
              <div key={pos.asset} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--color-sage)' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', backgroundColor: color }} />
                <span>{pos.asset}: <span style={{ fontFamily: 'var(--font-mono)' }}>${parseFloat(pos.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Positions list */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Entry Price</th>
              <th style={{ textAlign: 'right' }}>Current Price</th>
              <th style={{ textAlign: 'right' }}>Stop Loss</th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th style={{ textAlign: 'right' }}>Return</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', color: 'var(--color-sage)', fontStyle: 'italic', padding: 'var(--space-lg) 0' }}>
                  No active open positions. Cash balance only.
                </td>
              </tr>
            ) : (
              positions.map((pos) => {
                const pnl = parseFloat(pos.return || 0);
                const isProfit = pnl >= 0;
                
                return (
                  <tr key={pos.asset}>
                    <td style={{ fontWeight: 700, color: 'var(--color-linen)' }}>{pos.asset}</td>
                    <td className="data-mono" style={{ textAlign: 'right' }}>{parseFloat(pos.quantity).toFixed(4)}</td>
                    <td className="data-mono" style={{ textAlign: 'right', color: 'var(--color-sage)' }}>${parseFloat(pos.entryPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="data-mono" style={{ textAlign: 'right' }}>${parseFloat(pos.currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="data-mono" style={{ textAlign: 'right', color: 'var(--color-shift-red)' }}>${parseFloat(pos.stopLoss).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="data-mono" style={{ textAlign: 'right', fontWeight: 700 }}>${parseFloat(pos.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="data-mono" style={{ textAlign: 'right', fontWeight: 700, color: isProfit ? 'var(--color-pulse-green)' : 'var(--color-shift-red)' }}>
                      {isProfit ? '+' : ''}{pnl.toFixed(2)}%
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {activeWalletAddress ? (
                        <button
                          onClick={() => handleClosePosition(pos)}
                          disabled={isLiquidating === pos.asset}
                          className="btn-destructive"
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-shift-red)',
                            cursor: 'pointer',
                            opacity: isLiquidating === pos.asset ? 0.5 : 1
                          }}
                        >
                          {isLiquidating === pos.asset ? 'Selling...' : 'Close'}
                        </button>
                      ) : (
                        <button
                          onClick={handleConnectWallet}
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-alert-amber)',
                            backgroundColor: 'rgba(245, 158, 11, 0.08)',
                            color: 'var(--color-alert-amber)',
                            cursor: 'pointer'
                          }}
                        >
                          Connect
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
