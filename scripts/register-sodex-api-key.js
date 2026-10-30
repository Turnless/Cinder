// Registers the API key Cinder's automatic trader signs orders with.
//
// Run it on your own computer, never on the server: it needs the master wallet's private key
// (SODEX_MASTER_PRIVATE_KEY) once, to approve the new key. The key it creates can place and cancel
// orders on the master wallet's SoDEX account but cannot withdraw or transfer funds.
//
//   node scripts/register-sodex-api-key.js            # key valid for 90 days
//   SODEX_KEY_DAYS=30 node scripts/register-sodex-api-key.js
//   node scripts/register-sodex-api-key.js --revoke cinder-auto-1234abcd   # revoke a key in Spot and Perps
//
// The network follows NEXT_PUBLIC_SODEX_NETWORK (testnet unless set to mainnet).
// It prints USER_WALLET_ADDRESS, SODEX_API_KEY_NAME and SODEX_API_KEY_PRIVATE_KEY for the server's env.
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { getSodexNetwork } from '../src/lib/sodex-network.js';
import { buildAddTradingKey, toUniversalSignature, nextNonce, signRevokeApiKey } from '../src/lib/sodex-signing.js';

// Values already in the environment win over .env.local, which wins over .env
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const envPath = path.join(process.cwd(), file);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const firstEquals = trimmed.indexOf('=');
      if (firstEquals === -1) continue;
      const key = trimmed.slice(0, firstEquals).trim();
      let value = trimmed.slice(firstEquals + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

async function readSodex(response) {
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Reported below with the raw text
  }
  if (!response.ok || json?.code !== 0) {
    throw new Error(json?.error || text || `HTTP ${response.status}`);
  }
  return json.data;
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Revokes a key in both engines; each needs its own master-wallet signature
async function revoke(network, master, accountID, name) {
  for (const [engine, path] of [['spot', 'spot'], ['futures', 'perps']]) {
    const { headers, body } = await signRevokeApiKey({
      privateKey: master.privateKey,
      engine,
      sodexChainId: network.chainId,
      accountID,
      name
    });
    try {
      await readSodex(await fetch(`${network.publicBase}/${path}/accounts/api-keys`, { method: 'DELETE', headers, body }));
      console.log(`[INFO] Revoked ${name} in ${path}.`);
    } catch (err) {
      console.error(`[ERROR] ${path} refused to revoke ${name}: ${err.message}`);
    }
  }
  await wait(2000);
  const keys = await readSodex(await fetch(`${network.publicBase}/user/${master.address}/api-keys?accountID=${accountID}&name=${name}`)).catch(() => null);
  const left = ['spot', 'perps'].filter(e => Array.isArray(keys?.[e]) && keys[e].some(k => k.name === name));
  console.log(left.length ? `[WARNING] Still listed in: ${left.join(', ')}. Check again in a minute.` : `[SUCCESS] ${name} is no longer listed.`);
}

async function main() {
  loadEnv();
  const network = getSodexNetwork();
  const masterKey = process.env.SODEX_MASTER_PRIVATE_KEY;
  if (!masterKey) {
    console.error('[ERROR] Set SODEX_MASTER_PRIVATE_KEY in your local .env.local (never on the server), then run this again.');
    process.exit(1);
  }

  const master = new ethers.Wallet(masterKey);
  const days = Number(process.env.SODEX_KEY_DAYS) || 90;
  console.log(`[INFO] ${network.label}, master wallet ${master.address}, key valid for ${days} days`);

  const account = await readSodex(await fetch(`${network.publicBase}/user/${master.address}/subaccounts`)).catch(err => {
    if (/user not found/i.test(err.message)) {
      console.error(`[ERROR] ${master.address} has no ${network.label} account. Use the private key of the wallet that has one,`);
      console.error(`        or open ${network.appUrl} with this wallet to create it, then run this again.`);
      process.exit(1);
    }
    throw err;
  });
  const { primaryAccountID } = account;

  const revokeAt = process.argv.indexOf('--revoke');
  if (revokeAt !== -1) {
    const name = process.argv[revokeAt + 1];
    if (!name) {
      console.error('[ERROR] Name the key to revoke: --revoke <key name>');
      process.exit(1);
    }
    await revoke(network, master, primaryAccountID, name);
    return;
  }
  console.log(`[INFO] SoDEX account ${primaryAccountID}`);

  const key = ethers.Wallet.createRandom();
  const name = `cinder-auto-${key.address.slice(2, 10).toLowerCase()}`;
  const nonce = nextNonce();
  const { typedData, body } = buildAddTradingKey({
    signingChainId: network.chainId,
    sodexChainId: network.chainId,
    nonce,
    accountID: primaryAccountID,
    name,
    publicKey: key.address,
    expiresAt: Date.now() + days * 24 * 60 * 60 * 1000
  });

  const { EIP712Domain, ...types } = typedData.types;
  const signature = await master._signTypedData(typedData.domain, types, typedData.message);

  await readSodex(await fetch(`${network.publicBase}/user/${master.address}/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Chain': String(network.chainId),
      'X-API-Nonce': String(nonce),
      'X-API-Sign': toUniversalSignature(signature)
    },
    body: JSON.stringify(body)
  }));
  console.log(`[INFO] SoDEX accepted key ${name}. Waiting for both engines to list it...`);

  let listed = false;
  for (let attempt = 0; attempt < 10 && !listed; attempt += 1) {
    await wait(2000);
    const keys = await readSodex(await fetch(
      `${network.publicBase}/user/${master.address}/api-keys?accountID=${primaryAccountID}&name=${name}`
    )).catch(() => null);
    const has = list => Array.isArray(list) && list.some(k => k.name === name);
    listed = has(keys?.spot) && has(keys?.perps);
  }
  if (!listed) {
    console.warn('[WARNING] The key is not listed in both engines yet. Check again in a minute before trading with it.');
  }

  console.log('\nAdd these to the server environment (the worker and the site):');
  console.log('----------------------------------------------------------------');
  console.log(`USER_WALLET_ADDRESS=${master.address}`);
  console.log(`SODEX_API_KEY_NAME=${name}`);
  console.log(`SODEX_API_KEY_PRIVATE_KEY=${key.privateKey}`);
  console.log(`NEXT_PUBLIC_SODEX_NETWORK=${network.name}`);
  console.log('----------------------------------------------------------------');
  console.log('Keep the master private key off the server. This key cannot withdraw or transfer funds.');
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
