/**
 * Verification test for Cinder Trade Engine Risk Gates and Sizing.
 * Simulates risk gate checks and position sizing rules.
 */

import { runPreTradeChecks, calculatePositionSize } from '../src/engine/trade-engine.js';
import { execute, query } from '../src/lib/db.js';

async function runTest() {
  console.log('🧪 Starting Trade Engine unit and validation tests...');

  // Test 1: Sizing Calculation
  console.log('\n📊 1. Position Sizing Calculation:');
  const size1 = calculatePositionSize(10000, 5000); // 30% of 10000 is 3000, capped by 5000 -> 3000
  const size2 = calculatePositionSize(10000, 1000); // 30% of 10000 is 3000, capped by 1000 -> 1000
  console.log(`   - Portfolio $10,000, Available USDC $5,000. Sized Position: $${size1} (Expected: $3000)`);
  console.log(`   - Portfolio $10,000, Available USDC $1,000. Sized Position: $${size2} (Expected: $1000)`);

  if (size1 !== 3000 || size2 !== 1000) {
    console.error('❌ Position sizing logic failure!');
    process.exit(1);
  }
  console.log('✅ Position sizing logic verified successfully.');

  // Test 2: Pre-trade Checks (Auto-trading deactivated)
  console.log('\n🛡️ 2. Evaluating Pre-trade Checks under inactive auto-trading:');
  process.env.AUTO_TRADE_ENABLED = 'false';
  process.env.COOLDOWN_HOURS = '48';
  process.env.STOP_LOSS_PERCENTAGE = '0.08';
  process.env.MAX_ALLOCATION_PER_TRADE = '0.30';

  const mockAccountState = {
    balances: [
      { asset: 'USDC', free: '1000.00', locked: '0.00' }
    ]
  };

  const checks = await runPreTradeChecks({}, mockAccountState);
  console.log('   Failed Gates List:', checks.failedGates);

  if (!checks.failedGates.includes('AUTO_TRADE_DISABLED')) {
    console.error('❌ Failed to flag inactive auto-trading gate!');
    process.exit(1);
  }
  console.log('✅ Risk gates correctly blocked trade when AUTO_TRADE_ENABLED is false.');

  console.log('\n🎉 All trade engine tests completed successfully!');
}

runTest();
