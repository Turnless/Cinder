/**
 * SoDEX request signing, shared by the browser (user trading keys) and the server.
 * Follows sodex.com/documentation "Authentication & Signing":
 * - Account actions (add key, approve builder fee) are signed by the user's wallet with the
 *   `universal` EIP-712 domain; the domain chainId is the X-API-Chain header value. Prefix 0x02.
 * - Trading actions are signed by the trading key with the `spot` domain and the SoDEX chainId,
 *   over keccak256 of the compact {type, params} JSON. Prefix 0x01.
 * Field order is part of the signature, so every builder below writes keys in schema order.
 */

import { ethers } from 'ethers';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const ORDER_SIDE = { BUY: 1, SELL: 2 };
export const ORDER_TYPE = { LIMIT: 1, MARKET: 2 };
export const TIME_IN_FORCE = { GTC: 1, IOC: 3, GTX: 4 };

// Action names that go into the signed payload for the batch endpoints. They come from SoDEX's
// Go SDK; the docs say 'newOrder', but signatures over that name recover to the wrong address.
export const SPOT_ACTION = { NEW_ORDER: 'batchNewOrder', CANCEL_ORDER: 'batchCancelOrder' };

// A set bit disables that permission. Trading keys can place and cancel orders through TRADE,
// but can never withdraw or move funds, so a leaked key cannot take money out of the account.
export const KEY_PERMISSION_BITS = { TRADE: 1, CANCEL: 2, WITHDRAW: 4, TRANSFER: 8 };
export const TRADING_KEY_PERMISSIONS =
  KEY_PERMISSION_BITS.CANCEL | KEY_PERMISSION_BITS.WITHDRAW | KEY_PERMISSION_BITS.TRANSFER;

const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' }
];

const UNIVERSAL_TYPES = {
  UserSignedAddPermissionedAPIKeyAction: [
    { name: 'chainID', type: 'uint64' },
    { name: 'nonce', type: 'uint64' },
    { name: 'accountID', type: 'uint64' },
    { name: 'name', type: 'string' },
    { name: 'keyType', type: 'uint8' },
    { name: 'publicKey', type: 'bytes' },
    { name: 'expiresAt', type: 'uint64' },
    { name: 'permissions', type: 'uint64' }
  ],
  ApproveBuilderFeeAction: [
    { name: 'chainID', type: 'uint64' },
    { name: 'nonce', type: 'uint64' },
    { name: 'accountID', type: 'uint64' },
    { name: 'builderID', type: 'uint64' },
    { name: 'maxFeeRate', type: 'uint64' }
  ]
};

const EXCHANGE_ACTION_TYPES = {
  ExchangeAction: [
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint64' }
  ]
};

/** Names SoDEX accepts for API keys and client order IDs. */
export const ID_PATTERN = /^[0-9a-zA-Z_-]{1,36}$/;

// Nonces must be unique per signing address; milliseconds, bumped when two land in the same ms
let lastNonce = 0;
export function nextNonce(now = Date.now()) {
  lastNonce = now > lastNonce ? now : lastNonce + 1;
  return lastNonce;
}

function universalDomain(signingChainId) {
  return { name: 'universal', version: '1', chainId: Number(signingChainId), verifyingContract: ZERO_ADDRESS };
}

/**
 * Typed data for registering a trading key that cannot withdraw or transfer.
 * @param {Object} args
 * @param {number} args.signingChainId - The wallet's current chain ID; sent as X-API-Chain
 * @param {number} args.sodexChainId - 138565 (testnet) or 286623 (mainnet)
 * @param {number} args.nonce
 * @param {number} args.accountID - The user's primary SoDEX account ID
 * @param {string} args.name - Key name, matching ID_PATTERN and not 'default'
 * @param {string} args.publicKey - The trading key's EVM address
 * @param {number} args.expiresAt - Expiry in milliseconds
 * @returns {{typedData: Object, body: Object}} What the wallet signs, and the request body
 */
