'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSodexNetwork, getBuilderConfig } from '../lib/sodex-network';
import {
  getPrimaryAccount,
  getSpotBalances,
  getBuilderApprovals,
  loadTradingKey,
  forgetTradingKey,
  createTradingKey,
  approveBuilderFee
} from '../lib/sodex-browser';
import { approvedBuilderFee, availableOf } from '../lib/sodex-orders';

const network = getSodexNetwork();
const builder = getBuilderConfig();

/**
 * The user's SoDEX account as this browser sees it.
 * status: 'idle' (no wallet), 'loading', 'ready', 'missing' (wallet has no SoDEX account yet) or 'error'.
 */
const EMPTY_ACCOUNT = { status: 'idle', accountID: null, balances: [], usdc: 0, builderFee: 0, error: null };

const WalletContext = createContext({
  network,
  builder,
  isConnected: false,
  walletChecked: false,
  walletAddress: null,
  isConnecting: false,
  account: EMPTY_ACCOUNT,
  tradingKey: null,
  tradingReady: false,
  connectWallet: () => {},
  disconnectWallet: () => {},
  refreshAccount: () => {},
  enableTrading: async () => ({ ok: false }),
  forgetTradingKey: () => {}
});

export function WalletProvider({ children }) {
  const [walletChecked, setWalletChecked] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [account, setAccount] = useState(EMPTY_ACCOUNT);
  const [tradingKey, setTradingKey] = useState(null);
  // Answers for an address that is no longer connected are dropped
  const currentAddress = useRef(null);

  const loadAccount = useCallback(async (address, { quiet = false } = {}) => {
    if (!address) return;
    if (!quiet) setAccount(prev => ({ ...EMPTY_ACCOUNT, status: 'loading', accountID: prev.accountID }));
    setTradingKey(loadTradingKey(address, network));

    try {
      const accounts = await getPrimaryAccount(address, network);
      if (currentAddress.current !== address) return;
      if (!accounts.ok) {
        const missing = /user not found/i.test(accounts.error || '');
        setAccount({ ...EMPTY_ACCOUNT, status: missing ? 'missing' : 'error', error: accounts.error });
        return;
      }

      const accountID = accounts.json.data.primaryAccountID;
      const [balances, approvals] = await Promise.all([
        getSpotBalances(address, accountID, network),
        builder ? getBuilderApprovals(address, network) : Promise.resolve(null)
      ]);
      if (currentAddress.current !== address) return;

      const list = balances.ok ? balances.json.data?.balances || [] : [];
      setAccount({
        status: balances.ok ? 'ready' : 'error',
        accountID,
        balances: list,
        usdc: availableOf(list, 'vUSDC'),
        builderFee: builder ? approvedBuilderFee(approvals, builder.id) : 0,
        error: balances.ok ? null : balances.error
      });
    } catch (err) {
      if (currentAddress.current !== address) return;
      setAccount({ ...EMPTY_ACCOUNT, status: 'error', error: err.message || 'SoDEX could not be reached.' });
    }
  }, []);

  const selectAddress = useCallback((address) => {
    currentAddress.current = address;
    setWalletAddress(address);
    if (address) {
      loadAccount(address);
    } else {
      setAccount(EMPTY_ACCOUNT);
      setTradingKey(null);
    }
  }, [loadAccount]);

  // Pick up a wallet that already approved this site
  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) selectAddress(accounts[0]);
        } catch (err) {
          console.error('Error checking pre-authorized accounts:', err);
        }
      }
      setWalletChecked(true);
    };
    init();
  }, [selectAddress]);

  // Follow account switches in the wallet. Orders are signed by the trading key and SoDEX accepts
  // wallet signatures on any chain, so the wallet's network does not matter.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum?.on) return undefined;
    const handleAccounts = (accounts) => selectAddress(accounts.length > 0 ? accounts[0] : null);
    window.ethereum.on('accountsChanged', handleAccounts);
    return () => window.ethereum.removeListener?.('accountsChanged', handleAccounts);
  }, [selectAddress]);

  const connectWallet = async () => {
    if (typeof window === 'undefined') return;
    if (!window.ethereum) {
      alert('No browser wallet found. Install MetaMask or Rabby to use Cinder.');
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) selectAddress(accounts[0]);
    } catch (err) {
      console.error('Error connecting to the wallet:', err);
      if (err.code === 4001) alert('You declined the connection. Approve it in your wallet to continue.');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => selectAddress(null);

  const refreshAccount = useCallback(() => {
    if (currentAddress.current) return loadAccount(currentAddress.current, { quiet: true });
    return undefined;
  }, [loadAccount]);

  /**
   * Asks the wallet for what trading needs and is not yet in place: a trading key for this
   * browser, then Cinder's builder fee. Each is one wallet signature.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  const enableTrading = async () => {
    const address = currentAddress.current;
    if (!address || account.status !== 'ready') return { ok: false, error: 'Your SoDEX account is not loaded yet.' };

    try {
      if (!loadTradingKey(address, network)) {
        const created = await createTradingKey({ address, accountID: account.accountID, network });
        if (!created.ok) return { ok: false, error: `SoDEX refused the trading key: ${created.error}` };
        setTradingKey(loadTradingKey(address, network));
      }

      if (builder && account.builderFee < builder.fee) {
        const approved = await approveBuilderFee({
          address,
          accountID: account.accountID,
          builderID: builder.id,
          maxFeeRate: builder.maxFee,
          network
        });
        if (!approved.ok) return { ok: false, error: `SoDEX refused the fee approval: ${approved.error}` };
        setAccount(prev => ({ ...prev, builderFee: builder.maxFee }));
      }
      return { ok: true };
    } catch (err) {
      const declined = err.code === 4001 || err.code === 'ACTION_REJECTED';
      return { ok: false, error: declined ? 'You declined the signature, so trading is not enabled.' : err.message };
    }
  };

  const forgetKey = () => {
    if (!currentAddress.current) return;
    forgetTradingKey(currentAddress.current, network);
    setTradingKey(null);
  };

  const builderReady = !builder || account.builderFee >= builder.fee;

  return (
    <WalletContext.Provider
      value={{
        network,
        builder,
        isConnected: Boolean(walletAddress),
        walletChecked,
        walletAddress,
        isConnecting,
        account,
        tradingKey,
        tradingReady: account.status === 'ready' && Boolean(tradingKey) && builderReady,
        connectWallet,
        disconnectWallet,
        refreshAccount,
        enableTrading,
        forgetTradingKey: forgetKey
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
