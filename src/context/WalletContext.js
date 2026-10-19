'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

const WalletContext = createContext({
  isConnected: false,
  walletChecked: false,
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
  const [walletChecked, setWalletChecked] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);
  const [balance, setBalance] = useState(0); // CNDR balance
  const [isDemoBalance, setIsDemoBalance] = useState(false); // true when no CNDR contract is configured (localStorage balance)
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
        setIsDemoBalance(false);
      } else {
        // Fallback to local simulated balance if no contract address is set
        const key = `cinder_cndr_balance_${address.toLowerCase()}`;
        let cndr = localStorage.getItem(key);
        if (cndr === null) {
          cndr = '500'; // Default initial test tokens
          localStorage.setItem(key, cndr);
        }
        setBalance(parseFloat(cndr));
        setIsDemoBalance(true);
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
      setWalletChecked(true);
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
      
      const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL;
      const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL;

      if (bundlerUrl && paymasterUrl && !bundlerUrl.includes('your_') && !paymasterUrl.includes('your_')) {
        console.log('[INFO] Relaying gasless faucet claim using ERC-4337 Paymaster...');
        
        // Build UserOperation to execute claimFaucet on CinderToken
        const abi = ["function claimFaucet() external"];
        const contract = new ethers.Contract(tokenAddress, abi, signer);
        const callData = contract.interface.encodeFunctionData("claimFaucet");

        const entryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'; // EntryPoint v0.6
        
        // Fetch nonce from EntryPoint
        let nonce = '0x0';
        try {
          const entryPointAbi = ["function getNonce(address sender, uint192 key) external view returns (uint256)"];
          const entryPointContract = new ethers.Contract(entryPointAddress, entryPointAbi, provider);
          const rawNonce = await entryPointContract.getNonce(walletAddress, 0);
          nonce = ethers.BigNumber.from(rawNonce).toHexString();
        } catch (e) {
          console.warn('[WARNING] Failed to fetch nonce from EntryPoint, defaulting to 0x0:', e.message);
        }

        // Build base UserOperation
        const userOp = {
          sender: walletAddress,
          nonce: nonce,
          initCode: '0x',
          callData: callData,
          callGasLimit: '0x3d090', // 250,000 gas
          verificationGasLimit: '0x249f0', // 150,000 gas
          preVerificationGas: '0xc350', // 50,000 gas
          maxFeePerGas: '0x3b9aca00', // 1 gwei
          maxPriorityFeePerGas: '0x3b9aca00',
          paymasterAndData: '0x',
          signature: '0x'
        };

        // Call paymaster to sponsor the transaction (pm_sponsorUserOperation)
        console.log('[INFO] Requesting transaction sponsorship from paymaster...');
        let sponsoredOp = { ...userOp };
        try {
          const pmResponse = await fetch(paymasterUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'pm_sponsorUserOperation',
              params: [userOp, entryPointAddress]
            })
          });
          if (pmResponse.ok) {
            const pmResult = await pmResponse.json();
            if (pmResult.result) {
              sponsoredOp = { ...sponsoredOp, ...pmResult.result };
              console.log('[SUCCESS] Paymaster sponsorship obtained!');
            }
          }
        } catch (pmErr) {
          console.warn('[WARNING] Paymaster sponsorship request failed, proceeding with direct signature:', pmErr.message);
        }

        // Sign the UserOperation hash
        const userOpHash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
            [
              sponsoredOp.sender,
              ethers.BigNumber.from(sponsoredOp.nonce),
              ethers.utils.keccak256(sponsoredOp.initCode),
              ethers.utils.keccak256(sponsoredOp.callData),
              ethers.BigNumber.from(sponsoredOp.callGasLimit),
              ethers.BigNumber.from(sponsoredOp.verificationGasLimit),
              ethers.BigNumber.from(sponsoredOp.preVerificationGas),
              ethers.BigNumber.from(sponsoredOp.maxFeePerGas),
              ethers.BigNumber.from(sponsoredOp.maxPriorityFeePerGas),
              ethers.utils.keccak256(sponsoredOp.paymasterAndData)
            ]
          )
        );
        
        console.log('[INFO] Requesting user signature for UserOperation...');
        const signature = await signer.signMessage(ethers.utils.arrayify(userOpHash));
        sponsoredOp.signature = signature;

        // Submit UserOperation to the Bundler (eth_sendUserOperation)
        console.log('[INFO] Submitting UserOperation to bundler...');
        const bundlerResponse = await fetch(bundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_sendUserOperation',
            params: [sponsoredOp, entryPointAddress]
          })
        });

        if (bundlerResponse.ok) {
          const bundlerResult = await bundlerResponse.json();
          if (bundlerResult.error) {
            throw new Error(`Bundler rejected UserOperation: ${bundlerResult.error.message}`);
          }
          console.log('[SUCCESS] UserOperation successfully relayed! Hash:', bundlerResult.result);
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          await syncWalletData(walletAddress);
          return;
        } else {
          throw new Error('Bundler request returned non-200 status');
        }
      }

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
        walletChecked,
        walletAddress,
        balance,
        isDemoBalance,
        ethBalance,
        isConnecting,
        isClaiming,
        connectWallet,
        disconnectWallet,
        claimFaucet,
        ensureCorrectNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