export function buildAddTradingKey({ signingChainId, sodexChainId, nonce, accountID, name, publicKey, expiresAt }) {
  if (!ID_PATTERN.test(name) || name === 'default') {
    throw new Error('Invalid trading key name');
  }
  const message = {
    chainID: sodexChainId,
    nonce,
    accountID,
    name,
    keyType: 1,
    publicKey,
    expiresAt,
    permissions: TRADING_KEY_PERMISSIONS
  };
  return {
    typedData: {
      types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...pick(UNIVERSAL_TYPES, 'UserSignedAddPermissionedAPIKeyAction') },
      domain: universalDomain(signingChainId),
      primaryType: 'UserSignedAddPermissionedAPIKeyAction',
      message
    },
    // The REST body calls the key type `type`; the signed message calls it `keyType`
    body: { accountID, name, type: 1, publicKey, expiresAt, permissions: TRADING_KEY_PERMISSIONS }
  };
}

/**
 * Typed data for approving (or, with maxFeeRate 0, clearing) a builder fee.
 * @returns {{typedData: Object, body: Object}}
 */
export function buildApproveBuilderFee({ signingChainId, sodexChainId, nonce, accountID, builderID, maxFeeRate }) {
  if (!Number.isInteger(maxFeeRate) || maxFeeRate < 0 || maxFeeRate > 2000) {
    throw new Error('Builder fee rate must be between 0 and 2000');
  }
  return {
    typedData: {
      types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...pick(UNIVERSAL_TYPES, 'ApproveBuilderFeeAction') },
      domain: universalDomain(signingChainId),
      primaryType: 'ApproveBuilderFeeAction',
      message: { chainID: sodexChainId, nonce, accountID, builderID, maxFeeRate }
    },
    body: { accountID, builderID, maxFeeRate }
  };
}

/**
 * Prefixes a 65-byte signature with SoDEX's type byte and normalises the recovery byte
 * from 27/28 to 0/1; SoDEX refuses 27/28 ("bad recovery id") on both signature types.
 * @param {string} typeByte - '01' for trading actions, '02' for universal actions
 * @param {string} signature - 0x-prefixed r || s || v
 * @returns {string}
 */
function toWireSignature(typeByte, signature) {
  const hex = String(signature).replace(/^0x/, '');
  if (hex.length !== 130) throw new Error('Expected a 65-byte signature');
  const v = parseInt(hex.slice(128), 16);
  const normalized = v >= 27 ? v - 27 : v;
  return '0x' + typeByte + hex.slice(0, 128) + normalized.toString(16).padStart(2, '0');
}

/** Converts a wallet's signature into the 0x02 universal wire format. */
export function toUniversalSignature(signature) {
  return toWireSignature('02', signature);
}

/**
 * Spot batchNewOrder params in SoDEX field order. Decimal fields stay strings; unset optional
 * fields are left out; `builder` comes last with `id` before `fee`.
 * @param {Object} args
 * @param {number} args.accountID
 * @param {Array<{symbolID: number, clOrdID: string, side: number, type: number, timeInForce: number,
 *   price?: string, quantity?: string, funds?: string}>} args.orders
 * @param {{id: number, fee: number}|null} [args.builder]
 * @returns {Object}
 */
export function buildSpotNewOrderParams({ accountID, orders, builder = null }) {
  if (!Array.isArray(orders) || orders.length === 0) throw new Error('An order batch cannot be empty');
  const params = {
    accountID,
    orders: orders.map(order => {
      if (!ID_PATTERN.test(order.clOrdID)) throw new Error('Invalid client order ID');
      const item = {
        symbolID: order.symbolID,
        clOrdID: order.clOrdID,
        side: order.side,
        type: order.type,
        timeInForce: order.timeInForce
      };
      for (const field of ['price', 'quantity', 'funds']) {
        if (order[field] !== undefined && order[field] !== null && order[field] !== '') {
          item[field] = String(order[field]);
        }
      }
      return item;
    })
  };
  if (builder) {
    params.builder = { id: builder.id, fee: builder.fee };
  }
  return params;
}

/**
 * Spot batchCancelOrder params in SoDEX field order. Each cancel names the order by its original
 * client order ID or, for orders placed without one (e.g. on sodex.com), by its order ID.
 * Unset fields are left out, as JSON.stringify drops undefined values.
 * @param {{accountID: number, cancels: Array<{symbolID: number, clOrdID: string, orderID?: number, origClOrdID?: string}>}} args
 * @returns {Object}
 */
