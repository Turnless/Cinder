import { NextResponse } from 'next/server';
import { query, execute, initializeDb } from '../../../lib/db';
import { getAccountState, placeOrder, getTicker } from '../../../lib/sodex';
import { hasValidInternalSecret } from '../../../lib/secrets';
import { getRiskConfig } from '../../../lib/risk-config';
import {
  getRpcUrl,
  getCndrTokenAddress,
  getTreasury,
  verifyCndrPayment,
  sendCndrPayout,
  PAYMENT_PRICE_TOLERANCE
} from '../../../lib/cndr';
import { ethers } from 'ethers';

export const dynamic = 'force-dynamic';

// Signed orders carry their signing time (ms) as the nonce; older ones are rejected
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;

// Last-resort prices when neither SoDEX nor CoinGecko answers (demo mode only for trades)
const MOCK_PRICES = { BTC: '64850.00', ETH: '3210.00', SOL: '145.50', UNI: '7.50', AAVE: '88.20' };

function getMockPrice(pair) {
  return MOCK_PRICES[String(pair).split('-')[0].toUpperCase()] || '1.00';
}

/**
 * Current market price from SoDEX (with getTicker's CoinGecko fallback), else the mock table.
 * @param {string} pair - e.g. 'BTC-USDC'
 * @returns {Promise<{price: string, isMock: boolean}>} Price as a decimal string
 */
async function getServerPrice(pair) {
  try {
    const ticker = await getTicker(pair);
    if (parseFloat(ticker?.price) > 0) {
      return { price: String(ticker.price), isMock: false };
    }
  } catch (err) {
    console.warn(`[WARNING] Live price unavailable for ${pair}:`, err.message);
  }
  return { price: getMockPrice(pair), isMock: true };
}

function isUniqueViolation(err) {
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(String(err?.message || err?.code || ''));
}

// Migrations run once per server process, before any route reads or writes trade tables
let dbInitialized = false;

async function ensureDbInitialized() {
  if (dbInitialized) return;
  try {
    await initializeDb();
    dbInitialized = true;
  } catch (initErr) {
    console.warn('[WARNING] DB initialization error:', initErr.message);
  }
}

/**
 * GET /api/trade
 * Retrieves SoDEX account state, open positions, and executed trade logs.
 */
