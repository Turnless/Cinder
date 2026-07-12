'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';

export default function QuickTrade({ onTradeSuccess }) {
  // Order params
  const [pair, setPair] = useState('BTC-USDC');
  const [side, setSide] = useState('buy');
  const [orderType, setOrderType] = useState('market');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [stopLossPercentage, setStopLossPercentage] = useState(8);
  const [useStopLoss, setUseStopLoss] = useState(true);

  // Flow control states
  const [step, setStep] = useState('input'); // 'input', 'review', 'signing', 'success', 'error'
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [signatureHex, setSignatureHex] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [executionResult, setExecutionResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleConnectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask or another EVM wallet was not detected in this browser.');
      return;
    }
    setIsConnecting(true);
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      setWalletAddress(accounts[0]);
    } catch (e) {
      console.error(e);
      alert('Failed to connect wallet: ' + e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReviewOrder = () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
      alert('Please enter a valid limit price.');
      return;
    }
    setStep('review');
  };

  const handleExecuteTrade = async (signingScheme) => {
    setStep('signing');
    setLoading(true);
    setErrorMessage('');

    try {
      let finalPrice = price || '0.0';
      if (orderType === 'market') {
        finalPrice = pair.startsWith('BTC') ? '64850.00' : '3210.00';
      }

      const slPrice = useStopLoss 
        ? (side === 'buy' 
            ? (parseFloat(finalPrice) * (1 - stopLossPercentage / 100)).toFixed(2)
            : (parseFloat(finalPrice) * (1 + stopLossPercentage / 100)).toFixed(2)
          )
        : null;

      let signature = '0x';

      if (signingScheme === 'browser') {
        if (!walletAddress) {
          throw new Error('Wallet not connected. Connect web3 wallet first.');
        }

        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();

        const domain = {
          name: 'spot',
          version: '1',
          chainId: 138565, // SoDEX Spot Testnet chainId
          verifyingContract: '0x0000000000000000000000000000000000000000'
        };

        const types = {
          ExchangeAction: [
            { name: 'payloadHash', type: 'bytes32' },
            { name: 'nonce', type: 'uint64' }
          ]
        };

        const actionType = 'newOrder';
        const orderParams = {
          pair,
          side,
          orderType,
          quantity: String(quantity),
          price: String(finalPrice),
          stopPrice: slPrice ? String(slPrice) : '0.0'
        };

        const payloadJson = JSON.stringify({ type: actionType, params: orderParams });
        const payloadHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadJson));
        const nonce = Date.now();

        const message = { payloadHash, nonce };

        signature = await signer._signTypedData(domain, types, message);
        setSignatureHex(signature);
      }

      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pair,
          side,
          orderType,
          quantity,
          price: finalPrice,
          stopLossPrice: slPrice,
          clientSignature: signature !== '0x' ? signature : null,
          clientWallet: walletAddress || null
        }),
      });

      const data = await response.json();
      if (data.success) {
        setExecutionResult(data);
        setStep('success');
        if (onTradeSuccess) onTradeSuccess();
      } else {
        throw new Error(data.error || 'Server rejected order execution.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Signature rejected or trade failed risk gates checks.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="quick-trade clay-glass" style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h3 className="section-heading" style={{ fontSize: '1.25rem' }}>
            Quick Trade Execution
          </h3>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)', marginTop: '2px' }}>
            Place manual orders with EIP-712 client signing
          </p>
        </div>
        
        {walletAddress ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', backgroundColor: 'rgba(74, 222, 128, 0.08)', color: 'var(--color-pulse-green)', border: '1px solid rgba(74, 222, 128, 0.25)', padding: '4px 10px', borderRadius: 'var(--radius-full)' }}>
            Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
        ) : (
          <button
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className="btn-hero-secondary"
            style={{ fontSize: '0.68rem', padding: '6px 12px', borderRadius: 'var(--radius-full)' }}
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step === 'input' && (
          <motion.div
            key="input-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* BUY / SELL Switch */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', backgroundColor: 'var(--color-obsidian)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
              <button
                type="button"
                onClick={() => setSide('buy')}
                style={{
                  border: 'none',
                  padding: '8px 0',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  backgroundColor: side === 'buy' ? 'var(--color-pulse-green)' : 'transparent',
                  color: side === 'buy' ? 'var(--color-obsidian)' : 'var(--color-sage)',
                  transition: 'all 0.2s ease'
                }}
              >
                BUY / LONG
              </button>
              <button
                type="button"
                onClick={() => setSide('sell')}
                style={{
                  border: 'none',
                  padding: '8px 0',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  backgroundColor: side === 'sell' ? 'var(--color-shift-red)' : 'transparent',
                  color: side === 'sell' ? 'var(--color-linen)' : 'var(--color-sage)',
                  transition: 'all 0.2s ease'
                }}
              >
                SELL / SHORT
              </button>
            </div>

            {/* Asset Pair Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-sage)' }}>Trading Asset Pair</label>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                style={{
                  backgroundColor: 'var(--color-iron)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--color-linen)',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              >
                <option value="BTC-USDC">BTC-USDC (Bitcoin)</option>
                <option value="ETH-USDC">ETH-USDC (Ethereum)</option>
                <option value="SOL-USDC">SOL-USDC (Solana)</option>
                <option value="UNI-USDC">UNI-USDC (Uniswap)</option>
                <option value="AAVE-USDC">AAVE-USDC (Aave)</option>
              </select>
            </div>

            {/* Order Type and Quantity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-sage)' }}>Order Type</label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  style={{
                    backgroundColor: 'var(--color-iron)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--color-linen)',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                >
                  <option value="market">Market Order</option>
                  <option value="limit">Limit Order</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-sage)' }}>Quantity</label>
                <input
                  type="number"
                  placeholder="0.00"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  style={{
                    backgroundColor: 'var(--color-iron)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--color-linen)',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Limit Price */}
            {orderType === 'limit' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-sage)' }}>Limit Price (USDC)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  style={{
                    backgroundColor: 'var(--color-iron)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--color-linen)',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
              </motion.div>
            )}

            {/* Stop Loss Checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px' }}>
              <input
                type="checkbox"
                id="stoploss"
                checked={useStopLoss}
                onChange={(e) => setUseStopLoss(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="stoploss" style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-sage)', cursor: 'pointer' }}>
                Attach Trailing Stop Loss
              </label>
            </div>

            {useStopLoss && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}
              >
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-linen)' }}>
                  Stop Loss Threshold: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stopLossPercentage}%</span>
                </label>
                <input
                  type="range"
                  min="3"
                  max="15"
                  value={stopLossPercentage}
                  onChange={(e) => setStopLossPercentage(parseInt(e.target.value))}
                  className="slider-input"
                />
              </motion.div>
            )}

            {/* Review Button */}
            <button
              type="button"
              onClick={handleReviewOrder}
              className="btn-hero-primary"
              style={{ width: '100%', marginTop: '16px' }}
            >
              Review Order Details
            </button>
          </motion.div>
        )}

        {step === 'review' && (
          <motion.div
            key="review-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ backgroundColor: 'rgba(60, 61, 55, 0.25)', border: '1px solid var(--glass-border)', padding: '16px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.8rem' }}>
              <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-linen)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', marginBottom: '4px' }}>Confirm Order Details</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-sage)' }}>Transaction Side:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', color: side === 'buy' ? 'var(--color-pulse-green)' : 'var(--color-shift-red)' }}>{side}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-sage)' }}>Asset Pair:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-linen)' }}>{pair}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-sage)' }}>Order Type:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-linen)', textTransform: 'uppercase' }}>{orderType}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-sage)' }}>Quantity:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-linen)' }}>{quantity}</span>
              </div>
              {orderType === 'limit' && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-sage)' }}>Limit Price:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-linen)' }}>${parseFloat(price).toFixed(2)}</span>
                </div>
              )}
              {useStopLoss && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-sage)' }}>Trailing Stop Loss:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-shift-red)' }}>{stopLossPercentage}%</span>
                </div>
              )}
            </div>

            {/* Execute Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {walletAddress ? (
                <button
                  type="button"
                  onClick={() => handleExecuteTrade('browser')}
                  className="btn-hero-primary"
                  style={{ width: '100%', backgroundColor: 'var(--color-pulse-green)', borderColor: 'var(--color-pulse-green)', color: 'var(--color-obsidian)' }}
                >
                  Sign EIP-712 & Execute
                </button>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.72rem', color: 'var(--color-alert-amber)', marginBottom: '4px' }}>
                  Connect Web3 Wallet above to sign orders locally, or execute using server credentials:
                </div>
              )}
              
              <button
                type="button"
                onClick={() => handleExecuteTrade('server')}
                className="btn-hero-secondary"
                style={{ width: '100%' }}
              >
                Execute with Server API Key
              </button>

              <button
                type="button"
                onClick={() => setStep('input')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  color: 'var(--color-sage)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  marginTop: '8px'
                }}
              >
                Go Back
              </button>
            </div>
          </motion.div>
        )}

        {step === 'signing' && (
          <motion.div
            key="signing-loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', textAlign: 'center', fontSize: '0.75rem' }}
          >
            <div 
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid var(--color-data-blue)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'pulse-live 1.2s linear infinite',
                marginBottom: '16px'
              }} 
            />
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-linen)', marginBottom: '4px' }}>Waiting for Signature Confirmation</h4>
            <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-sage)', maxWidth: '240px', lineHeight: 1.4 }}>
              Confirm the EIP-712 typed transaction request inside your browser extension or verify API key auth...
            </p>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            key="success-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 0', textAlign: 'center', fontSize: '0.75rem' }}
          >
            <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(74, 222, 128, 0.08)', color: 'var(--color-pulse-green)', border: '2px solid var(--color-pulse-green)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', margin: '0 auto 8px auto' }}>
              ✓
            </div>
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-pulse-green)' }}>Order Executed Successfully!</h4>
            
            <div style={{ backgroundColor: 'rgba(60, 61, 55, 0.25)', border: '1px solid var(--glass-border)', padding: '16px', borderRadius: 'var(--radius-lg)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-linen)' }}>
              <div><b>Trade ID:</b> {executionResult?.tradeId}</div>
              <div><b>SoDEX Order ID:</b> {executionResult?.sodexOrderId}</div>
              <div><b>Execution Status:</b> {executionResult?.status}</div>
              <div><b>Execution Fill Price:</b> ${parseFloat(executionResult?.fillPrice || 0).toLocaleString()}</div>
            </div>

            <button
              type="button"
              onClick={() => {
                setQuantity('');
                setPrice('');
                setStep('input');
              }}
              className="btn-hero-secondary"
              style={{ width: '100%', marginTop: '8px' }}
            >
              Place Another Order
            </button>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div
            key="error-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 0', textAlign: 'center', fontSize: '0.75rem' }}
          >
            <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(239, 68, 68, 0.08)', color: 'var(--color-shift-red)', border: '2px solid var(--color-shift-red)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 'bold', margin: '0 auto 8px auto' }}>
              !
            </div>
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-shift-red)' }}>Order Execution Failed</h4>
            <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-sage)', leadingRelaxed: 1.4, maxWidth: '240px', margin: '0 auto' }}>
              {errorMessage || 'Signature rejected or trade failed risk gates checks.'}
            </p>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setStep('review')}
                className="btn-hero-secondary"
                style={{ flex: 1 }}
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => setStep('input')}
                className="btn-hero-primary"
                style={{ flex: 1 }}
              >
                Edit Parameters
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
