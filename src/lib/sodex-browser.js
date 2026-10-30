/**
 * Browser-side SoDEX client for user trading. The user's wallet signs account actions
 * (registering a trading key, approving Cinder's builder fee); the trading key, created and
 * kept in this browser, signs orders. Requests go straight from the browser to SoDEX, which
 * allows cross-origin calls, so Cinder's server never sees a user's key or orders.
 */

import { ethers } from 'ethers';
import { getSodexNetwork } from './sodex-network';
import {
  buildAddTradingKey,
  buildApproveBuilderFee,
  buildSpotNewOrderParams,
  buildSpotCancelParams,
  signSpotAction,
  SPOT_ACTION,
  toUniversalSignature,
  nextNonce
} from './sodex-signing';

const KEY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(network, address) {
  return `cinder.sodex.tradingKey.${network.name}.${address.toLowerCase()}`;
}

/**
 * Reads a SoDEX response. SoDEX wraps results as {code, data, error}; code 0 is success.
 * The raw text is kept so 64-bit order IDs can be shown without rounding.
 */
async function readSodexResponse(response) {
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Left as null; the raw text explains the failure
  }
  const ok = response.ok && json && json.code === 0;
  return { ok, status: response.status, json, text, error: ok ? null : (json?.error || json?.message || text || `HTTP ${response.status}`) };
}

async function sodexGet(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  return readSodexResponse(response);
}

/* ---------- Public reads (no signature needed) ---------- */

export function getPrimaryAccount(address, network = getSodexNetwork()) {
  return sodexGet(`${network.publicBase}/user/${address}/subaccounts`);
}

export function getSpotBalances(address, accountID, network = getSodexNetwork()) {
  const query = accountID ? `?accountID=${accountID}` : '';
  return sodexGet(`${network.spotBase}/accounts/${address}/balances${query}`);
}

export function getSpotOpenOrders(address, accountID, symbol, network = getSodexNetwork()) {
  const query = new URLSearchParams({ accountID: String(accountID) });
  if (symbol) query.set('symbol', symbol);
  return sodexGet(`${network.spotBase}/accounts/${address}/orders?${query}`);
}

/** The account's fills, newest first. */
export function getSpotTrades(address, accountID, limit = 50, network = getSodexNetwork()) {
  const query = new URLSearchParams({ accountID: String(accountID), limit: String(limit) });
  return sodexGet(`${network.spotBase}/accounts/${address}/trades?${query}`);
}

export function getApiKeys(address, accountID, name, network = getSodexNetwork()) {
  const query = new URLSearchParams({ accountID: String(accountID) });
  if (name) query.set('name', name);
  return sodexGet(`${network.publicBase}/user/${address}/api-keys?${query}`);
}

export function getBuilderApprovals(address, network = getSodexNetwork()) {
  return sodexGet(`${network.publicBase}/user/${address}/builders`);
}

export function getSpotSymbols(network = getSodexNetwork()) {
  return sodexGet(`${network.spotBase}/markets/symbols`);
}

export function getSpotTicker(symbol, network = getSodexNetwork()) {
  return sodexGet(`${network.spotBase}/markets/tickers?symbol=${encodeURIComponent(symbol)}`);
}

/* ---------- Wallet ---------- */

function getEthereum() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No browser wallet found. Install MetaMask or another EVM wallet.');
  }
  return window.ethereum;
}

export async function requestWalletAddress() {
  const accounts = await getEthereum().request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('The wallet did not share an address');
  return ethers.utils.getAddress(accounts[0]);
}

export async function getWalletChainId() {
  const hex = await getEthereum().request({ method: 'eth_chainId' });
  return parseInt(hex, 16);
}

async function signWithWallet(address, typedData) {
  return getEthereum().request({
    method: 'eth_signTypedData_v4',
    params: [address, JSON.stringify(typedData)]
  });
}

async function postUniversal(url, signingChainId, nonce, signature, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Chain': String(signingChainId),
      'X-API-Nonce': String(nonce),
      'X-API-Sign': toUniversalSignature(signature)
    },
    body: JSON.stringify(body)
  });
  return readSodexResponse(response);
}

/* ---------- Trading key ---------- */

/**
 * The trading key saved in this browser for this wallet, or null when there is none or it has expired.
 * @returns {{name: string, privateKey: string, publicKey: string, accountID: number, expiresAt: number} | null}
 */
