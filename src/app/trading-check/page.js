'use client';

import { useEffect, useState } from 'react';
import Header from '../../components/shared/Header';
import Footer from '../../components/shared/Footer';
import { getSodexNetwork, getBuilderConfig } from '../../lib/sodex-network';
import { roundToStep, ORDER_SIDE, ORDER_TYPE, TIME_IN_FORCE } from '../../lib/sodex-signing';
import {
  requestWalletAddress,
  getWalletChainId,
  getPrimaryAccount,
  getSpotBalances,
  getApiKeys,
  getBuilderApprovals,
  getSpotSymbols,
  getSpotTicker,
  getSpotOpenOrders,
  loadTradingKey,
  forgetTradingKey,
  createTradingKey,
  approveBuilderFee,
  placeSpotOrder,
  cancelSpotOrder,
  newClientOrderId
} from '../../lib/sodex-browser';
import '../../styles/trading-check.css';

const network = getSodexNetwork();
const builder = getBuilderConfig();

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function roundUpToStep(value, step) {
  const down = roundToStep(value, step);
  return parseFloat(down) < value ? roundToStep(parseFloat(down) + parseFloat(step), step) : down;
}

function formatRate(tenthsOfBp) {
  return `${(tenthsOfBp / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function keyIsListed(response, name) {
  const data = response.json?.data || {};
  const has = list => Array.isArray(list) && list.some(item => item?.name === name);
  return { spot: has(data.spot), perps: has(data.perps) };
}

/** One step of the check: what it does, its action, and SoDEX's raw answer. */
function Step({ number, title, children, log }) {
  return (
    <section className="tc-step" aria-labelledby={`tc-step-${number}`}>
      <h2 id={`tc-step-${number}`} className="tc-step-title">
        <span className="tc-step-number">{number}</span>
        {title}
      </h2>
      <div className="tc-step-body">{children}</div>
      {log.length > 0 && (
        <ol className="tc-log">
          {log.map((entry, index) => (
            <li key={index} className={entry.ok === false ? 'tc-log-item is-error' : 'tc-log-item'}>
              <p>{entry.text}</p>
              {entry.raw && (
                <details>
                  <summary>Response from SoDEX</summary>
                  <pre>{entry.raw}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function TradingCheckPage() {
  const [address, setAddress] = useState(null);
  const [walletChainId, setWalletChainId] = useState(null);
  const [accountID, setAccountID] = useState(null);
  const [tradingKey, setTradingKey] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [symbolName, setSymbolName] = useState('vBTC_vUSDC');
  const [busy, setBusy] = useState(null);
  const [logs, setLogs] = useState({ 1: [], 2: [], 3: [], 4: [], 5: [] });

  const addLog = (step, text, result) => {
    const raw = result ? (result.text || '').slice(0, 3000) : null;
    setLogs(current => ({ ...current, [step]: [...current[step], { text, ok: result ? result.ok : undefined, raw }] }));
  };

  useEffect(() => {
    if (network.isMainnet) return;
    getSpotSymbols(network).then(result => {
      if (result.ok) setSymbols((result.json.data || []).filter(s => s.status === 'TRADING'));
    });
  }, []);

  const run = (step, task) => async () => {
    setBusy(step);
    try {
      await task();
    } catch (err) {
      addLog(step, err?.message || String(err), { ok: false, text: '' });
    } finally {
      setBusy(null);
    }
  };

  const connect = run(1, async () => {
    const wallet = await requestWalletAddress();
    const chainId = await getWalletChainId();
    setAddress(wallet);
    setWalletChainId(chainId);
    setTradingKey(loadTradingKey(wallet, network));
    addLog(1, `Connected ${wallet}. The wallet is on chain ${chainId}; account actions will be signed for that chain.`);
  });

  const findAccount = run(2, async () => {
    const accounts = await getPrimaryAccount(address, network);
    if (!accounts.ok) {
      const notOnboarded = /user not found/i.test(accounts.error || '');
      addLog(
        2,
        notOnboarded
          ? `${address} has no ${network.label} account yet. Open ${network.isMainnet ? 'sodex.com' : 'testnet.sodex.com'} with this wallet, accept the terms, claim test tokens and move some USDC to Spot, then look up the account again.`
          : `Could not look up the SoDEX account: ${accounts.error}`,
        accounts
      );
      return;
    }
    const id = accounts.json.data?.primaryAccountID;
    setAccountID(id);
    addLog(2, `Primary account ID ${id}.`, accounts);

    const balances = await getSpotBalances(address, id, network);
    const list = balances.json?.data?.balances || [];
    addLog(
      2,
      balances.ok
        ? (list.length ? `Spot balances: ${list.map(b => `${b.total} ${b.coin}`).join(', ')}.` : 'The spot account is empty. Move test USDC into Spot on sodex.com first.')
        : `Could not read balances: ${balances.error}`,
      balances
    );
  });

  const createKey = run(3, async () => {
    addLog(3, 'Asking your wallet to approve a trading key that can place and cancel orders but cannot withdraw or transfer.');
    const result = await createTradingKey({ address, accountID, network });
    if (!result.ok) {
      addLog(3, `SoDEX refused the key: ${result.error}`, result);
      return;
    }
    addLog(3, `SoDEX accepted key ${result.key.name}. Checking that both engines list it.`, result);
    setTradingKey(loadTradingKey(address, network));

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await wait(2000);
      const keys = await getApiKeys(address, accountID, result.key.name, network);
      const listed = keyIsListed(keys, result.key.name);
      if (listed.spot && listed.perps) {
        addLog(3, 'The key is listed in Spot and Perps. Ready to trade.', keys);
        return;
      }
      if (attempt === 6) {
        addLog(3, `After 12 seconds the key is listed in Spot: ${listed.spot ? 'yes' : 'no'}, Perps: ${listed.perps ? 'yes' : 'no'}.`, keys);
      }
    }
  });

  const forgetKey = () => {
    forgetTradingKey(address, network);
    setTradingKey(null);
    addLog(3, 'Removed the trading key from this browser. It stays registered on SoDEX until it expires.');
  };

  const approveFee = run(4, async () => {
    addLog(4, `Asking your wallet to approve Cinder's builder fee of up to ${formatRate(builder.maxFee)} for builder ${builder.id}.`);
    const result = await approveBuilderFee({ address, accountID, builderID: builder.id, maxFeeRate: builder.maxFee, network });
    addLog(4, result.ok ? 'SoDEX accepted the approval.' : `SoDEX refused the approval: ${result.error}`, result);
    await wait(2000);
    const approvals = await getBuilderApprovals(address, network);
    addLog(4, approvals.ok ? 'Current builder approvals for this wallet:' : `Could not read approvals: ${approvals.error}`, approvals);
  });

  const testOrder = run(5, async () => {
    const symbol = symbols.find(s => s.name === symbolName);
    if (!symbol) throw new Error('Pick a market first');

    const ticker = await getSpotTicker(symbol.name, network);
    const last = parseFloat(ticker.json?.data?.[0]?.lastPx);
    if (!ticker.ok || !(last > 0)) {
      addLog(5, `No last price for ${symbol.displayName}: ${ticker.error || 'empty ticker'}`, ticker);
      return;
    }

    // A limit buy 20% under the market rests on the book instead of filling, so it can be cancelled
    const price = roundToStep(last * 0.8, symbol.tickSize);
    const minNotional = parseFloat(symbol.minNotional) || 0;
    const quantity = roundUpToStep(Math.max(parseFloat(symbol.minQuantity) || 0, (minNotional * 1.2) / parseFloat(price)), symbol.stepSize);
    const clOrdID = newClientOrderId('t');

    addLog(5, `Placing a limit buy of ${quantity} ${symbol.baseCoin || ''} at ${price} (last price ${last}). About ${(parseFloat(price) * parseFloat(quantity)).toFixed(2)} USDC is held while it is open.`);
    const placed = await placeSpotOrder({
      key: tradingKey,
      order: { symbolID: symbol.id, clOrdID, side: ORDER_SIDE.BUY, type: ORDER_TYPE.LIMIT, timeInForce: TIME_IN_FORCE.GTC, price, quantity },
      builder: builder ? { id: builder.id, fee: builder.fee } : null,
      network
    });
    const item = placed.json?.data?.[0];
    const accepted = placed.ok && item?.code === 0;
    addLog(5, accepted ? `Order accepted (client ID ${clOrdID}).` : `Order refused: ${item?.error || placed.error}`, { ...placed, ok: accepted });
    if (!accepted && /api key/i.test(item?.error || placed.error || '')) {
      // Compare the key this browser signs with against what SoDEX has registered for the account
      const keys = await getApiKeys(address, tradingKey.accountID, null, network);
      const listed = keyIsListed(keys, tradingKey.name);
      addLog(
        5,
        `This browser signed as key ${tradingKey.name} (address ${tradingKey.publicKey}) on account ${tradingKey.accountID}. ` +
          `SoDEX lists it in Spot: ${listed.spot ? 'yes' : 'no'}, Perps: ${listed.perps ? 'yes' : 'no'}. All keys on the account:`,
        keys
      );
    }
    if (!accepted) return;

    await wait(2500);
    const open = await getSpotOpenOrders(address, accountID, symbol.name, network);
    addLog(5, open.ok ? 'Open orders on this market:' : `Could not read open orders: ${open.error}`, open);

    const cancelled = await cancelSpotOrder({ key: tradingKey, symbolID: symbol.id, origClOrdID: clOrdID, network });
    const cancelItem = cancelled.json?.data?.[0];
    const cancelOk = cancelled.ok && cancelItem?.code === 0;
    addLog(5, cancelOk ? 'Order cancelled. The test is complete.' : `Cancel refused: ${cancelItem?.error || cancelled.error}. Cancel it on sodex.com.`, { ...cancelled, ok: cancelOk });
  });

  if (network.isMainnet) {
    return (
      <main className="tc-page">
        <Header />
        <div className="tc-wrap">
          <h1 className="tc-title">Trading check</h1>
          <p className="tc-lede">This check places real orders, so it only runs on SoDEX testnet.</p>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="tc-page">
      <Header />
      <div className="tc-wrap">
        <h1 className="tc-title">Trading check</h1>
        <p className="tc-lede">
          Runs each step of trading from your own {network.label} account, using a wallet that SoDEX has whitelisted.
          Nothing here touches Cinder&apos;s account. The test order sits under the market and is cancelled straight away.
        </p>

        <Step number={1} title="Connect your wallet" log={logs[1]}>
          <button type="button" className="tc-button" onClick={connect} disabled={busy !== null}>
            {address ? 'Connected' : busy === 1 ? 'Connecting' : 'Connect wallet'}
          </button>
          {address && <p className="tc-note">{address}, wallet chain {walletChainId}</p>}
        </Step>

        <Step number={2} title="Find your SoDEX account" log={logs[2]}>
          <button type="button" className="tc-button" onClick={findAccount} disabled={!address || busy !== null}>
            {busy === 2 ? 'Looking up' : 'Look up account'}
          </button>
        </Step>

        <Step number={3} title="Approve a trading key" log={logs[3]}>
          {tradingKey ? (
            <>
              <p className="tc-note">
                Key {tradingKey.name} is saved in this browser until {new Date(tradingKey.expiresAt).toUTCString()}.
              </p>
              <button type="button" className="tc-button tc-button-quiet" onClick={forgetKey} disabled={busy !== null}>
                Forget this key
              </button>
            </>
          ) : (
            <button type="button" className="tc-button" onClick={createKey} disabled={!accountID || busy !== null}>
              {busy === 3 ? 'Waiting for wallet' : 'Create trading key'}
            </button>
          )}
        </Step>

        <Step number={4} title="Approve Cinder's builder fee" log={logs[4]}>
          {builder ? (
            <button type="button" className="tc-button" onClick={approveFee} disabled={!accountID || busy !== null}>
              {busy === 4 ? 'Waiting for wallet' : `Approve up to ${formatRate(builder.maxFee)}`}
            </button>
          ) : (
            <p className="tc-note">
              No builder is set. Add NEXT_PUBLIC_SODEX_BUILDER_ID and NEXT_PUBLIC_SODEX_BUILDER_FEE to test this step;
              orders below are placed without a builder fee.
            </p>
          )}
        </Step>

        <Step number={5} title="Place and cancel a test order" log={logs[5]}>
          <div className="tc-row">
            <label className="tc-label" htmlFor="tc-symbol">Market</label>
            <select id="tc-symbol" className="tc-select" value={symbolName} onChange={e => setSymbolName(e.target.value)}>
              {symbols.map(s => (
                <option key={s.id} value={s.name}>{s.displayName}</option>
              ))}
            </select>
            <button type="button" className="tc-button" onClick={testOrder} disabled={!tradingKey || !symbols.length || busy !== null}>
              {busy === 5 ? 'Running' : 'Run test order'}
            </button>
          </div>
        </Step>
      </div>
      <Footer />
    </main>
  );
}
