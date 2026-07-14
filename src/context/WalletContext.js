'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

const WalletContext = createContext({
  isConnected: false,
  walletAddress: null,
  balance: 0,
  ethBalance: null,
  isConnecting: false,
  isClaiming: false,
  connectWallet: () => {},
  disconnectWallet: () => {},
  claimFaucet: () => {},
});

export function WalletProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);
  const [balance, setBalance] = useState(0); // CNDR balance
  const [ethBalance, setEthBalance] = useState(null); // Real native ETH balance
  const [isConnecting, setIsConnecting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Helper: Request wallet to switch or add Arbitrum Sepolia (Chain ID 421614 / 0x66eee)
  const ensureCorrectNetwork = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return false;
    
    const targetChainId = '0x66eee'; // 421614 in hex
    
    try {
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (currentChainId === targetChainId) {
        return true;
      }
      
      // Request wallet to switch network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainId }]
      });
      return true;
    } catch (err) {
      // Code 4902 indicates that the chain has not been added to the wallet
      // Rabby sometimes throws general errors, so we catch chain-addition logic robustly
      if (err.code === 4902 || (err.message && err.message.includes("Unrecognized chain ID"))) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetChainId,
              chainName: 'Arbitrum Sepolia',
              nativeCurrency: {
                name: 'Arbitrum ETH',
                symbol: 'ETH',
                decimals: 18
              },
              rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
              blockExplorerUrls: ['https://sepolia.arbiscan.io']
            }]
          });
          return true;
        } catch (addError) {
          console.error('Error adding Arbitrum Sepolia chain to wallet:', addError);
          return false;
        }
      }
      console.error('Error switching to Arbitrum Sepolia network:', err);
      // Alert the user to switch manually if automated request fails or is rejected
      alert('Please switch your wallet network to Arbitrum Sepolia to continue.');
      return false;
    }
  };

  // Sync RPC data for a specific connected address
  const syncWalletData = async (address) => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    try {
      // 1. Fetch real native ETH balance
      const hexBalance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      const eth = parseFloat((parseInt(hexBalance, 16) / 1e18).toFixed(4));
      setEthBalance(eth);

      // 2. Fetch CNDR token balance from the deployed contract (if address is configured in env)
      const tokenAddress = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
      if (tokenAddress && tokenAddress !== '0x...' && tokenAddress !== '') {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const abi = ["function balanceOf(address account) external view returns (uint256)"];
        const contract = new ethers.Contract(tokenAddress, abi, provider);
        const cndrWei = await contract.balanceOf(address);
        const cndrEth = parseFloat(ethers.utils.formatEther(cndrWei));
        setBalance(cndrEth);
      } else {
        // Fallback to local simulated balance if no contract address is set
        const key = `cinder_cndr_balance_${address.toLowerCase()}`;
        let cndr = localStorage.getItem(key);
        if (cndr === null) {
          cndr = '500'; // Default initial test tokens
          localStorage.setItem(key, cndr);
        }
        setBalance(parseFloat(cndr));
      }
    } catch (err) {
      console.error('Error syncing real Web3 wallet RPC data:', err);
    }
  };

  // Check if wallet is already pre-authorized on mount
  useEffect(() => {
    const initWeb3Wallet = async () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            const address = accounts[0];
            setWalletAddress(address);
            setIsConnected(true);
            await syncWalletData(address);
          }
        } catch (err) {
          console.error('Error checking pre-authorized accounts:', err);
        }
      }
    };
    initWeb3Wallet();
  }, []);

  // Listen for wallet accountsChanged and chainChanged events
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccounts = async (accounts) => {
      if (accounts.length === 0) {
        // User disconnected their wallet
        setIsConnected(false);
        setWalletAddress(null);
        setBalance(0);
        setEthBalance(null);
      } else {
        const address = accounts[0];
        setWalletAddress(address);
        setIsConnected(true);
        await syncWalletData(address);
      }
    };

    const handleChain = () => {
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', handleAccounts);
    window.ethereum.on('chainChanged', handleChain);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccounts);
        window.ethereum.removeListener('chainChanged', handleChain);
      }
    };
  }, []);

  const connectWallet = async () => {
    if (typeof window === 'undefined') return;
    
    if (!window.ethereum) {
      alert('No Web3 wallet extension detected. Please install a compatible browser wallet (like Rabby or MetaMask) to use Cinder.');
      return;
    }

    setIsConnecting(true);
    try {
      // 1. Ensure wallet is set to Arbitrum Sepolia before asking for account permissions
      const networkOk = await ensureCorrectNetwork();
      if (!networkOk) {
        setIsConnecting(false);
        return;
      }

      // 2. Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        const address = accounts[0];
        setWalletAddress(address);
        setIsConnected(true);
        await syncWalletData(address);
      }
    } catch (err) {
      console.error('Error connecting to Web3 provider:', err);
      if (err.code === 4001) {
        alert('Connection request rejected. Please approve the connection in your wallet.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setWalletAddress(null);
    setBalance(0);
    setEthBalance(null);
  };

  const claimFaucet = async () => {
    if (!isConnected || !walletAddress) return;
    setIsClaiming(true);

    // Ensure wallet is set to Arbitrum Sepolia before sending the transaction
    const networkOk = await ensureCorrectNetwork();
    if (!networkOk) {
      setIsClaiming(false);
      return;
    }

    const tokenAddress = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
    if (!tokenAddress || tokenAddress === '0x...' || tokenAddress === '') {
      // Fallback to simulated claim if no contract deployed yet
      setTimeout(() => {
        const key = `cinder_cndr_balance_${walletAddress.toLowerCase()}`;
        const currentCndr = parseFloat(localStorage.getItem(key) || 0);
        const newCndr = currentCndr + 10000;
        localStorage.setItem(key, newCndr.toString());
        setBalance(newCndr);
        setIsClaiming(false);
      }, 1500);
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      
      const abi = ["function claimFaucet() external"];
      const contract = new ethers.Contract(tokenAddress, abi, signer);

      // Trigger the real on-chain transaction
      const tx = await contract.claimFaucet();
      
      // Wait for it to be mined on Arbitrum Sepolia
      await tx.wait();

      // Sync the new on-chain CNDR and native ETH balances
      await syncWalletData(walletAddress);
    } catch (err) {
      console.error('Error claiming on-chain faucet:', err);
      
      // Friendly messaging for the 1-day cooldown revert condition
      if (err.message && err.message.includes("Cooldown active")) {
        alert("Faucet claim rejected: Cooldown active. You can only claim once every 24 hours.");
      } else {
        alert(err.reason || err.message || "Transaction failed. Make sure you are on Arbitrum Sepolia.");
      }
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        walletAddress,
        balance,
        ethBalance,
        isConnecting,
        isClaiming,
        connectWallet,
        disconnectWallet,
        claimFaucet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