export async function GET(request) {
  await ensureDbInitialized();
  try {
    const { searchParams } = new URL(request.url);
    const paramAddress = searchParams.get('address');
    const paramBalance = searchParams.get('balance');
    const paramTicker = searchParams.get('ticker');
    const paramMasterAddress = searchParams.get('masterAddress');

    if (paramMasterAddress) {
      // Address that receives CNDR for BUY orders
      const treasury = getTreasury();
      if (!treasury) {
        return NextResponse.json({ success: false, error: 'Treasury wallet is not configured' }, { status: 503 });
      }
      return NextResponse.json({ success: true, masterAddress: treasury.address });
    }

    if (paramTicker) {
      try {
        const ticker = await getTicker(paramTicker);
        return NextResponse.json({ success: true, price: ticker.price || '0.00' });
      } catch (err) {
        // SoDEX failed — try CoinGecko directly as fallback
        try {
          const baseToken = paramTicker.split('-')[0].toUpperCase();
          const coinIdMap = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', UNI: 'uniswap', AAVE: 'aave', DOGE: 'dogecoin' };
          const coinId = coinIdMap[baseToken];
          if (coinId) {
            const coinGeckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
            console.log(`[TICKER] Trying CoinGecko fallback: ${coinGeckoUrl}`);
            const cgRes = await fetch(coinGeckoUrl, { signal: AbortSignal.timeout(5000) });
            console.log(`[TICKER] CoinGecko response status: ${cgRes.status}`);
            if (cgRes.ok) {
              const cgData = await cgRes.json();
              const price = cgData[coinId]?.usd;
              if (price) {
                return NextResponse.json({ success: true, price: parseFloat(price).toString() });
              }
            }
          }
        } catch (cgErr) {
          console.warn(`[WARNING] CoinGecko fallback also failed for ${paramTicker}:`, cgErr.message);
        }
        // Final fallback: mock prices
        return NextResponse.json({ success: true, price: getMockPrice(paramTicker), isMock: true });
      }
    }

    let balance = '10000.00';
    let positions = [];
    
    const userAddress = paramAddress || process.env.USER_WALLET_ADDRESS;

    if (userAddress) {
      const tokenAddress = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
      if (tokenAddress && tokenAddress !== '0x...' && tokenAddress !== '') {
        try {
          const provider = new ethers.providers.JsonRpcProvider(getRpcUrl());
          const abi = ["function balanceOf(address owner) view returns (uint256)"];
          const contract = new ethers.Contract(tokenAddress, abi, provider);
          const tokenBal = await contract.balanceOf(userAddress);
          balance = parseFloat(ethers.utils.formatUnits(tokenBal, 18)).toFixed(2);
        } catch (chainBalErr) {
          console.warn('[WARNING] Failed to load on-chain CNDR balance, falling back to DB:', chainBalErr.message);
          const rows = await query(`SELECT balance FROM wallet_balances WHERE address = ?`, [userAddress.toLowerCase()]);
          balance = rows && rows.length > 0 ? parseFloat(rows[0].balance).toFixed(2) : '10000.00';
        }
      } else {
        const rows = await query(`SELECT balance FROM wallet_balances WHERE address = ?`, [userAddress.toLowerCase()]);
        balance = rows && rows.length > 0 ? parseFloat(rows[0].balance).toFixed(2) : '10000.00';
      }
    }

    const sodexApiKey = process.env.SODEX_API_KEY_NAME;
    
    let isMockMode = !userAddress || 
                       userAddress === 'your_evm_wallet_address_0x...' || 
                       !sodexApiKey || 
                       sodexApiKey === 'your_api_key_name';

    if (!isMockMode) {
      try {
        const state = await getAccountState(userAddress);
        // Do not overwrite balance with USDC balance since we settle trades in CNDR

        const nonCash = state.balances.filter(b => b.asset !== 'USDC' && b.asset !== 'USDT' && parseFloat(b.amount) > 0);
        positions = await Promise.all(nonCash.map(async b => {
          let entryPrice = '0.00';
          let currentPrice = '0.00';
          
          try {
            const ticker = await getTicker(`${b.asset}-USDC`);
            currentPrice = ticker.price || '0.00';
          } catch (e) {
            console.warn(`Could not fetch ticker for ${b.asset}-USDC:`, e.message);
          }

          // Fetch last entry price from database
          const lastBuy = await query(`
            SELECT fill_price FROM trades 
            WHERE pair = ? AND side = 'buy' AND status = 'filled' 
            ORDER BY created_at DESC LIMIT 1
          `, [`${b.asset}-USDC`]);
          
          if (lastBuy && lastBuy.length > 0) {
            entryPrice = lastBuy[0].fill_price;
          } else {
            entryPrice = currentPrice;
          }

          const qty = parseFloat(b.amount);
          const curPriceNum = parseFloat(currentPrice);
          const entPriceNum = parseFloat(entryPrice);
          const value = qty * curPriceNum;
          const pnlPct = entPriceNum > 0 ? ((curPriceNum - entPriceNum) / entPriceNum) * 100 : 0;

          return {
            asset: b.asset,
            quantity: b.amount,
            entryPrice,
            currentPrice,
            value: value.toFixed(2),
            return: pnlPct.toFixed(2),
            stopLoss: (entPriceNum * 0.92).toFixed(2) // 8% stop loss default
          };
        }));
      } catch (err) {
        console.error('SoDEX API state fetch failed, falling back to mock dashboard data:', err.message);
        isMockMode = true;
      }
    }

    // Set standard mocks if we are in mock mode or SoDEX failed
    if (isMockMode || positions.length === 0) {
      if (userAddress) {
        // Dynamically compute positions based on filled trades in database for this user
        const userAddrLower = userAddress.toLowerCase();
        const dbTrades = await query("SELECT * FROM trades WHERE status IN ('filled', 'simulated') AND user_address = ?", [userAddrLower]);
        const userPositions = {};

        for (const t of dbTrades) {
          const baseToken = t.pair.split('-')[0].toUpperCase();
          const qty = parseFloat(t.quantity);
          const fill = parseFloat(t.fill_price || '0');
          if (!userPositions[baseToken]) {
            userPositions[baseToken] = { quantity: 0, entryPrice: 0 };
          }
          if (t.side.toLowerCase() === 'buy') {
            const prevQty = userPositions[baseToken].quantity;
            const prevEntry = userPositions[baseToken].entryPrice;
            const newQty = prevQty + qty;
            const newEntry = newQty > 0 ? ((prevQty * prevEntry) + (qty * fill)) / newQty : 0;
            userPositions[baseToken].quantity = newQty;
            userPositions[baseToken].entryPrice = newEntry;
          } else if (t.side.toLowerCase() === 'sell') {
            userPositions[baseToken].quantity = Math.max(0, userPositions[baseToken].quantity - qty);
          }
        }

        positions = await Promise.all(Object.entries(userPositions)
          .filter(([_, data]) => data.quantity > 0.000001)
          .map(async ([asset, data]) => {
            let currentPrice = '0.00';
            try {
              const ticker = await getTicker(`${asset}-USDC`);
              currentPrice = ticker.price || '0.00';
            } catch (e) {
              currentPrice = asset === 'BTC' ? '65000.00' : (asset === 'ETH' ? '3400.00' : '140.00');
            }

            const qty = data.quantity;
            const entPriceNum = data.entryPrice;
            const curPriceNum = parseFloat(currentPrice);
            const value = qty * curPriceNum;
            const pnlPct = entPriceNum > 0 ? ((curPriceNum - entPriceNum) / entPriceNum) * 100 : 0;

            // This wallet's own latest stop-loss for the pair, not whichever wallet bought last
            const lastBuy = await query(`
              SELECT stop_loss_price FROM trades 
              WHERE pair = ? AND user_address = ? AND side = 'buy' AND status = 'filled' 
              ORDER BY created_at DESC LIMIT 1
            `, [`${asset}-USDC`, userAddrLower]);
            
            const stopLoss = lastBuy && lastBuy.length > 0 && lastBuy[0].stop_loss_price
              ? parseFloat(lastBuy[0].stop_loss_price).toFixed(2)
              : (entPriceNum * 0.92).toFixed(2);

            return {
              asset,
              quantity: qty.toFixed(6),
              entryPrice: entPriceNum.toFixed(2),
              currentPrice,
              value: value.toFixed(2),
              return: pnlPct.toFixed(2),
              stopLoss
            };
          }));
      } else {
        balance = '14820.65';
        positions = [
          { 
            asset: 'BTC', 
            quantity: '0.1500', 
            entryPrice: '62500.00', 
            currentPrice: '64850.00', 
            value: '9727.50', 
            return: '3.76', 
            stopLoss: '57500.00' 
          },
          { 
            asset: 'ETH', 
            quantity: '1.2000', 
            entryPrice: '3150.00', 
            currentPrice: '3210.00', 
            value: '3852.00', 
            return: '1.90', 
            stopLoss: '2898.00' 
          }
        ];
      }
    }

    // Retrieve trade history from the local database
    const tradeHistoryAddr = paramAddress ? paramAddress.toLowerCase() : null;
    const dbTrades = tradeHistoryAddr
      ? await query(`
          SELECT t.*, s.story_id 
          FROM trades t
          LEFT JOIN narrative_shifts s ON t.shift_id = s.id
          WHERE t.user_address = ?
          ORDER BY t.created_at DESC 
          LIMIT 50
        `, [tradeHistoryAddr])
      : await query(`
          SELECT t.*, s.story_id 
          FROM trades t
          LEFT JOIN narrative_shifts s ON t.shift_id = s.id
          ORDER BY t.created_at DESC 
          LIMIT 50
        `);

    // Calculate per-user virtual balance from trade history
    const INITIAL_VIRTUAL_BALANCE = 10000.00;
    let virtualBalance = INITIAL_VIRTUAL_BALANCE;
    if (tradeHistoryAddr) {
      const userTrades = await query(
        "SELECT side, quantity, fill_price FROM trades WHERE user_address = ? AND status IN ('filled', 'simulated') ORDER BY created_at ASC",
        [tradeHistoryAddr]
      );
      for (const t of userTrades) {
        const qty = parseFloat(t.quantity || '0');
        const price = parseFloat(t.fill_price || '0');
        const cost = qty * price;
        if (t.side.toLowerCase() === 'buy') {
          virtualBalance -= cost;
        } else if (t.side.toLowerCase() === 'sell') {
          virtualBalance += cost;
        }
      }
    }

    return NextResponse.json({
      success: true,
      balance: tradeHistoryAddr ? virtualBalance.toFixed(2) : balance,
      positions,
      trades: dbTrades,
      riskConfig: getRiskConfig()
    });
  } catch (error) {
    console.error('Error fetching trade details in API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/trade
 * Executes a manual trade, authenticated either by the internal API secret (trusted callers)
 * or by an EIP-712 signature from the trading wallet (QuickTrade / PortfolioView).
 *
 * Wallet-signed trades additionally require:
 * - a fresh, unused nonce (replay protection)
 * - SELL: an open position in the database covering the quantity
 * - BUY with CNDR deployed: an on-chain CNDR payment to the treasury, used only once
 * Fill prices always come from the server's price feed or the exchange, never from the request.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { pair, side, orderType, quantity, price, stopLossPrice, clientWallet, signature, nonce, txHash } = body;

    // Auth: accept internal API secret (trusted callers) OR wallet signature (client QuickTrade)
    const hasInternalAuth = hasValidInternalSecret(request);
    const isClientTrade = !hasInternalAuth;

    if (isClientTrade) {
      if (!clientWallet || !signature || signature === '0x') {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: provide x-internal-api-secret header or wallet signature' },
          { status: 401 }
        );
      }

      // Nonce must be the signing time (ms) and recent, so old signatures can't be replayed later
      const nonceMs = Number(nonce);
      if (!Number.isSafeInteger(nonceMs) || Math.abs(Date.now() - nonceMs) > NONCE_MAX_AGE_MS) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: order signature is missing a nonce or has expired. Please sign again.' },
          { status: 401 }
        );
      }

      // Verify EIP-712 signature from client wallet
      try {
        const chainId = Number(process.env.CHAIN_ID || '421614');
        const domain = {
          name: 'spot',
          version: '1',
          chainId,
          verifyingContract: '0x0000000000000000000000000000000000000000'
        };
        const types = {
          ExchangeAction: [
            { name: 'payloadHash', type: 'bytes32' },
            { name: 'nonce', type: 'uint64' }
          ]
        };
        const orderParams = {
          pair,
          side,
          orderType,
          quantity: String(quantity),
          price: String(price || '0.0'),
          stopPrice: stopLossPrice ? String(stopLossPrice) : '0.0'
        };
        const payloadJson = JSON.stringify({ type: 'newOrder', params: orderParams });
        const payloadHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadJson));
        const recoveredAddress = ethers.utils.verifyTypedData(domain, types, { payloadHash, nonce: nonceMs }, signature);
        if (recoveredAddress.toLowerCase() !== clientWallet.toLowerCase()) {
          return NextResponse.json(
            { success: false, error: 'Unauthorized: wallet signature does not match clientWallet' },
            { status: 401 }
          );
        }
      } catch (sigErr) {
        console.error('[ERROR] Signature verification failed:', sigErr.message);
        return NextResponse.json(
          { success: false, error: 'Unauthorized: invalid wallet signature' },
          { status: 401 }
        );
      }
    }

    if (!pair || !side || !orderType || !quantity) {
      return NextResponse.json({ success: false, error: 'Missing required parameters (pair, side, orderType, quantity)' }, { status: 400 });
    }

    const sideLower = String(side).toLowerCase();
    const qtyNum = parseFloat(quantity);
    if (!['buy', 'sell'].includes(sideLower) || !(qtyNum > 0)) {
      return NextResponse.json({ success: false, error: 'Invalid side or quantity' }, { status: 400 });
    }

    await ensureDbInitialized();

    const activeAddress = clientWallet || process.env.USER_WALLET_ADDRESS;
    const activeAddressLower = (activeAddress || '').toLowerCase();

    // Record the nonce; a duplicate means this exact signed order was already submitted
    if (isClientTrade) {
      try {
        await execute(
          'INSERT INTO trade_nonces (wallet_address, nonce) VALUES (?, ?)',
          [activeAddressLower, String(nonce)]
        );
      } catch (nonceErr) {
        if (isUniqueViolation(nonceErr)) {
          return NextResponse.json({ success: false, error: 'This signed order was already submitted' }, { status: 409 });
        }
        throw nonceErr;
      }
      // Nonces only need to outlive the signature window; keep the table small
      execute("DELETE FROM trade_nonces WHERE created_at < datetime('now', '-1 day')").catch(() => {});
    }

    const sodexApiKey = process.env.SODEX_API_KEY_NAME;
    const isMockMode = !process.env.USER_WALLET_ADDRESS ||
                       process.env.USER_WALLET_ADDRESS === 'your_evm_wallet_address_0x...' ||
                       !sodexApiKey ||
                       sodexApiKey === 'your_api_key_name';

    // Server-side price: the request's price is only a signed limit, never a fill or payout price
    const serverPrice = await getServerPrice(pair);
    if (serverPrice.isMock && !isMockMode) {
      return NextResponse.json({ success: false, error: `Live price for ${pair} is unavailable. Please try again shortly.` }, { status: 503 });
    }

    // SELL: the wallet must hold the position it is selling
    if (isClientTrade && sideLower === 'sell') {
      const rows = await query(
        `SELECT LOWER(side) as side, quantity FROM trades
         WHERE user_address = ? AND pair = ? AND status IN ('filled', 'simulated')`,
        [activeAddressLower, pair]
      );
      const held = rows.reduce((sum, t) => {
        const q = parseFloat(t.quantity || '0');
        return t.side === 'buy' ? sum + q : t.side === 'sell' ? sum - q : sum;
      }, 0);
      // Small epsilon: positions are displayed (and sent back) rounded to 6 decimals
      if (qtyNum > held + 1e-6) {
        return NextResponse.json(
          { success: false, error: `Insufficient position: you hold ${Math.max(0, held).toFixed(6)} of ${pair.split('-')[0]}` },
          { status: 400 }
        );
      }
    }

    // BUY with CNDR deployed: require an on-chain payment to the treasury, usable once
    if (isClientTrade && sideLower === 'buy' && getCndrTokenAddress()) {
      const treasury = getTreasury();
      if (!treasury) {
        return NextResponse.json({ success: false, error: 'Treasury wallet is not configured' }, { status: 503 });
      }
      if (!txHash) {
        return NextResponse.json({ success: false, error: 'Missing CNDR payment transaction (txHash)' }, { status: 402 });
      }

      const minAmount = qtyNum * parseFloat(serverPrice.price) * (1 - PAYMENT_PRICE_TOLERANCE);
      const payment = await verifyCndrPayment({ txHash, from: activeAddress, to: treasury.address, minAmount });
      if (!payment.ok) {
        return NextResponse.json({ success: false, error: payment.reason }, { status: 402 });
      }

      try {
        await execute(
          'INSERT INTO cndr_payments (tx_hash, wallet_address, pair, amount) VALUES (?, ?, ?, ?)',
          [txHash.toLowerCase(), activeAddressLower, pair, payment.paid]
        );
      } catch (payErr) {
        if (isUniqueViolation(payErr)) {
          return NextResponse.json({ success: false, error: 'This CNDR payment was already used for another order' }, { status: 409 });
        }
        throw payErr;
      }
    }

    const tradeId = 'tr_' + Math.random().toString(36).substr(2, 9);
    let sodexOrderId = null;
    let status = 'PENDING';
    let fillPrice = serverPrice.price;
    let simulated = false;

    const orderParams = {
      pair,
      side,
      orderType,
      quantity,
      price: price || '0.0',
      stopPrice: stopLossPrice || '0.0'
    };

    if (isMockMode) {
      // Demo mode: no SoDEX credentials, fill instantly at the server price
      sodexOrderId = 'ord_mock_' + Math.random().toString(36).substr(2, 9);
      status = 'FILLED';
      simulated = true;
    } else {
      try {
        const sodexRes = await placeOrder(orderParams);
        sodexOrderId = sodexRes.orderId;
        status = sodexRes.status || 'FILLED';
        fillPrice = sodexRes.fillPrice || sodexRes.price || serverPrice.price;
      } catch (placeErr) {
        // Not recorded as a real fill: the trade is kept (a BUY may already be paid for) but marked simulated
        console.warn('[WARNING] SoDEX live order placement failed, recording a simulated fill:', placeErr.message);
        sodexOrderId = 'ord_sim_' + Math.random().toString(36).substr(2, 9);
        status = 'SIMULATED';
        simulated = true;
      }
    }

    const statusLower = status.toLowerCase();
    const isSettled = statusLower === 'filled' || statusLower === 'simulated';

    // Auto-calculate stop-loss if not explicitly set (use default SL logic)
    let finalStopLossPrice = stopLossPrice;
    if (!finalStopLossPrice && sideLower === 'buy') {
      const stopLossPercent = parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.08');
      finalStopLossPrice = (parseFloat(fillPrice) * (1 - stopLossPercent)).toFixed(4);
    }

    // Update wallet balance for local/simulated and database consistency
    if (activeAddress) {
      try {
        let currentBalance = 10000.00;
        const rows = await query('SELECT balance FROM wallet_balances WHERE address = ?', [activeAddressLower]);
        if (rows && rows.length > 0) {
          currentBalance = parseFloat(rows[0].balance || '0');
        }

        const cost = qtyNum * parseFloat(fillPrice);
        const newBalance = sideLower === 'buy' ? currentBalance - cost : currentBalance + cost;

        await execute(`
          INSERT INTO wallet_balances (address, balance, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(address) DO UPDATE SET
            balance = excluded.balance,
            updated_at = excluded.updated_at
        `, [activeAddressLower, newBalance.toFixed(2)]);
      } catch (balErr) {
        console.error('[ERROR] Failed to update balance in database:', balErr.message);
      }
    }

    // SELL settles in CNDR: the treasury pays the proceeds back to the wallet once the order is settled
    if (sideLower === 'sell' && activeAddress && isSettled && getCndrTokenAddress()) {
      try {
        console.log('[INFO] Executing server-side CNDR payout on SELL...');
        const payoutHash = await sendCndrPayout(activeAddress, qtyNum * parseFloat(fillPrice));
        if (payoutHash) {
          console.log('[SUCCESS] CNDR payout transaction settled:', payoutHash);
        }
      } catch (sellTxErr) {
        console.warn('[WARNING] Failed to execute server-side CNDR transfer payout (likely RPC or treasury balance):', sellTxErr.message);
        // Do not fail the API call if we are offline or RPC is down, fall back to database settlement
      }
    }

    // Insert trade into database
    await execute(`
      INSERT INTO trades (id, user_address, side, pair, order_type, quantity, fill_price, stop_loss_price, sodex_order_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      tradeId,
      activeAddressLower,
      side,
      pair,
      orderType,
      String(quantity),
      String(fillPrice),
      finalStopLossPrice ? String(finalStopLossPrice) : null,
      sodexOrderId || null,
      statusLower
    ]);

    return NextResponse.json({
      success: true,
      tradeId,
      sodexOrderId,
      status,
      fillPrice: String(fillPrice),
      simulated
    });
  } catch (error) {
    console.error('Error in POST /api/trade:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
