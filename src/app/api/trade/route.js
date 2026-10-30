import { NextResponse } from 'next/server';
import { query, execute, initializeDb } from '../../../lib/db';
import { getAccountState, placeOrder, getTicker } from '../../../lib/sodex';
import { hasValidInternalSecret } from '../../../lib/secrets';
import { getRiskConfig } from '../../../lib/risk-config';

export const dynamic = 'force-dynamic';

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

// Without Cinder's own SoDEX account configured, trades are simulated at the live price
function isDemoMode() {
  const address = process.env.USER_WALLET_ADDRESS;
  const keyName = process.env.SODEX_API_KEY_NAME;
  return !address || address === 'your_evm_wallet_address_0x...' || !keyName || keyName === 'your_api_key_name';
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
 * Cinder's own trading account: open positions and the trades it has placed.
 * Users' accounts are read from SoDEX directly in the browser.
 * With ?ticker=BTC-USDC, returns the current price instead.
 */
export async function GET(request) {
  await ensureDbInitialized();
  try {
    const { searchParams } = new URL(request.url);
    const paramTicker = searchParams.get('ticker');

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
            const cgRes = await fetch(coinGeckoUrl, { signal: AbortSignal.timeout(5000) });
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

    let balance = null;
    let positions = null;

    if (!isDemoMode()) {
      try {
        const state = await getAccountState(process.env.USER_WALLET_ADDRESS);
        const cash = state.balances.find(b => b.asset === 'USDC' || b.asset === 'vUSDC');
        balance = parseFloat(cash?.amount || 0).toFixed(2);

        const nonCash = state.balances.filter(b => !['USDC', 'vUSDC', 'USDT'].includes(b.asset) && parseFloat(b.amount) > 0);
        positions = await Promise.all(nonCash.map(async b => {
          let currentPrice = '0.00';
          try {
            const ticker = await getTicker(`${b.asset}-USDC`);
            currentPrice = ticker.price || '0.00';
          } catch (e) {
            console.warn(`Could not fetch ticker for ${b.asset}-USDC:`, e.message);
          }

          // Entry price and stop-loss come from Cinder's latest filled buy of this asset
          const lastBuy = await query(`
            SELECT fill_price, stop_loss_price FROM trades
            WHERE pair = ? AND side = 'buy' AND status = 'filled'
            ORDER BY created_at DESC LIMIT 1
          `, [`${b.asset}-USDC`]);
          const entryPrice = lastBuy?.[0]?.fill_price || currentPrice;

          const qty = parseFloat(b.amount);
          const curPriceNum = parseFloat(currentPrice);
          const entPriceNum = parseFloat(entryPrice);
          const pnlPct = entPriceNum > 0 ? ((curPriceNum - entPriceNum) / entPriceNum) * 100 : 0;

          return {
            asset: b.asset,
            quantity: b.amount,
            entryPrice,
            currentPrice,
            value: (qty * curPriceNum).toFixed(2),
            return: pnlPct.toFixed(2),
            stopLoss: lastBuy?.[0]?.stop_loss_price
              ? parseFloat(lastBuy[0].stop_loss_price).toFixed(2)
              : (entPriceNum * 0.92).toFixed(2)
          };
        }));
      } catch (err) {
        console.error('SoDEX account state fetch failed, showing demo data:', err.message);
      }
    }

    // Demo account when SoDEX is not configured or did not answer
    if (positions === null) {
      balance = '14820.65';
      positions = [
        { asset: 'BTC', quantity: '0.1500', entryPrice: '62500.00', currentPrice: '64850.00', value: '9727.50', return: '3.76', stopLoss: '57500.00' },
        { asset: 'ETH', quantity: '1.2000', entryPrice: '3150.00', currentPrice: '3210.00', value: '3852.00', return: '1.90', stopLoss: '2898.00' }
      ];
    }

    const trades = await query(`
      SELECT t.*, s.story_id
      FROM trades t
      LEFT JOIN narrative_shifts s ON t.shift_id = s.id
      ORDER BY t.created_at DESC
      LIMIT 50
    `);

    return NextResponse.json({
      success: true,
      balance,
      positions,
      trades,
      riskConfig: getRiskConfig()
    });
  } catch (error) {
    console.error('Error fetching trade details in API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/trade
 * Places a trade on Cinder's own SoDEX account. Only trusted callers with the internal
 * API secret may use it; users trade from their own accounts in the browser.
 * Fill prices come from the server's price feed or the exchange, never from the request.
 */
export async function POST(request) {
  try {
    if (!hasValidInternalSecret(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: provide the x-internal-api-secret header' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { pair, side, orderType, quantity, price, stopLossPrice } = body;

    if (!pair || !side || !orderType || !quantity) {
      return NextResponse.json({ success: false, error: 'Missing required parameters (pair, side, orderType, quantity)' }, { status: 400 });
    }

    const sideLower = String(side).toLowerCase();
    const qtyNum = parseFloat(quantity);
    if (!['buy', 'sell'].includes(sideLower) || !(qtyNum > 0)) {
      return NextResponse.json({ success: false, error: 'Invalid side or quantity' }, { status: 400 });
    }

    await ensureDbInitialized();

    const isMockMode = isDemoMode();
    const accountAddress = (process.env.USER_WALLET_ADDRESS || '').toLowerCase();

    // Server-side price: the request's price is only a limit, never a fill price
    const serverPrice = await getServerPrice(pair);
    if (serverPrice.isMock && !isMockMode) {
      return NextResponse.json({ success: false, error: `Live price for ${pair} is unavailable. Please try again shortly.` }, { status: 503 });
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
        // Not recorded as a real fill: the trade is kept but marked simulated
        console.warn('[WARNING] SoDEX live order placement failed, recording a simulated fill:', placeErr.message);
        sodexOrderId = 'ord_sim_' + Math.random().toString(36).substr(2, 9);
        status = 'SIMULATED';
        simulated = true;
      }
    }

    const statusLower = status.toLowerCase();

    // Auto-calculate stop-loss if not explicitly set (use default SL logic)
    let finalStopLossPrice = stopLossPrice;
    if (!finalStopLossPrice && sideLower === 'buy') {
      const stopLossPercent = parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.08');
      finalStopLossPrice = (parseFloat(fillPrice) * (1 - stopLossPercent)).toFixed(4);
    }

    // Insert trade into database
    await execute(`
      INSERT INTO trades (id, user_address, side, pair, order_type, quantity, fill_price, stop_loss_price, sodex_order_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      tradeId,
      accountAddress,
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
