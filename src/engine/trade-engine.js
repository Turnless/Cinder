/**
 * Cinder Trade Execution Engine.
 * Fully implemented risk checks, portfolio sizing, order execution, and stop-loss monitoring.
 */

import crypto from 'crypto';
import { query, execute, batch } from '../lib/db.js';
import { NARRATIVES, updateNarrativeTemperatures } from './narrative.js';
import { detectShift } from './shift-detector.js';
import { placeOrder, getTicker, fetchAccountBalances, getAccountState } from '../lib/sodex.js';
import { createBreakingStory } from '../lib/openai.js';
import { validateStory, getTemplateStory } from '../lib/validator.js';
import { sendMessage, sendNarrativeAlert, sendDailyDigest } from '../lib/telegram.js';

/**
 * Helper to parse datetime strings from SQLite correctly as UTC.
 * @param {string} str - Datetime string
 * @returns {number} Epoch milliseconds
 */
function parseSqliteDatetime(str) {
  if (!str) return 0;
  const formatted = (str.endsWith('Z') || str.includes('+') || str.includes('-')) 
    ? str 
    : str.replace(' ', 'T') + 'Z';
  return new Date(formatted).getTime();
}

/**
 * Helper to check if the Vercel Edge Config kill-switch is active.
 * @returns {Promise<boolean>} True if trading is paused/kill-switch active
 */
async function isKillSwitchActive() {
  if (global.tradingPaused === true) {
    return true;
  }
  const edgeConfigUrl = process.env.EDGE_CONFIG_URL || process.env.EDGE_CONFIG;
  if (!edgeConfigUrl) {
    return false; // Default to false if not configured
  }
  try {
    let fetchUrl = edgeConfigUrl;
    if (edgeConfigUrl.includes('?')) {
      const [base, queryStr] = edgeConfigUrl.split('?');
      fetchUrl = `${base}/value/trading_paused?${queryStr}`;
    } else {
      fetchUrl = `${edgeConfigUrl}/value/trading_paused`;
    }

    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const isPaused = await res.json();
      return isPaused === true || isPaused === 'true';
    }
  } catch (err) {
    console.error('Failed to fetch Edge Config kill-switch:', err);
    const failClosed = process.env.KILL_SWITCH_FAIL_CLOSED !== 'false';
    if (failClosed) {
      console.error('[KILL-SWITCH] Edge Config unreachable. Defaulting to PAUSED (fail-closed).');
    }
    return failClosed;
  }
}

/**
 * Calculates total portfolio value in USD based on live prices from SoDEX.
 * @param {string} userAddress - Wallet address
 * @returns {Promise<number>} Portfolio value in USD
 */
async function calculatePortfolioValue(userAddress) {
  if (userAddress) {
    try {
      const rows = await query(`SELECT balance FROM wallet_balances WHERE address = ?`, [userAddress.toLowerCase()]);
      if (rows && rows.length > 0) {
        return parseFloat(rows[0].balance);
      }
    } catch (e) {
      console.warn('Could not read from wallet_balances in calculatePortfolioValue:', e.message);
    }
  }

  const privateKey = process.env.SODEX_API_KEY_PRIVATE_KEY;
  const isMockMode = !privateKey || 
                     privateKey === 'your_api_key_private_key_returned_from_addAPIKey' ||
                     !userAddress ||
                     userAddress === 'your_evm_wallet_address_0x...';
  if (isMockMode) {
    return 10000.00;
  }
  try {
    const balances = await fetchAccountBalances(userAddress);
    let totalValue = 0;
    for (const bal of balances) {
      const free = parseFloat(bal.free || '0');
      const locked = parseFloat(bal.locked || '0');
      const totalAmt = free + locked;
      if (totalAmt <= 0) continue;

      if (bal.asset === 'USDC') {
        totalValue += totalAmt;
      } else {
        try {
          const ticker = await getTicker(`${bal.asset}-USDC`);
          const price = parseFloat(ticker.price || '0');
          totalValue += totalAmt * price;
        } catch (err) {
          console.error(`Failed to fetch price for asset ${bal.asset}:`, err);
        }
      }
    }
    return totalValue;
  } catch (err) {
    console.error('Failed to calculate portfolio value:', err);
    return 0;
  }
}

