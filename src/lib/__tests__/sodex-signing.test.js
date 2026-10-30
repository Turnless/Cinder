import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  buildAddTradingKey,
  buildApproveBuilderFee,
  buildSpotNewOrderParams,
  buildSpotCancelParams,
  toUniversalSignature,
  signSpotAction,
  payloadHash,
  roundToStep,
  SPOT_ACTION,
  nextNonce,
  TRADING_KEY_PERMISSIONS
} from '../sodex-signing';
import { getSodexNetwork, getBuilderConfig } from '../sodex-network';

// Throwaway keys used only by these tests
const MASTER = new ethers.Wallet('0x' + '11'.repeat(32));
const TRADING_KEY = new ethers.Wallet('0x' + '22'.repeat(32));

function withoutDomainType(types) {
  const { EIP712Domain, ...rest } = types;
  return rest;
}

describe('trading key registration', () => {
  const { typedData, body } = buildAddTradingKey({
    signingChainId: 421614,
    sodexChainId: 138565,
    nonce: 1760373925000,
    accountID: 1010,
    name: 'cinder-abc123',
    publicKey: TRADING_KEY.address,
    expiresAt: 1760978725000
  });

  it('disables withdraw, transfer and cancel-only, keeping trade', () => {
    expect(TRADING_KEY_PERMISSIONS).toBe(2 | 4 | 8);
    expect(typedData.message.permissions).toBe(14);
    expect(body.permissions).toBe(14);
  });

  it('signs on the wallet chain but names the SoDEX network in the message', () => {
    expect(typedData.domain).toEqual({
      name: 'universal', version: '1', chainId: 421614,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    });
    expect(typedData.message.chainID).toBe(138565);
    expect(typedData.primaryType).toBe('UserSignedAddPermissionedAPIKeyAction');
  });

  it('uses `type` in the body and `keyType` in the signed message', () => {
    expect(body).toEqual({
      accountID: 1010, name: 'cinder-abc123', type: 1,
      publicKey: TRADING_KEY.address, expiresAt: 1760978725000, permissions: 14
    });
    expect(typedData.message.keyType).toBe(1);
  });

  it('produces a signature that recovers to the wallet', async () => {
    const types = withoutDomainType(typedData.types);
    const raw = await MASTER._signTypedData(typedData.domain, types, typedData.message);
    const wire = toUniversalSignature(raw);
    expect(wire.startsWith('0x02')).toBe(true);
    expect(wire.length).toBe(2 + 2 + 130);
    // Wire format carries v as 0/1; put back 27/28 to recover
    const v = parseInt(wire.slice(-2), 16);
    expect([0, 1]).toContain(v);
    const restored = '0x' + wire.slice(4, -2) + (v + 27).toString(16);
    expect(ethers.utils.verifyTypedData(typedData.domain, types, typedData.message, restored)).toBe(MASTER.address);
  });

  it('rejects names SoDEX would refuse', () => {
    const args = { signingChainId: 1, sodexChainId: 138565, nonce: 1, accountID: 1, publicKey: TRADING_KEY.address, expiresAt: 2 };
    expect(() => buildAddTradingKey({ ...args, name: 'default' })).toThrow();
    expect(() => buildAddTradingKey({ ...args, name: 'has space' })).toThrow();
    expect(() => buildAddTradingKey({ ...args, name: 'x'.repeat(37) })).toThrow();
  });
});

describe('builder fee approval', () => {
  it('builds the ApproveBuilderFeeAction message in field order', () => {
    const { typedData, body } = buildApproveBuilderFee({
      signingChainId: 1, sodexChainId: 286623, nonce: 5, accountID: 1010, builderID: 1234, maxFeeRate: 50
    });
    expect(Object.keys(typedData.message)).toEqual(['chainID', 'nonce', 'accountID', 'builderID', 'maxFeeRate']);
    expect(typedData.message.chainID).toBe(286623);
    expect(body).toEqual({ accountID: 1010, builderID: 1234, maxFeeRate: 50 });
  });

  it('refuses rates outside 0-2000', () => {
    const args = { signingChainId: 1, sodexChainId: 138565, nonce: 5, accountID: 1, builderID: 2 };
    expect(() => buildApproveBuilderFee({ ...args, maxFeeRate: 2001 })).toThrow();
    expect(() => buildApproveBuilderFee({ ...args, maxFeeRate: -1 })).toThrow();
    expect(() => buildApproveBuilderFee({ ...args, maxFeeRate: 0 })).not.toThrow();
  });
});

