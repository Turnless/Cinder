import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { verifyCndrPayment, getTreasury, getCndrTokenAddress } from '../cndr.js';

const TOKEN = '0x6C64923FD6478D265A1b5a971c6bC59cB35A5FA7';
const OTHER_TOKEN = '0x1111111111111111111111111111111111111111';
const PAYER = '0x00000000000000000000000000000000000000a1';
const TREASURY = '0x00000000000000000000000000000000000000b2';
const TX_HASH = '0x' + 'cd'.repeat(32);

const iface = new ethers.utils.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

function transferLog(token, from, to, amount) {
  const { data, topics } = iface.encodeEventLog(iface.getEvent('Transfer'), [from, to, ethers.utils.parseUnits(String(amount), 18)]);
  return { address: token, data, topics };
}

function fakeProvider(receipt) {
  return { waitForTransaction: async () => receipt };
}

describe('verifyCndrPayment', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS = TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const verify = (receipt, minAmount = 100) =>
    verifyCndrPayment({ txHash: TX_HASH, from: PAYER, to: TREASURY, minAmount, provider: fakeProvider(receipt) });

  it('accepts a CNDR transfer from the payer to the treasury that covers the amount', async () => {
    const result = await verify({ status: 1, logs: [transferLog(TOKEN, PAYER, TREASURY, 150)] });
    expect(result.ok).toBe(true);
    expect(result.paid).toBe('150.0');
  });

  it('rejects a transfer that is too small', async () => {
    const result = await verify({ status: 1, logs: [transferLog(TOKEN, PAYER, TREASURY, 50)] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too small/);
  });

  it('ignores transfers of a different token', async () => {
    const result = await verify({ status: 1, logs: [transferLog(OTHER_TOKEN, PAYER, TREASURY, 1000)] });
    expect(result.ok).toBe(false);
  });

  it("ignores transfers from someone else's wallet", async () => {
    const someoneElse = '0x00000000000000000000000000000000000000c3';
    const result = await verify({ status: 1, logs: [transferLog(TOKEN, someoneElse, TREASURY, 1000)] });
    expect(result.ok).toBe(false);
  });

  it('ignores transfers to an address other than the treasury', async () => {
    const result = await verify({ status: 1, logs: [transferLog(TOKEN, PAYER, PAYER, 1000)] });
    expect(result.ok).toBe(false);
  });

  it('rejects a reverted transaction', async () => {
    const result = await verify({ status: 0, logs: [transferLog(TOKEN, PAYER, TREASURY, 1000)] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/failed on-chain/);
  });

  it('rejects a malformed transaction hash without calling the RPC', async () => {
    const provider = { waitForTransaction: async () => { throw new Error('should not be called'); } };
    const result = await verifyCndrPayment({ txHash: '0x123', from: PAYER, to: TREASURY, minAmount: 1, provider });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Invalid payment transaction hash/);
  });

  it('reports an RPC timeout as a failed verification', async () => {
    const provider = { waitForTransaction: async () => { throw new Error('timeout exceeded'); } };
    const result = await verifyCndrPayment({ txHash: TX_HASH, from: PAYER, to: TREASURY, minAmount: 1, provider });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Could not confirm/);
  });
});

describe('treasury and token configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('treats the placeholder token address as not deployed', () => {
    process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS = '0x...';
    expect(getCndrTokenAddress()).toBeNull();
  });

  it('derives the treasury address from TREASURY_PRIVATE_KEY', () => {
    const wallet = ethers.Wallet.createRandom();
    process.env.TREASURY_PRIVATE_KEY = wallet.privateKey;
    expect(getTreasury()).toMatchObject({ address: wallet.address, legacy: false });
  });

  it('falls back to USER_WALLET_ADDRESS with the legacy payout key', () => {
    delete process.env.TREASURY_PRIVATE_KEY;
    process.env.USER_WALLET_ADDRESS = PAYER;
    process.env.SODEX_API_KEY_PRIVATE_KEY = '0xabc';
    expect(getTreasury()).toEqual({ address: PAYER, signerKey: '0xabc', legacy: true });
  });

  it('returns null when nothing is configured', () => {
    delete process.env.TREASURY_PRIVATE_KEY;
    delete process.env.USER_WALLET_ADDRESS;
    expect(getTreasury()).toBeNull();
  });
});
