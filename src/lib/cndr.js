/**
 * CNDR settlement helpers: treasury wallet, payment verification and payouts.
 * BUY orders are paid in CNDR to the treasury; SELL orders are paid out from it.
 */

import { ethers } from 'ethers';

// Allowed gap between the price the client paid at and the server's price at execution
export const PAYMENT_PRICE_TOLERANCE = 0.02;

const TRANSFER_EVENT = new ethers.utils.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

/**
 * @returns {string} JSON-RPC URL for the chain CNDR lives on (Arbitrum Sepolia)
 */
export function getRpcUrl() {
  return process.env.RPC_URL || process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
}

/**
 * @returns {string|null} CNDR token address, or null when no token is deployed (demo mode)
 */
export function getCndrTokenAddress() {
  const address = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
  return address && address !== '0x...' ? address : null;
}

/**
 * Resolves the treasury that receives CNDR for buys and pays CNDR out for sells.
 * TREASURY_PRIVATE_KEY is the intended setup. Without it, the pre-Phase-2 behaviour is kept:
 * deposits go to USER_WALLET_ADDRESS and payouts are signed with the SoDEX API key.
 * @returns {{address: string, signerKey: string|null, legacy: boolean}|null} Treasury details, or null if unconfigured
 */
export function getTreasury() {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (treasuryKey) {
    return { address: new ethers.Wallet(treasuryKey).address, signerKey: treasuryKey, legacy: false };
  }

  const address = process.env.USER_WALLET_ADDRESS;
  if (!address || address === 'your_evm_wallet_address_0x...') {
    return null;
  }
  return { address, signerKey: process.env.SODEX_API_KEY_PRIVATE_KEY || null, legacy: true };
}

/**
 * Confirms that a mined transaction moved at least `minAmount` CNDR from `from` to `to`.
 * @param {Object} params
 * @param {string} params.txHash - Payment transaction hash
 * @param {string} params.from - Paying wallet
 * @param {string} params.to - Treasury address
 * @param {number} params.minAmount - Minimum CNDR (whole tokens) the transfer must cover
 * @param {Object} [params.provider] - ethers provider (defaults to the configured RPC)
 * @returns {Promise<{ok: boolean, paid?: string, reason?: string}>} Verification result
 */
export async function verifyCndrPayment({ txHash, from, to, minAmount, provider }) {
  const tokenAddress = getCndrTokenAddress();
  if (!tokenAddress) {
    return { ok: false, reason: 'CNDR token is not configured' };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) {
    return { ok: false, reason: 'Invalid payment transaction hash' };
  }

  const rpc = provider || new ethers.providers.JsonRpcProvider(getRpcUrl());
  let receipt;
  try {
    // The client waits for the transfer to be mined, but RPC nodes can lag a few seconds behind
    receipt = await rpc.waitForTransaction(txHash, 1, 20000);
  } catch (err) {
    return { ok: false, reason: `Could not confirm payment transaction: ${err.message}` };
  }
  if (!receipt) {
    return { ok: false, reason: 'Payment transaction not found' };
  }
  if (receipt.status !== 1) {
    return { ok: false, reason: 'Payment transaction failed on-chain' };
  }

  let paid = ethers.BigNumber.from(0);
  for (const log of receipt.logs || []) {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue;
    let parsed;
    try {
      parsed = TRANSFER_EVENT.parseLog(log);
    } catch {
      continue;
    }
    if (parsed.args.from.toLowerCase() === from.toLowerCase() && parsed.args.to.toLowerCase() === to.toLowerCase()) {
      paid = paid.add(parsed.args.value);
    }
  }

  const required = ethers.utils.parseUnits(minAmount.toFixed(6), 18);
  const paidStr = ethers.utils.formatUnits(paid, 18);
  if (paid.lt(required)) {
    return { ok: false, paid: paidStr, reason: `Payment too small: paid ${paidStr} CNDR, needed at least ${minAmount.toFixed(6)} CNDR` };
  }
  return { ok: true, paid: paidStr };
}

/**
 * Sends CNDR from the treasury to a wallet (SELL settlement).
 * @param {string} to - Recipient wallet
 * @param {number} amount - CNDR amount (whole tokens)
 * @returns {Promise<string|null>} Transaction hash, or null if payouts aren't configured
 */
export async function sendCndrPayout(to, amount) {
  const tokenAddress = getCndrTokenAddress();
  const treasury = getTreasury();
  if (!tokenAddress || !treasury?.signerKey || treasury.signerKey === 'your_api_key_private_key') {
    return null;
  }
  if (treasury.legacy) {
    console.warn('[WARNING] TREASURY_PRIVATE_KEY not set: CNDR payout is signed with the SoDEX API key, whose wallet may hold no CNDR.');
  }

  const provider = new ethers.providers.JsonRpcProvider(getRpcUrl());
  const wallet = new ethers.Wallet(treasury.signerKey, provider);
  const token = new ethers.Contract(tokenAddress, ['function transfer(address to, uint256 amount) returns (bool)'], wallet);
  const tx = await token.transfer(to, ethers.utils.parseUnits(amount.toFixed(6), 18));
  await tx.wait();
  return tx.hash;
}
