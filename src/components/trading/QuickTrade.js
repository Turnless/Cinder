'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../../context/WalletContext';
import '../../styles/portfolio-page.css';

export default function QuickTrade({ onTradeSuccess }) {
  // Global Web3 Wallet Context
  const { walletAddress: globalWalletAddress, connectWallet: globalConnect, isConnecting: globalConnecting, ensureCorrectNetwork } = useWallet();

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
  const [localWalletAddress, setLocalWalletAddress] = useState('');
  const [isLocalConnecting, setIsLocalConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [executionResult, setExecutionResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Live Price feed state
  const [livePrice, setLivePrice] = useState(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const activeWalletAddress = globalWalletAddress || localWalletAddress;
  const isConnecting = globalConnecting || isLocalConnecting;

  // Poll for the live price of the selected pair
  useEffect(() => {
    let isMounted = true;
    const fetchLivePrice = async () => {
      if (!isMounted) return;
      setFetchingPrice(true);
      try {
        const res = await fetch(`/api/trade?ticker=${pair}`);
        const data = await res.json();
        if (data.success && isMounted) {
          setLivePrice(data.price);
          // If orderType is market, automatically fill the price field for EIP-712 hashing
          if (orderType === 'market') {
            setPrice(data.price);
          }
        }
      } catch (err) {
        console.error('[ERROR] Failed to fetch live price in QuickTrade:', err);
      } finally {
        if (isMounted) setFetchingPrice(false);
      }
    };

    fetchLivePrice();
    const interval = setInterval(fetchLivePrice, 10000); // refresh every 10s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pair, orderType]);

  const handleConnectWallet = async () => {
    if (globalConnect) {
      await globalConnect();
      return;
    }
    
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask or another EVM wallet was not detected in this browser.');
      return;
    }
    setIsLocalConnecting(true);
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      setLocalWalletAddress(accounts[0]);
    } catch (e) {
      console.error(e);
      alert('Failed to connect wallet: ' + e.message);
    } finally {
      setIsLocalConnecting(false);
    }
  };

  const handleReviewOrder = () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      setFormError('Enter a quantity above 0.');
      return;
    }
    if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
      setFormError('Enter a limit price above 0.');
      return;
    }
    setFormError('');
    setStep('review');
  };

  const handleExecuteTrade = async () => {
    setStep('signing');
    setLoading(true);
    setErrorMessage('');

    try {
      // The server fills at its own price; this is only used for the CNDR payment and the signed limit
      const finalPrice = orderType === 'market' ? livePrice : price;
      if (!finalPrice || parseFloat(finalPrice) <= 0) {
        throw new Error('Live price is unavailable right now. Please wait a moment and try again.');
      }

      const slPrice = useStopLoss
        ? (side === 'buy'
            ? (parseFloat(finalPrice) * (1 - stopLossPercentage / 100)).toFixed(2)
            : (parseFloat(finalPrice) * (1 + stopLossPercentage / 100)).toFixed(2)
          )
        : null;

      if (!activeWalletAddress) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }

      // The server verifies signatures against Arbitrum Sepolia; switch before creating the provider
      if (ensureCorrectNetwork) {
        const networkOk = await ensureCorrectNetwork();
        if (!networkOk) {
          throw new Error('Please switch your wallet to Arbitrum Sepolia to trade.');
        }
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const network = await provider.getNetwork();

      // 1. Sign the order first, so rejecting the signature never costs CNDR
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

      const orderParams = {
        pair,
        side,
        orderType,
        quantity: String(quantity),
        price: String(finalPrice),
        stopPrice: slPrice ? String(slPrice) : '0.0'
      };

      const payloadJson = JSON.stringify({ type: 'newOrder', params: orderParams });
      const payloadHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadJson));
      // Signing time doubles as the nonce; the server rejects orders signed more than 5 minutes ago
      const nonce = Date.now();

      const message = { payloadHash, nonce };
      const signature = await signer._signTypedData(domain, types, message);

      // 2. BUY: pay CNDR to the treasury on-chain; the server verifies this transfer
      let txHash = null;
      const tokenAddress = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
      if (side === 'buy' && tokenAddress && tokenAddress !== '0x...' && tokenAddress !== '') {
        const cost = parseFloat(quantity) * parseFloat(finalPrice);
        const tokenAbi = [
          "function transfer(address to, uint256 amount) returns (bool)",
          "function balanceOf(address owner) view returns (uint256)"
        ];
        const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, signer);

        // Verify user has sufficient CNDR balance
        const walletBal = await tokenContract.balanceOf(activeWalletAddress);
        const formattedBal = parseFloat(ethers.utils.formatUnits(walletBal, 18));
        if (formattedBal < cost) {
          throw new Error(`Insufficient CNDR balance. Required: ${cost.toFixed(2)} CNDR. Your balance: ${formattedBal.toFixed(2)} CNDR. Please claim CNDR from the faucet above.`);
        }

        // Treasury address comes from the server; never fall back to a hard-coded address
        const masterRes = await fetch('/api/trade?masterAddress=true');
        const masterData = await masterRes.json();
        if (!masterData.success || !masterData.masterAddress) {
          throw new Error(masterData.error || 'Trading treasury is not configured. Please try again later.');
        }

        setErrorMessage('Please confirm the CNDR transfer in your wallet...');
        const tx = await tokenContract.transfer(masterData.masterAddress, ethers.utils.parseUnits(cost.toFixed(6), 18));
        setErrorMessage('Waiting for CNDR transfer transaction to be mined...');
        await tx.wait();
        txHash = tx.hash;
      }

      // 3. Submit the signed order (with the payment proof for buys)
      setErrorMessage('Submitting signed order...');

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
          clientWallet: activeWalletAddress,
          signature,
          nonce,
          txHash
        }),
      });

      const data = await response.json();
      if (data.success) {
        setExecutionResult(data);
        setStep('success');
        if (onTradeSuccess) onTradeSuccess();
      } else {
        // CNDR was already sent; show the payment hash so the transfer can be traced
        const paymentNote = txHash ? ` (CNDR payment tx: ${txHash})` : '';
        throw new Error((data.error || 'Server rejected order execution.') + paymentNote);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Signature rejected or trade failed risk gates checks.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const base = pair.split('-')[0];
  const unitPrice = orderType === 'market' ? livePrice : price;
  const estimate = parseFloat(quantity) > 0 && parseFloat(unitPrice) > 0
    ? parseFloat(quantity) * parseFloat(unitPrice)
    : null;
  const tokenAddress = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
  const paysOnChain = side === 'buy' && tokenAddress && tokenAddress !== '0x...' && tokenAddress !== '';
  const formatAmount = (n) => parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const resetForm = () => {
    setQuantity('');
    setPrice('');
    setFormError('');
    setStep('input');
  };

  return (
    <section className="qt" aria-labelledby="qt-title">
      <h2 id="qt-title" className="qt-title">Trade</h2>
      <p className="qt-intro">
        Buys are paid in CNDR from your wallet and sells pay CNDR back. Orders run on SoDEX testnet.
      </p>

      {step === 'input' && (
        <div className="qt-form">
          <div className="qt-side" role="group" aria-label="Order side">
            <button type="button" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>Buy</button>
            <button type="button" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>Sell</button>
          </div>

          <label className="qt-field">
            <span>Market</span>
            <select value={pair} onChange={(e) => setPair(e.target.value)}>
              <option value="BTC-USDC">Bitcoin (BTC-USDC)</option>
              <option value="ETH-USDC">Ether (ETH-USDC)</option>
              <option value="SOL-USDC">Solana (SOL-USDC)</option>
              <option value="UNI-USDC">Uniswap (UNI-USDC)</option>
              <option value="AAVE-USDC">Aave (AAVE-USDC)</option>
            </select>
          </label>
          <p className="qt-price" aria-live="polite">
            {livePrice
              ? `1 ${base} = $${formatAmount(livePrice)}`
              : fetchingPrice ? 'Loading the live price' : 'Live price unavailable'}
          </p>

          <div className="qt-row">
            <label className="qt-field">
              <span>Order type</span>
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </label>
            <label className="qt-field">
              <span>Quantity in {base}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          </div>

          {orderType === 'limit' && (
            <label className="qt-field">
              <span>Limit price in USDC</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          )}

          {side === 'buy' && (
            <>
              <label className="qt-check">
                <input type="checkbox" checked={useStopLoss} onChange={(e) => setUseStopLoss(e.target.checked)} />
                <span>Add a trailing stop-loss</span>
              </label>
              {useStopLoss && (
                <label className="qt-field">
                  <span>Sell if the price falls {stopLossPercentage}% below the fill</span>
                  <input
                    type="range"
                    min="3"
                    max="15"
                    value={stopLossPercentage}
                    onChange={(e) => setStopLossPercentage(parseInt(e.target.value))}
                  />
                </label>
              )}
            </>
          )}

          {estimate !== null && (
            <p className="qt-estimate">
              About <strong>{formatAmount(estimate)} CNDR</strong> {side === 'buy' ? 'to pay' : 'to receive'}
            </p>
          )}

          {formError && <p className="qt-error" role="alert">{formError}</p>}

          <button type="button" className="qt-primary" onClick={handleReviewOrder}>Review order</button>
        </div>
      )}

      {step === 'review' && (
        <div className="qt-form">
          <h3 className="qt-subtitle">Check your order</h3>
          <dl className="qt-summary">
            <div><dt>Order</dt><dd>{side === 'buy' ? 'Buy' : 'Sell'} {quantity} {base}</dd></div>
            <div>
              <dt>Type</dt>
              <dd>{orderType === 'market' ? 'Market' : `Limit at $${formatAmount(price)}`}</dd>
            </div>
            {estimate !== null && (
              <div><dt>{side === 'buy' ? 'You pay' : 'You receive'}</dt><dd>about {formatAmount(estimate)} CNDR</dd></div>
            )}
            {side === 'buy' && useStopLoss && (
              <div><dt>Stop-loss</dt><dd>{stopLossPercentage}% below the fill</dd></div>
            )}
          </dl>
          <p className="qt-note">
            Your wallet will ask you to sign the order{paysOnChain ? ', then to send the CNDR payment' : ''}.
            The final price is the live price when the order is filled.
          </p>
          {activeWalletAddress ? (
            <button type="button" className="qt-primary" onClick={() => handleExecuteTrade()}>
              {paysOnChain ? 'Sign and pay' : side === 'buy' ? 'Sign and buy' : 'Sign and sell'}
            </button>
          ) : (
            <button type="button" className="qt-primary" onClick={handleConnectWallet} disabled={isConnecting}>
              {isConnecting ? 'Waiting for your wallet' : 'Connect wallet'}
            </button>
          )}
          <button type="button" className="qt-secondary" onClick={() => setStep('input')}>Edit order</button>
        </div>
      )}

      {step === 'signing' && (
        <div className="qt-status" role="status" aria-live="polite">
          <span className="qt-spinner" aria-hidden="true" />
          <p className="qt-status-title">Waiting for your wallet</p>
          <p className="qt-note">{errorMessage || 'Confirm the request in your wallet.'}</p>
        </div>
      )}

      {step === 'success' && (
        <div className="qt-status" role="status">
          <p className="qt-status-title">
            {executionResult?.simulated ? 'Order recorded as simulated' : 'Order filled'}
          </p>
          {executionResult?.simulated && (
            <p className="qt-note">
              {String(executionResult?.sodexOrderId || '').startsWith('ord_mock_')
                ? 'This server runs without SoDEX credentials, so orders are simulated at the live price.'
                : 'SoDEX did not execute this order, so it was recorded at the live price without a real fill.'}
            </p>
          )}
          <dl className="qt-summary">
            <div><dt>Fill price</dt><dd>${formatAmount(executionResult?.fillPrice || 0)}</dd></div>
            <div><dt>Status</dt><dd>{String(executionResult?.status || '').toLowerCase()}</dd></div>
            {executionResult?.sodexOrderId && (
              <div><dt>Order ID</dt><dd className="qt-id">{executionResult.sodexOrderId}</dd></div>
            )}
          </dl>
          <button type="button" className="qt-secondary" onClick={resetForm}>Place another order</button>
        </div>
      )}

      {step === 'error' && (
        <div className="qt-status" role="alert">
          <p className="qt-status-title is-error">The order did not go through</p>
          <p className="qt-note">{errorMessage || 'The signature was rejected or the order failed a check.'}</p>
          <button type="button" className="qt-primary" onClick={() => setStep('review')}>Try again</button>
          <button type="button" className="qt-secondary" onClick={() => setStep('input')}>Edit order</button>
        </div>
      )}
    </section>
  );
}
