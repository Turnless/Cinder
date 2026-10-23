'use client';

import { Fragment, useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../../context/WalletContext';

const formatAmount = (n) => parseFloat(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatQuantity = (n) => parseFloat(n || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

/**
 * Open positions with their stop-loss and a two-step "Sell all" per position.
 * @param {{positions: Array, onTradeSuccess?: Function}} props
 */
export default function PortfolioView({ positions = [], onTradeSuccess }) {
  const { walletAddress, ensureCorrectNetwork } = useWallet();
  const [confirming, setConfirming] = useState(null);
  const [selling, setSelling] = useState(null);
  const [message, setMessage] = useState(null);

  const handleClosePosition = async (pos) => {
    setConfirming(null);
    setMessage(null);
    if (!walletAddress) {
      setMessage({ asset: pos.asset, error: true, text: 'Connect your wallet to sell.' });
      return;
    }

    setSelling(pos.asset);
    try {
      // The server verifies signatures against Arbitrum Sepolia; switch before creating the provider
      if (ensureCorrectNetwork && !(await ensureCorrectNetwork())) {
        throw new Error('Switch your wallet to Arbitrum Sepolia to sell.');
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
          clientWallet: walletAddress,
          signature,
          nonce
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({
          asset: pos.asset,
          text: data.simulated
            ? `Sold ${pos.asset} (simulated at $${formatAmount(data.fillPrice)}).`
            : `Sold ${pos.asset} at $${formatAmount(data.fillPrice)}.`
        });
        if (onTradeSuccess) onTradeSuccess();
      } else {
        setMessage({ asset: pos.asset, error: true, text: data.error || 'The sell order was rejected.' });
      }
    } catch (e) {
      console.error(e);
      const rejected = e.code === 'ACTION_REJECTED' || e.code === 4001;
      setMessage({ asset: pos.asset, error: true, text: rejected ? 'You declined the signature, so nothing was sold.' : e.message });
    } finally {
      setSelling(null);
    }
  };

  if (positions.length === 0) {
    return (
      <p className="pf-message">
        No open positions. Use the trade form to buy; your CNDR pays for it.
      </p>
    );
  }

  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col" className="is-number">Bought at</th>
            <th scope="col" className="is-number">Now</th>
            <th scope="col" className="is-number">Value, CNDR</th>
            <th scope="col" className="is-number">Return</th>
            <th scope="col" className="is-number">Stop-loss</th>
            <th scope="col"><span className="pf-visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const pnl = parseFloat(pos.return || 0);
            const current = parseFloat(pos.currentPrice || 0);
            const stop = parseFloat(pos.stopLoss || 0);
            const distance = current > 0 && stop > 0 ? ((current - stop) / current) * 100 : null;
            const rowMessage = message?.asset === pos.asset ? message : null;

            return (
              <Fragment key={pos.asset}>
              <tr className={rowMessage ? 'has-message' : undefined}>
                <th scope="row">
                  {pos.asset}
                  <span className="pf-sub pf-qty">{formatQuantity(pos.quantity)} held</span>
                </th>
                <td className="is-number">${formatAmount(pos.entryPrice)}</td>
                <td className="is-number">${formatAmount(pos.currentPrice)}</td>
                <td className="is-number pf-strong">{formatAmount(pos.value)}</td>
                <td className={`is-number ${pnl > 0 ? 'is-up' : pnl < 0 ? 'is-down' : ''}`}>
                  {pnl > 0 ? '+' : pnl < 0 ? '−' : ''}{Math.abs(pnl).toFixed(2)}%
                </td>
                <td className="is-number">
                  {stop > 0 ? (
                    <>
                      ${formatAmount(stop)}
                      {distance !== null && (
                        <span className="pf-sub">
                          {distance >= 0 ? `${distance.toFixed(1)}% below` : 'above the price'}
                        </span>
                      )}
                    </>
                  ) : 'None'}
                </td>
                <td className="pf-action">
                  {confirming === pos.asset ? (
                    <span className="pf-confirm">
                      <button type="button" className="pf-sell is-confirm" onClick={() => handleClosePosition(pos)}>
                        Sell all {pos.asset}
                      </button>
                      <button type="button" className="pf-cancel" onClick={() => setConfirming(null)}>Keep</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="pf-sell"
                      disabled={selling === pos.asset}
                      onClick={() => { setMessage(null); setConfirming(pos.asset); }}
                    >
                      {selling === pos.asset ? 'Selling' : 'Sell'}
                    </button>
                  )}
                </td>
              </tr>
              {rowMessage && (
                <tr className="pf-message-row">
                  <td colSpan={7}>
                    <span className={`pf-row-message${rowMessage.error ? ' is-error' : ''}`} role={rowMessage.error ? 'alert' : 'status'}>
                      {rowMessage.text}
                    </span>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