describe('spot order payloads', () => {
  it('serialises a limit order in SoDEX field order with the builder last', () => {
    const params = buildSpotNewOrderParams({
      accountID: 12345,
      orders: [{ quantity: 0.001, price: '82000', clOrdID: 'c-1', side: 1, type: 1, timeInForce: 1, symbolID: 1 }],
      builder: { fee: 50, id: 456 }
    });
    expect(JSON.stringify({ type: SPOT_ACTION.NEW_ORDER, params })).toBe(
      '{"type":"batchNewOrder","params":{"accountID":12345,"orders":[{"symbolID":1,"clOrdID":"c-1","side":1,"type":1,' +
      '"timeInForce":1,"price":"82000","quantity":"0.001"}],"builder":{"id":456,"fee":50}}}'
    );
  });

  it('leaves out unset optional fields and the builder when there is none', () => {
    const params = buildSpotNewOrderParams({
      accountID: 1,
      orders: [{ symbolID: 2, clOrdID: 'm-1', side: 1, type: 2, timeInForce: 3, funds: '10' }]
    });
    expect(JSON.stringify(params)).toBe(
      '{"accountID":1,"orders":[{"symbolID":2,"clOrdID":"m-1","side":1,"type":2,"timeInForce":3,"funds":"10"}]}'
    );
  });

  it('serialises a cancel by client order ID', () => {
    const params = buildSpotCancelParams({ accountID: 7, cancels: [{ origClOrdID: 'c-1', clOrdID: 'x-1', symbolID: 1 }] });
    expect(JSON.stringify(params)).toBe('{"accountID":7,"cancels":[{"symbolID":1,"clOrdID":"x-1","origClOrdID":"c-1"}]}');
    const byId = buildSpotCancelParams({ accountID: 7, cancels: [{ orderID: 99, clOrdID: 'x-2', symbolID: 1 }] });
    expect(JSON.stringify(byId)).toBe('{"accountID":7,"cancels":[{"symbolID":1,"clOrdID":"x-2","orderID":99}]}');
  });

  it('rejects empty batches and bad client order IDs', () => {
    expect(() => buildSpotNewOrderParams({ accountID: 1, orders: [] })).toThrow();
    expect(() => buildSpotNewOrderParams({
      accountID: 1, orders: [{ symbolID: 1, clOrdID: 'bad id', side: 1, type: 1, timeInForce: 1 }]
    })).toThrow();
  });
});

describe('signSpotAction', () => {
  it('signs ExchangeAction with the trading key and sends the params alone as the body', async () => {
    const params = buildSpotNewOrderParams({
      accountID: 12345,
      orders: [{ symbolID: 1, clOrdID: 'c-2', side: 2, type: 1, timeInForce: 1, price: '90000', quantity: '0.0001' }]
    });
    const nonce = 1760373925001;
    const { headers, body } = await signSpotAction({
      privateKey: TRADING_KEY.privateKey, keyName: 'cinder-abc123', sodexChainId: 138565, type: SPOT_ACTION.NEW_ORDER, params, nonce
    });

    expect(body).toBe(JSON.stringify(params));
    expect(headers['X-API-Key']).toBe('cinder-abc123');
    expect(headers['X-API-Nonce']).toBe(String(nonce));
    expect(headers['X-API-Sign'].startsWith('0x01')).toBe(true);
    // SoDEX refuses a recovery byte of 27/28 on orders too
    expect(['00', '01']).toContain(headers['X-API-Sign'].slice(-2));

    const recovered = ethers.utils.verifyTypedData(
      { name: 'spot', version: '1', chainId: 138565, verifyingContract: '0x0000000000000000000000000000000000000000' },
      { ExchangeAction: [{ name: 'payloadHash', type: 'bytes32' }, { name: 'nonce', type: 'uint64' }] },
      { payloadHash: payloadHash(SPOT_ACTION.NEW_ORDER, params), nonce },
      '0x' + headers['X-API-Sign'].slice(4)
    );
    expect(recovered).toBe(TRADING_KEY.address);
  });
});

describe('helpers', () => {
  it('rounds down to the market step without float noise', () => {
    expect(roundToStep(0.000123456, '0.00001')).toBe('0.00012');
    expect(roundToStep(82816.9, '1')).toBe('82816');
    expect(roundToStep(0.3, '0.1')).toBe('0.3');
    expect(roundToStep(1234.5678, '0.01')).toBe('1234.56');
  });

  it('drops trailing zeros, which SoDEX refuses', () => {
    expect(roundToStep(0.0001, '0.00001')).toBe('0.0001');
    expect(roundToStep(2.5, '0.01')).toBe('2.5');
    expect(roundToStep(3, '0.1')).toBe('3');
    expect(roundToStep(64320, '1')).toBe('64320');
  });

  it('never hands out the same nonce twice', () => {
    const a = nextNonce(1000);
    const b = nextNonce(1000);
    const c = nextNonce(999);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe('network settings', () => {
  it('defaults to testnet, including for typos', () => {
    expect(getSodexNetwork(undefined).name).toBe('testnet');
    expect(getSodexNetwork('mainet').name).toBe('testnet');
    expect(getSodexNetwork('testnet').chainId).toBe(138565);
  });

  it('only uses mainnet when asked exactly', () => {
    const net = getSodexNetwork(' Mainnet ');
    expect(net.isMainnet).toBe(true);
    expect(net.chainId).toBe(286623);
    expect(net.spotBase).toBe('https://mainnet-gw.sodex.dev/api/v1/spot');
  });

  it('accepts only a valid builder ID and fee', () => {
    expect(getBuilderConfig('1234', '50')).toEqual({ id: 1234, fee: 50, maxFee: 50 });
    expect(getBuilderConfig('', '50')).toBeNull();
    expect(getBuilderConfig('1234', '2001')).toBeNull();
    expect(getBuilderConfig('1234', '0.5')).toBeNull();
  });
});