export function loadTradingKey(address, network = getSodexNetwork()) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(network, address)) || 'null');
    if (!saved?.privateKey || !saved?.name) return null;
    if (Number(saved.expiresAt) <= Date.now()) return null;
    return saved;
  } catch {
    return null;
  }
}

export function forgetTradingKey(address, network = getSodexNetwork()) {
  try {
    localStorage.removeItem(storageKey(network, address));
  } catch {
    // Nothing to remove when storage is unavailable
  }
}

/**
 * Creates a trading key in this browser and asks the wallet to register it on SoDEX.
 * The key can place and cancel orders but cannot withdraw or transfer funds.
 * It is saved only after SoDEX accepts the registration.
 */
export async function createTradingKey({ address, accountID, network = getSodexNetwork() }) {
  const key = ethers.Wallet.createRandom();
  const name = `cinder-${key.address.slice(2, 10).toLowerCase()}`;
  const nonce = nextNonce();
  const expiresAt = Date.now() + KEY_LIFETIME_MS;
  const signingChainId = await getWalletChainId();

  const { typedData, body } = buildAddTradingKey({
    signingChainId,
    sodexChainId: network.chainId,
    nonce,
    accountID,
    name,
    publicKey: key.address,
    expiresAt
  });
  const signature = await signWithWallet(address, typedData);
  const result = await postUniversal(`${network.publicBase}/user/${address}/api-keys`, signingChainId, nonce, signature, body);

  if (result.ok) {
    const saved = { name, privateKey: key.privateKey, publicKey: key.address, accountID, expiresAt };
    try {
      localStorage.setItem(storageKey(network, address), JSON.stringify(saved));
    } catch {
      result.error = 'The key was registered but this browser could not save it. Allow site storage and try again.';
      result.ok = false;
    }
    result.key = { name, publicKey: key.address, expiresAt };
  }
  return result;
}

/**
 * Asks the wallet to approve Cinder's builder fee. A maxFeeRate of 0 clears the approval.
 */
export async function approveBuilderFee({ address, accountID, builderID, maxFeeRate, network = getSodexNetwork() }) {
  const nonce = nextNonce();
  const signingChainId = await getWalletChainId();
  const { typedData, body } = buildApproveBuilderFee({
    signingChainId,
    sodexChainId: network.chainId,
    nonce,
    accountID,
    builderID,
    maxFeeRate
  });
  const signature = await signWithWallet(address, typedData);
  return postUniversal(`${network.publicBase}/user/${address}/builders`, signingChainId, nonce, signature, body);
}

/* ---------- Orders ---------- */

/**
 * Places one spot order with the saved trading key.
 * @param {Object} args
 * @param {Object} args.key - From loadTradingKey
 * @param {Object} args.order - {symbolID, clOrdID, side, type, timeInForce, price?, quantity?, funds?}
 * @param {{id: number, fee: number}|null} [args.builder]
 */
export async function placeSpotOrder({ key, order, builder = null, network = getSodexNetwork() }) {
  const params = buildSpotNewOrderParams({ accountID: key.accountID, orders: [order], builder });
  const { headers, body } = await signSpotAction({
    privateKey: key.privateKey,
    keyName: key.name,
    sodexChainId: network.chainId,
    type: SPOT_ACTION.NEW_ORDER,
    params
  });
  const response = await fetch(`${network.spotBase}/trade/orders/batch`, { method: 'POST', headers, body });
  return readSodexResponse(response);
}

/** Cancels a spot order by the client order ID it was placed with, or by its order ID. */
export async function cancelSpotOrder({ key, symbolID, origClOrdID, orderID, network = getSodexNetwork() }) {
  const params = buildSpotCancelParams({
    accountID: key.accountID,
    cancels: [{ symbolID, clOrdID: `x${Date.now().toString(36)}`, ...(origClOrdID ? { origClOrdID } : { orderID }) }]
  });
  const { headers, body } = await signSpotAction({
    privateKey: key.privateKey,
    keyName: key.name,
    sodexChainId: network.chainId,
    type: SPOT_ACTION.CANCEL_ORDER,
    params
  });
  const response = await fetch(`${network.spotBase}/trade/orders/batch`, { method: 'DELETE', headers, body });
  return readSodexResponse(response);
}

/** A fresh client order ID that matches SoDEX's pattern. */
export function newClientOrderId(prefix = 'c') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
