import { NextResponse } from 'next/server';
import { query, execute, initializeDb } from '../../../lib/db';
import { getAccountState, placeOrder, getTicker } from '../../../lib/sodex';
import { ethers } from 'ethers';

export const dynamic = 'force-dynamic';

let dbInitialized = false;

/**
 * GET /api/trade
 * Retrieves SoDEX account state, open positions, and executed trade logs.
 */
export async function GET(request) {
  try {
    if (!dbInitialized) {
      await initializeDb();
      dbInitialized = true;
    }
  } catch (initErr) {
    console.warn('[WARNING] DB initialization error:', initErr.message);
  }
  try {
    const { searchParams } = new URL(request.url);
    const paramAddress = searchParams.get('address');
    const paramBalance = searchParams.get('balance');
    const paramTicker = searchParams.get('ticker');
    const paramMasterAddress = searchParams.get('masterAddress');

    if (paramMasterAddress) {
      const userAddress = process.env.USER_WALLET_ADDRESS || "0xa7c0689b9d40f12098b02512a945e928478dd38e";
      return NextResponse.json({ success: true, masterAddress: userAddress });
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
        let mockPrice = '1.00';
        if (paramTicker.startsWith('BTC')) mockPrice = '64850.00';
        else if (paramTicker.startsWith('ETH')) mockPrice = '3210.00';
        else if (paramTicker.startsWith('SOL')) mockPrice = '145.50';
        else if (paramTicker.startsWith('UNI')) mockPrice = '7.50';
        else if (paramTicker.startsWith('AAVE')) mockPrice = '88.20';
        return NextResponse.json({ success: true, price: mockPrice, isMock: true });
      }
    }

    let balance = '10000.00';
    let positions = [];
    
    const userAddress = paramAddress || process.env.USER_WALLET_ADDRESS;

    if (userAddress) {
      const tokenAddress = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
      if (tokenAddress && tokenAddress !== '0x...' && tokenAddress !== '') {
        try {
          const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
          const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
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
        const dbTrades = await query("SELECT * FROM trades WHERE status = 'filled' AND user_address = ?", [userAddrLower]);
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
        "SELECT side, quantity, fill_price FROM trades WHERE user_address = ? AND status = 'filled' ORDER BY created_at ASC",
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
      riskConfig: {
        autoTradeEnabled: process.env.AUTO_TRADE_ENABLED === 'true',
        cooldownHours: parseInt(process.env.COOLDOWN_HOURS || '48'),
        maxAllocation: parseFloat(process.env.MAX_ALLOCATION_PER_TRADE || '0.30'),
        stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.08'),
        threshold: parseInt(process.env.NARRATIVE_TRADE_THRESHOLD || '80')
      }
    });
  } catch (error) {
    console.error('Error fetching trade details in API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/trade
 * Executes a manual trade override or triggers an evaluation of narrative shifts.
 * Must enforce server-side risk config checks.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { pair, side, orderType, quantity, price, stopLossPrice, clientWallet, signature, nonce } = body;

    // Auth: accept internal API secret (for scheduler) OR wallet signature (for client QuickTrade)
    const apiSecret = request.headers.get('x-internal-api-secret');
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    const hasInternalAuth = expectedSecret && apiSecret && apiSecret === expectedSecret;

    if (!hasInternalAuth) {
      // Fall back to wallet signature verification for client-side trades
      if (!clientWallet || !signature || signature === '0x') {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: provide x-internal-api-secret header or wallet signature' },
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
        const clientNonce = nonce || Date.now();
        const recoveredAddress = ethers.utils.verifyTypedData(domain, types, { payloadHash, nonce: clientNonce }, signature);
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

    const tradeId = 'tr_' + Math.random().toString(36).substr(2, 9);
    let sodexOrderId = null;
    let status = 'PENDING';
    let fillPrice = price || '0.0';

    // Call SoDEX API
    try {
      const orderParams = {
        pair,
        side,
        orderType,
        quantity,
        price: price || '0.0',
        stopPrice: stopLossPrice || '0.0'
      };

      const userAddress = process.env.USER_WALLET_ADDRESS;
      const sodexApiKey = process.env.SODEX_API_KEY_NAME;
      
      const isMockMode = !userAddress || 
                         userAddress === 'your_evm_wallet_address_0x...' || 
                         !sodexApiKey || 
                         sodexApiKey === 'your_api_key_name';

      if (isMockMode) {
        // Mock successful execution
        sodexOrderId = 'ord_mock_' + Math.random().toString(36).substr(2, 9);
        status = 'FILLED';
        if (!price || parseFloat(price) === 0) {
          fillPrice = pair.startsWith('BTC') ? '64850.00' : '3210.00';
        }
      } else {
        try {
          const sodexRes = await placeOrder(orderParams);
          sodexOrderId = sodexRes.orderId;
          status = sodexRes.status || 'FILLED';
          fillPrice = sodexRes.fillPrice || price || '0.0';
        } catch (placeErr) {
          console.warn('[WARNING] SoDEX live order placement failed, falling back to simulated execution:', placeErr.message);
          sodexOrderId = 'ord_sim_' + Math.random().toString(36).substr(2, 9);
          status = 'FILLED';
          if (!price || parseFloat(price) === 0) {
            fillPrice = pair.startsWith('BTC') ? '64850.00' : '3210.00';
          }
        }
      }
    } catch (err) {
      console.error('SoDEX execution failed:', err.message);
      return NextResponse.json({ success: false, error: `SoDEX exchange execution failed: ${err.message}` }, { status: 500 });
    }

    // Auto-calculate stop-loss if not explicitly set (use default SL logic)
    let finalStopLossPrice = stopLossPrice;
    if (!finalStopLossPrice && side.toLowerCase() === 'buy') {
      const stopLossPercent = parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.08');
      finalStopLossPrice = (parseFloat(fillPrice) * (1 - stopLossPercent)).toFixed(4);
    }

    // Update wallet balance for local/simulated and database consistency
    const activeAddress = clientWallet || process.env.USER_WALLET_ADDRESS;
    if (activeAddress) {
      try {
        let currentBalance = 10000.00;
        const rows = await query('SELECT balance FROM wallet_balances WHERE address = ?', [activeAddress.toLowerCase()]);
        if (rows && rows.length > 0) {
          currentBalance = parseFloat(rows[0].balance || '0');
        }
        
        const cost = parseFloat(quantity) * parseFloat(fillPrice);
        let newBalance = currentBalance;
        if (side.toLowerCase() === 'buy') {
          newBalance = currentBalance - cost;
        } else if (side.toLowerCase() === 'sell') {
          newBalance = currentBalance + cost;
        }
        
        await execute(`
          INSERT INTO wallet_balances (address, balance, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(address) DO UPDATE SET
            balance = excluded.balance,
            updated_at = excluded.updated_at
        `, [activeAddress.toLowerCase(), newBalance.toFixed(2)]);
      } catch (balErr) {
        console.error('[ERROR] Failed to update balance in database:', balErr.message);
      }
    }
    // If it's a SELL, the server master wallet transfers CNDR back to the client's wallet
    if (side.toLowerCase() === 'sell' && activeAddress) {
      const tokenAddress = process.env.NEXT_PUBLIC_CNDR_TOKEN_ADDRESS;
      const privateKey = process.env.SODEX_API_KEY_PRIVATE_KEY;
      if (tokenAddress && tokenAddress !== '0x...' && tokenAddress !== '' && privateKey && privateKey !== 'your_api_key_private_key') {
        try {
          console.log('[INFO] Executing server-side CNDR payout on SELL...');
          const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
          const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
          const serverWallet = new ethers.Wallet(privateKey, provider);
          
          const tokenAbi = ["function transfer(address to, uint256 amount) returns (bool)"];
          const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, serverWallet);
          
          const cost = parseFloat(quantity) * parseFloat(fillPrice);
          const tx = await tokenContract.transfer(activeAddress, ethers.utils.parseUnits(cost.toFixed(6), 18));
          console.log('[INFO] CNDR payout transaction sent:', tx.hash);
          await tx.wait();
          console.log('[SUCCESS] CNDR payout transaction settled!');
        } catch (sellTxErr) {
          console.warn('[WARNING] Failed to execute server-side CNDR transfer payout (likely RPC or network offline):', sellTxErr.message);
          // Do not fail the API call if we are offline or RPC is down, fall back to database settlement
        }
      }
    }
    // Insert trade into database
    await execute(`
      INSERT INTO trades (id, user_address, side, pair, order_type, quantity, fill_price, stop_loss_price, sodex_order_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      tradeId || '',
      (activeAddress || '').toLowerCase(),
      side || '',
      pair || '',
      orderType || '',
      quantity ? String(quantity) : '0.0',
      fillPrice ? String(fillPrice) : '0.0',
      finalStopLossPrice ? String(finalStopLossPrice) : null,
      sodexOrderId || null,
      status ? status.toLowerCase() : 'filled'
    ]);

    return NextResponse.json({
      success: true,
      tradeId,
      sodexOrderId,
      status: status,
      fillPrice
    });
  } catch (error) {
    console.error('Error in POST /api/trade:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