/**
 * Initiates the hourly market evaluation and trading cycle.
 * Fetches data, scores narrative regimes, detects shifts, runs risk gates, and executes orders.
 * @returns {Promise<void>}
 */
export async function checkMarketAndTrade() {
  console.log('[SYNC] Initiating hourly market evaluation cycle...');

  // 1. Recalculate temperatures and save them to narrative_history
  const temps = await updateNarrativeTemperatures();

  // 2. Run shift detection
  const shift = await detectShift(temps);
  if (!shift) {
    console.log('[SUCCESS] Market is stable. No narrative shift detected.');
    return;
  }

  const fromName = NARRATIVES[shift.from_narrative]?.name || shift.from_narrative;
  const toName = NARRATIVES[shift.to_narrative]?.name || shift.to_narrative;
  console.log(`[ALERT] Narrative shift detected! From [${fromName}] to [${toName}]`);

  try {
    await sendNarrativeAlert(shift);
  } catch (err) {
    console.error('[ERROR] Failed to send Telegram narrative shift alert:', err);
  }

  // Target token mapping based on narrative archetypes
  const NARRATIVE_TARGET_TOKENS = {
    'NAR_01': 'BTC',
    'NAR_02': 'DOGE',
    'NAR_03': 'USDC',
    'NAR_04': 'FET',
    'NAR_05': 'UNI',
    'NAR_06': 'USDC',
    'NAR_07': 'OP',
    'NAR_08': 'USDC'
  };

  const targetToken = NARRATIVE_TARGET_TOKENS[shift.to_narrative] || 'BTC';
  if (targetToken === 'USDC') {
    console.log(`Market rotated to a defensive stablecoin narrative (${toName}). No buy order triggered.`);
    return;
  }

  // 3. Fetch user wallet address and state from SoDEX
  const userAddress = process.env.USER_WALLET_ADDRESS;
  if (!userAddress) {
    console.log('[ERROR] Trading halted: USER_WALLET_ADDRESS environment variable is not defined.');
    return;
  }

  let accountState;
  try {
    accountState = await getAccountState(userAddress);
  } catch (err) {
    console.error('[ERROR] Failed to fetch SoDEX account state:', err);
    return;
  }

  // 4. Run pre-trade risk gates
  const precheck = await runPreTradeChecks(shift, accountState);

  const storyId = crypto.randomUUID();
  const shiftId = crypto.randomUUID();
  const tradeId = crypto.randomUUID();

  if (!precheck.passed) {
    console.log(`[ERROR] Trading checks failed: ${precheck.failedGates.join(', ')}. Story will be published without trade.`);

    if (precheck.failedGates.includes('DAILY_LOSS_LIMIT_EXCEEDED')) {
      try {
        await sendMessage(null, '[ALERT] Safety Check Failed: Drawdown limit reached.');
      } catch (err) {
        console.error('[ERROR] Failed to send drawdown circuit breaker alert to Telegram:', err);
      }
    }

    // Generate and publish shift story only
    let storyBody = '';
    try {
      storyBody = await createBreakingStory({
        shiftData: {
          previousNarrative: fromName,
          dominantNarrative: toName,
          confidence: shift.confidence,
          signals: JSON.parse(shift.signals)
        },
        tradeData: {
          side: 'BUY',
          pair: `${targetToken}-USDC`,
          quantity: '0.00',
          price: '0.00',
          status: `SKIPPED (${precheck.failedGates.join(', ')})`,
          orderId: 'N/A'
        },
        publishedAt: new Date().toISOString()
      });

      const isValid = await validateStory(storyBody);
      if (!isValid) {
        console.warn('[WARNING] LLM generated story failed validation checks. Falling back to structured template story.');
        storyBody = getTemplateStory(
          'breaking',
          {
            previousNarrative: fromName,
            dominantNarrative: toName,
            confidence: shift.confidence,
            signals: JSON.parse(shift.signals)
          },
          {
            side: 'BUY',
            pair: `${targetToken}-USDC`,
            quantity: '0.00',
            fillPrice: '0.00',
            status: `SKIPPED (${precheck.failedGates.join(', ')})`,
            reason: `Data Validation Failed (LLM Hallucinated) / Skips: ${precheck.failedGates.join(', ')}`
          }
        );
      }
    } catch (err) {
      console.error('Failed to generate breaking story via LLM:', err);
      storyBody = `Narrative shifted from ${fromName} to ${toName}. Trade was skipped due to risk gates: ${precheck.failedGates.join(', ')}.`;
    }

    // Insert story into database
    let title = `Regime Shift to ${toName}`;
    const lines = storyBody.split('\n');
    const firstLine = lines[0]?.trim() || '';
    if (firstLine.startsWith('#')) {
      title = firstLine.replace(/^#+\s*/, '');
    }

    await execute(
      `INSERT INTO stories (id, type, title, body, summary, narrative_state, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        storyId,
        'breaking',
        title,
        storyBody,
        `Market narrative has shifted from ${fromName} to ${toName}.`,
        JSON.stringify(temps),
        new Date().toISOString()
      ]
    );

    // Insert narrative shift record
    await execute(
      `INSERT INTO narrative_shifts (id, from_narrative, to_narrative, confidence, signals, story_id, trade_id, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shiftId,
        shift.from_narrative,
        shift.to_narrative,
        shift.confidence,
        shift.signals,
        storyId,
        null,
        new Date().toISOString()
      ]
    );
    return;
  }

  // 5. Compute position size
  const portfolioValue = await calculatePortfolioValue(userAddress);
  let usdcBal = parseFloat(accountState.balances.find(b => b.asset === 'USDC')?.free || '0');
  
  if (userAddress) {
    try {
      const rows = await query(`SELECT balance FROM wallet_balances WHERE address = ?`, [userAddress.toLowerCase()]);
      if (rows && rows.length > 0) {
        usdcBal = parseFloat(rows[0].balance);
      }
    } catch (e) {
      console.warn('Could not read from wallet_balances in checkMarketAndTrade:', e.message);
    }
  }

  const sizeUSD = calculatePositionSize(portfolioValue, usdcBal);

  if (sizeUSD < 10) {
    console.log(`[ERROR] Insufficient USDC balance on SoDEX for minimum trade ($${sizeUSD.toFixed(2)} < $10).`);
    return;
  }

  // Get current market price of target token
  let price = 0;
  try {
    const ticker = await getTicker(`${targetToken}-USDC`);
    price = parseFloat(ticker.price || '0');
  } catch (err) {
    console.error(`[ERROR] Failed to fetch ticker for ${targetToken}-USDC:`, err);
    return;
  }

  if (price <= 0) {
    console.error(`[ERROR] Invalid price for ${targetToken}-USDC: ${price}`);
    return;
  }

  const qtyDecimals = Number(process.env.QTY_DECIMALS) || 4;
  const targetQty = (sizeUSD / price).toFixed(qtyDecimals);
  console.log(`[EXECUTION] Executing trade: Buy ${targetQty} ${targetToken} on SoDEX (approx. $${sizeUSD.toFixed(2)})`);

  // Execute buy order on SoDEX
  let orderResult;
  try {
    orderResult = await placeOrder({
      pair: `${targetToken}-USDC`,
      side: 'BUY',
      orderType: 'MARKET',
      quantity: targetQty,
      price: '0.00'
    });
  } catch (err) {
    console.error('[ERROR] SoDEX order placement failed:', err);
    return;
  }

  if (orderResult && orderResult.status === 'FILLED') {
    const fillPrice = parseFloat(orderResult.price || price);
    const stopLossPrice = (fillPrice * (1 - 0.08)).toFixed(4);

    console.log(`[SUCCESS] Trade filled successfully! Order ID: ${orderResult.orderId}`);

    try {
      await sendMessage(
        null,
        `[EXECUTION] <b>[Cinder Trade Filled]</b>\n\n` +
        `<b>Asset:</b> ${targetToken}\n` +
        `<b>Side:</b> BUY\n` +
        `<b>Quantity:</b> <code>${targetQty}</code>\n` +
        `<b>Price:</b> <code>$${fillPrice.toFixed(4)}</code>\n` +
        `<b>Stop-Loss:</b> <code>$${stopLossPrice}</code>\n` +
        `<b>Order ID:</b> <code>${orderResult.orderId}</code>`
      );
    } catch (err) {
      console.error('[ERROR] Failed to send trade fill Telegram alert:', err);
    }

    // Save story to database
    let storyBody = '';
    try {
      storyBody = await createBreakingStory({
        shiftData: {
          previousNarrative: fromName,
          dominantNarrative: toName,
          confidence: shift.confidence,
          signals: JSON.parse(shift.signals)
        },
        tradeData: {
          side: 'BUY',
          pair: `${targetToken}-USDC`,
          quantity: targetQty,
          price: fillPrice.toString(),
          status: 'FILLED',
          orderId: orderResult.orderId
        },
        publishedAt: new Date().toISOString()
      });

      const isValid = await validateStory(storyBody);
      if (!isValid) {
        console.warn('[WARNING] LLM generated story failed validation checks. Falling back to structured template story.');
        storyBody = getTemplateStory(
          'breaking',
          {
            previousNarrative: fromName,
            dominantNarrative: toName,
            confidence: shift.confidence,
            signals: JSON.parse(shift.signals)
          },
          {
            side: 'BUY',
            pair: `${targetToken}-USDC`,
            quantity: targetQty,
            fillPrice: fillPrice.toString(),
            status: 'FILLED',
            reason: 'Data Validation Failed (LLM Hallucinated)'
          }
        );
      }
    } catch (err) {
      console.error('Failed to generate breaking story via LLM:', err);
      storyBody = `Narrative shifted from ${fromName} to ${toName}. Executed BUY of ${targetQty} ${targetToken} at ${fillPrice}.`;
    }

    // Insert story
    let title = `Regime Shift to ${toName}`;
    const lines = storyBody.split('\n');
    const firstLine = lines[0]?.trim() || '';
    if (firstLine.startsWith('#')) {
      title = firstLine.replace(/^#+\s*/, '');
    }

    const now = new Date().toISOString();
    await batch([
      {
        sql: `INSERT INTO stories (id, type, title, body, summary, narrative_state, published_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [storyId, 'breaking', title, storyBody, `Market narrative has shifted from ${fromName} to ${toName}.`, JSON.stringify(temps), now]
      },
      {
        sql: `INSERT INTO trades (id, shift_id, story_id, user_address, side, pair, order_type, quantity, fill_price, stop_loss_price, sodex_order_id, status, created_at, filled_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [tradeId, shiftId, storyId, userAddress.toLowerCase(), 'buy', `${targetToken}-USDC`, 'market', targetQty, fillPrice.toString(), stopLossPrice, orderResult.orderId, 'filled', now, now]
      },
      {
        sql: `INSERT INTO narrative_shifts (id, from_narrative, to_narrative, confidence, signals, story_id, trade_id, detected_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [shiftId, shift.from_narrative, shift.to_narrative, shift.confidence, shift.signals, storyId, tradeId, now]
      }
    ]);

    console.log(`[PUBLISH] Breaking story published to wire. Story ID: ${storyId}`);
  } else {
    console.log(`[ERROR] Order placement failed or remained pending. Status: ${orderResult?.status || 'UNKNOWN'}`);
    try {
      await sendMessage(
        null,
        `[ERROR] <b>[Cinder Trade Failed]</b>\n\n` +
        `<b>Asset:</b> ${targetToken}\n` +
        `<b>Side:</b> BUY\n` +
        `<b>Quantity:</b> <code>${targetQty}</code>\n` +
        `<b>Status:</b> <code>${orderResult?.status || 'UNKNOWN'}</code>`
      );
    } catch (err) {
      console.error('[ERROR] Failed to send trade failure Telegram alert:', err);
    }
  }
}

/**
 * Evaluates the 5 pre-trade risk gates (cooldown, daily loss, max positions, kill-switch, etc.).
 * @param {Object} shiftData - The detected narrative shift information
 * @param {Object} accountState - Balances and current positions from SoDEX
 * @returns {Promise<Object>} Object with a boolean `passed` and a list of `failedGates`
 */
export async function runPreTradeChecks(shiftData, accountState) {
  const failedGates = [];

  // 1. Auto-trading state gate
  const autoTradeEnabled = process.env.AUTO_TRADE_ENABLED === 'true';
  if (!autoTradeEnabled) {
    failedGates.push('AUTO_TRADE_DISABLED');
  }

  // 2. Cooldown period check (48 hours between narrative trades)
  try {
    const lastTrades = await query("SELECT created_at FROM trades WHERE side = 'buy' ORDER BY created_at DESC LIMIT 1");
    if (lastTrades && lastTrades.length > 0) {
      const lastTradeTime = parseSqliteDatetime(lastTrades[0].created_at);
      const diffMs = Date.now() - lastTradeTime;
      const cooldownHours = Number(process.env.COOLDOWN_HOURS) || 48;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      if (diffMs < cooldownMs) {
        failedGates.push('COOLDOWN_ACTIVE');
      }
    }
  } catch (err) {
    console.error('Error during cooldown pre-trade check:', err);
  }

  // 3. Max open positions gate (limit to 5)
  try {
    const buyCount = await query("SELECT COUNT(*) as count FROM trades WHERE side = 'buy' AND status = 'filled'");
    const stoppedCount = await query("SELECT COUNT(*) as count FROM trades WHERE side = 'buy' AND status = 'stopped'");
    const openCount = (buyCount[0]?.count || 0) - (stoppedCount[0]?.count || 0);
    if (openCount >= 5) {
      failedGates.push('MAX_POSITIONS_REACHED');
    }
  } catch (err) {
    console.error('Error checking open positions count:', err);
  }

  // 4. Circuit Breaker: 15% daily loss limit check
  try {
    const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentClosedTrades = await query(
      `SELECT * FROM trades 
       WHERE (status = 'stopped' OR status = 'closed')
         AND closed_at >= ?`,
      [oneDayAgoIso]
    );

    let totalLoss = 0;
    for (const t of recentClosedTrades) {
      const fill = parseFloat(t.fill_price || '0');
      const exit = parseFloat(t.stop_loss_price || t.fill_price || '0');
      const qty = parseFloat(t.quantity || '0');
      const pnl = (exit - fill) * qty; // assuming BUY entry
      if (pnl < 0) {
        totalLoss += Math.abs(pnl);
      }
    }

    const userAddress = process.env.USER_WALLET_ADDRESS;
    if (userAddress) {
      const portfolioValue = await calculatePortfolioValue(userAddress);
      if (portfolioValue <= 0) {
        failedGates.push('DAILY_LOSS_LIMIT_EXCEEDED');
      } else {
        const lossRatio = totalLoss / (portfolioValue + totalLoss);
        if (lossRatio > 0.15) {
          failedGates.push('DAILY_LOSS_LIMIT_EXCEEDED');
        }
      }
    }
  } catch (err) {
    console.error('Error checking daily loss circuit breaker:', err);
  }

  // 5. Edge Config-based kill-switch
  const killSwitch = await isKillSwitchActive();
  if (killSwitch) {
    failedGates.push('KILL_SWITCH_ACTIVE');
  }

  // 6. Environment separation safety gate
  const isStaging = process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development' || process.env.NODE_ENV !== 'production';
  const isMainnetEndpoint = (process.env.SODEX_API_BASE_URL || '').includes('mainnet');
  if (isStaging && isMainnetEndpoint) {
    failedGates.push('STAGING_ENVIRONMENT_MAINNET_URL_BLOCKED');
  }

  return {
    passed: failedGates.length === 0,
    failedGates
  };
}

/**
 * Calculates risk-adjusted trade position sizes based on capital limits and available balances.
 * @param {number} portfolioValue - Total portfolio value in USD
 * @param {number} availableBalance - Spendable USD balance
 * @returns {number} Sized trade amount in USD
 */
export function calculatePositionSize(portfolioValue, availableBalance) {
  const maxAlloc = parseFloat(process.env.MAX_ALLOCATION_PER_TRADE || '0.30');
  const targetSize = portfolioValue * maxAlloc;
  return Math.max(0, Math.min(targetSize, availableBalance));
}

/**
 * Monitors active positions on SoDEX and executes stop-losses or profit-taking.
 * Runs on a 5-minute interval.
 * @returns {Promise<void>}
 */
export async function executeStopLossMonitoring() {
  try {
    const killSwitch = await isKillSwitchActive();
    if (killSwitch) {
      console.log('[SKIP] Stop-loss monitoring skipped: kill-switch is active.');
      return;
    }

    const openTrades = await query("SELECT * FROM trades WHERE status = 'filled'");
    if (openTrades.length === 0) return;

    const stopLossPercent = parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.08');

    for (const trade of openTrades) {
      try {
        const ticker = await getTicker(trade.pair);
        const currentPrice = parseFloat(ticker.price || '0');
        if (currentPrice <= 0) continue;

        // Trailing stop loss calculation and DB update
        const calculatedStopLoss = currentPrice * (1 - stopLossPercent);
        const currentStopLoss = parseFloat(trade.stop_loss_price || '0');

        if (calculatedStopLoss > currentStopLoss) {
          await execute(
            'UPDATE trades SET stop_loss_price = ? WHERE id = ?',
            [calculatedStopLoss.toFixed(4), trade.id]
          );
          trade.stop_loss_price = calculatedStopLoss.toFixed(4);
        }

        // Trigger condition check
        if (currentPrice <= parseFloat(trade.stop_loss_price || '0')) {
          console.log(`[ALERT] Stop-loss triggered for ${trade.pair}! Price ${currentPrice} <= stop-loss ${trade.stop_loss_price}`);

          // Place sell market order
          await placeOrder({
            pair: trade.pair,
            side: 'SELL',
            orderType: 'MARKET',
            quantity: trade.quantity,
            price: '0.00'
          });

          // Mark trade as closed/stopped
          await execute(
            `UPDATE trades 
             SET status = 'stopped', 
                 closed_at = ?,
                 stop_loss_price = ? 
             WHERE id = ?`,
            [
              new Date().toISOString(),
              currentPrice.toFixed(4),
              trade.id
            ]
          );

          console.log(`[SUCCESS] Closed stopped position for trade ID ${trade.id} on SoDEX.`);

          try {
            await sendMessage(
              null,
              `[ALERT] <b>[Cinder Stop-Loss Triggered]</b>\n\n` +
              `<b>Asset/Pair:</b> ${trade.pair}\n` +
              `<b>Trigger Price:</b> <code>$${currentPrice.toFixed(4)}</code>\n` +
              `<b>Stop-Loss Level:</b> <code>$${parseFloat(trade.stop_loss_price).toFixed(4)}</code>\n` +
              `<b>Quantity Closed:</b> <code>${trade.quantity}</code>`
            );
          } catch (err) {
            console.error('[ERROR] Failed to send stop-loss trigger Telegram alert:', err);
          }
        }
      } catch (err) {
        console.error(`Error monitoring stop-loss for trade ID ${trade.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Error in executeStopLossMonitoring:', err);
  }
}

/**
 * Constructs and sends the daily digest Telegram alert.
 * @returns {Promise<boolean>} Success status
 */
export async function sendDailyDigestAlert() {
  console.log('[SYNC] Compiling daily performance and status digest for Telegram...');
  try {
    const userAddress = process.env.USER_WALLET_ADDRESS;
    if (!userAddress) {
      console.warn('[WARNING] No USER_WALLET_ADDRESS configured. Daily digest aborted.');
      return false;
    }

    const portfolioValue = await calculatePortfolioValue(userAddress);
    const balanceStr = portfolioValue.toFixed(2);

    let dailyTradesCount = 0;
    let dailyReturn = '0.00%';
    let circuitBreakerStatus = 'NOMINAL';
    const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const recentClosedTrades = await query(
        `SELECT * FROM trades 
         WHERE (status = 'stopped' OR status = 'closed')
           AND closed_at >= ?`,
        [oneDayAgoIso]
      );

      let totalLoss = 0;
      let totalGain = 0;
      for (const t of recentClosedTrades) {
        const fill = parseFloat(t.fill_price || '0');
        const exit = parseFloat(t.stop_loss_price || t.fill_price || '0');
        const qty = parseFloat(t.quantity || '0');
        const pnl = (exit - fill) * qty;
        if (pnl < 0) {
          totalLoss += Math.abs(pnl);
        } else {
          totalGain += pnl;
        }
      }

      const totalPnL = totalGain - totalLoss;
      if (portfolioValue > 0) {
        const pnlPct = (totalPnL / portfolioValue) * 100;
        dailyReturn = `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;

        const lossRatio = totalLoss / (portfolioValue + totalLoss);
        if (lossRatio > 0.15) {
          circuitBreakerStatus = 'TRIPPED';
        }
      }

      const recentTrades = await query(
        `SELECT COUNT(*) as count FROM trades WHERE created_at >= ?`,
        [oneDayAgoIso]
      );
      dailyTradesCount = recentTrades[0]?.count || 0;
    } catch (err) {
      console.error('Error querying trade statistics for daily digest:', err);
    }

    let activeStopLossesCount = 0;
    try {
      const openTrades = await query("SELECT COUNT(*) as count FROM trades WHERE status = 'filled'");
      activeStopLossesCount = openTrades[0]?.count || 0;
    } catch (err) {
      console.error('Error counting open trades for daily digest:', err);
    }

    const autoTradeEnabled = process.env.AUTO_TRADE_ENABLED === 'true';

    // Build positions list
    let positions = [];
    const sodexApiKey = process.env.SODEX_API_KEY_NAME;
    const isMockMode = !sodexApiKey || sodexApiKey === 'your_api_key_name';

    if (!isMockMode) {
      try {
        const state = await getAccountState(userAddress);
        const nonCash = state.balances.filter(b => b.asset !== 'USDC' && b.asset !== 'USDT' && parseFloat(b.amount) > 0);
        positions = await Promise.all(nonCash.map(async b => {
          let entryPrice = '0.00';
          let currentPrice = '0.00';
          try {
            const ticker = await getTicker(`${b.asset}-USDC`);
            currentPrice = ticker.price || '0.00';
          } catch (e) {
            console.warn(`Could not fetch ticker for ${b.asset}-USDC for daily digest:`, e.message);
          }

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
            stopLoss: (entPriceNum * 0.92).toFixed(2)
          };
        }));
      } catch (err) {
        console.error('SoDEX API state fetch failed for daily digest, falling back to database positions:', err.message);
      }
    }

    if (positions.length === 0) {
      const dbTrades = await query("SELECT * FROM trades WHERE status = 'filled'");
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

          const lastBuy = await query(`
            SELECT stop_loss_price FROM trades 
            WHERE pair = ? AND side = 'buy' AND status = 'filled' 
            ORDER BY created_at DESC LIMIT 1
          `, [`${asset}-USDC`]);
          
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
    }

    const portfolioSummary = {
      balance: balanceStr,
      dailyReturn,
      dailyTradesCount,
      circuitBreakerStatus,
      autoTradeEnabled,
      activeStopLossesCount,
      positions
    };

    return await sendDailyDigest(portfolioSummary);
  } catch (error) {
    console.error('Error in sendDailyDigestAlert:', error);
    return false;
  }
}