export function buildSpotCancelParams({ accountID, cancels }) {
  if (!Array.isArray(cancels) || cancels.length === 0) throw new Error('A cancel batch cannot be empty');
  return {
    accountID,
    cancels: cancels.map(cancel => ({
      symbolID: cancel.symbolID,
      clOrdID: cancel.clOrdID,
      orderID: cancel.orderID,
      origClOrdID: cancel.origClOrdID
    }))
  };
}

/** keccak256 of the compact {type, params} JSON that SoDEX re-marshals on its side. */
export function payloadHash(type, params) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify({ type, params })));
}

/**
 * Signs a spot trading action with a trading key.
 * @param {Object} args
 * @param {string} args.privateKey - The trading key's private key
 * @param {string} args.keyName - Its registered name (sent as X-API-Key)
 * @param {number} args.sodexChainId
 * @param {string} args.type - SPOT_ACTION.NEW_ORDER or SPOT_ACTION.CANCEL_ORDER
 * @param {Object} args.params - From buildSpotNewOrderParams / buildSpotCancelParams
 * @param {number} [args.nonce]
 * @returns {Promise<{headers: Object, body: string}>} Ready-to-send headers and JSON body
 */
export async function signSpotAction({ privateKey, keyName, sodexChainId, type, params, nonce = nextNonce() }) {
  const wallet = new ethers.Wallet(privateKey);
  const hash = payloadHash(type, params);
  const domain = { name: 'spot', version: '1', chainId: sodexChainId, verifyingContract: ZERO_ADDRESS };
  const signature = await wallet._signTypedData(domain, EXCHANGE_ACTION_TYPES, { payloadHash: hash, nonce });
  return {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': keyName,
      'X-API-Nonce': String(nonce),
      'X-API-Sign': toWireSignature('01', signature)
    },
    // The HTTP body is the params alone, in the same order as the signed payload
    body: JSON.stringify(params)
  };
}

/**
 * Signs the revocation of an API key for one engine with the master wallet. SoDEX needs two:
 * one for 'spot' and one for 'futures' (perps); the universal domain is not accepted here.
 * Master-wallet requests carry no X-API-Key header.
 * @param {Object} args
 * @param {string} args.privateKey - The master wallet's private key
 * @param {'spot'|'futures'} args.engine
 * @param {number} args.sodexChainId
 * @param {number} args.accountID
 * @param {string} args.name - The key to revoke
 * @param {number} [args.nonce]
 * @returns {Promise<{headers: Object, body: string}>}
 */
export async function signRevokeApiKey({ privateKey, engine, sodexChainId, accountID, name, nonce = nextNonce() }) {
  if (!['spot', 'futures'].includes(engine)) throw new Error("engine must be 'spot' or 'futures'");
  if (!ID_PATTERN.test(name) || name === 'default') throw new Error('Invalid key name');
  const params = { accountID, name };
  const wallet = new ethers.Wallet(privateKey);
  const domain = { name: engine, version: '1', chainId: sodexChainId, verifyingContract: ZERO_ADDRESS };
  const signature = await wallet._signTypedData(domain, EXCHANGE_ACTION_TYPES, {
    payloadHash: payloadHash('revokeAPIKey', params),
    nonce
  });
  return {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Nonce': String(nonce),
      'X-API-Sign': toWireSignature('01', signature)
    },
    body: JSON.stringify(params)
  };
}

/**
 * Rounds a decimal down to a market's step (quantity) or tick (price) size, as a string
 * with no float noise and no trailing zeros, e.g. roundToStep(0.000123456, '0.00001') -> '0.00012'.
 * SoDEX refuses decimals with trailing zeros ('0.00010' is "quantity is invalid"; '0.0001' is accepted).
 * @param {number|string} value
 * @param {string} step
 * @returns {string}
 */
export function roundToStep(value, step) {
  const decimals = (String(step).split('.')[1] || '').length;
  const scale = 10 ** decimals;
  const stepUnits = Math.round(parseFloat(step) * scale);
  const units = Math.floor(Math.round(parseFloat(value) * scale * 1e6) / 1e6 / stepUnits) * stepUnits;
  const fixed = (units / scale).toFixed(decimals);
  return decimals ? fixed.replace(/\.?0+$/, '') : fixed;
}

function pick(object, key) {
  return { [key]: object[key] };
}
