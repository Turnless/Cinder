import { query } from './db.js';

/**
 * Validates that all ETF flow and sector performance numbers cited in the story body
 * match actual records in the database.
 * @param {string} storyBody - The markdown body of the story
 * @returns {Promise<boolean>} True if all cited numbers match actual values, false otherwise
 */
export async function validateStory(storyBody) {
  if (!storyBody) return true;

  let flows = [];
  let sectors = [];
  try {
    flows = await query('SELECT net_flow, asset FROM etf_flows ORDER BY fetched_at DESC LIMIT 50');
    sectors = await query('SELECT performance_7d, performance_30d, sector FROM sector_data ORDER BY fetched_at DESC LIMIT 50');
  } catch (err) {
    console.error('[ERROR] Database query failed during story validation:', err.message);
    return false;
  }

  // Create sets of valid numbers (as strings and numbers) to cross-reference
  const validFlows = new Set();
  const validPercentages = new Set();

  for (const f of flows) {
    const valInMillions = f.net_flow / 1e6;
    validFlows.add(valInMillions);
    validFlows.add(Math.abs(valInMillions));
    validFlows.add(Math.round(valInMillions));
    validFlows.add(Math.round(Math.abs(valInMillions)));
  }

  for (const s of sectors) {
    if (s.performance_7d !== null) {
      const p7 = s.performance_7d * 100;
      validPercentages.add(p7);
      validPercentages.add(parseFloat(p7.toFixed(2)));
      validPercentages.add(parseFloat(p7.toFixed(1)));
      validPercentages.add(Math.round(p7));
    }
    if (s.performance_30d !== null) {
      const p30 = s.performance_30d * 100;
      validPercentages.add(p30);
      validPercentages.add(parseFloat(p30.toFixed(2)));
      validPercentages.add(parseFloat(p30.toFixed(1)));
      validPercentages.add(Math.round(p30));
    }
  }

  // 2. Extract citations from storyBody
  // The engine's own risk parameters are facts, not data citations, so stories may quote them
  const riskPercentages = [
    parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.08') * 100,
    parseFloat(process.env.MAX_ALLOCATION_PER_TRADE || '0.30') * 100,
    15, // daily loss circuit breaker
    parseFloat(process.env.NARRATIVE_TRADE_THRESHOLD || '80')
  ];
  for (const p of riskPercentages) {
    if (Number.isFinite(p)) validPercentages.add(p);
  }

  // Extract dollar amounts like $250M, 250M, 250 million, -$50M
  // (word boundary keeps "30 minutes" or "3 months" from reading as flows)
  const flowRegex = /([+-]?\d+(?:\.\d+)?)\s*(?:M|million)\b/gi;
  let match;
  while ((match = flowRegex.exec(storyBody)) !== null) {
    const val = parseFloat(match[1]);
    const valAbs = Math.abs(val);
    const hasMatch = Array.from(validFlows).some(vf => 
      Math.abs(vf - val) < 0.01 || Math.abs(vf - valAbs) < 0.01 || Math.abs(Math.round(vf) - Math.round(val)) === 0
    );
    if (!hasMatch) {
      console.warn(`[WARNING] Story validation failed: Hallucinated ETF flow value "${match[0]}" (${val}) found in story.`);
      return false;
    }
  }

  // Extract percentage values like 11.25%, -5.00%, 11%, 5%
  const percentRegex = /([+-]?\d+(?:\.\d+)?)\s*%/g;
  while ((match = percentRegex.exec(storyBody)) !== null) {
    const val = parseFloat(match[1]);
    const valAbs = Math.abs(val);
    
    // Ignore confidence percentages (usually >= 80%) or temperatures (e.g. 80%)
    // Look on both sides: "confidence of 92%" and "92% confidence" are both common phrasings
    const index = match.index;
    const context = storyBody.slice(Math.max(0, index - 30), index + match[0].length + 20).toLowerCase();
    if (context.includes('confidence') || context.includes('probability') || context.includes('confidence level')) {
      continue;
    }

    const hasMatch = Array.from(validPercentages).some(vp => 
      Math.abs(vp - val) < 0.01 || Math.abs(vp - valAbs) < 0.01 || Math.abs(Math.round(vp) - Math.round(val)) === 0
    );
    if (!hasMatch) {
      console.warn(`[WARNING] Story validation failed: Hallucinated sector performance value "${match[0]}" (${val}) found in story.`);
      return false;
    }
  }

  return true;
}

/**
 * Returns a fallback structured template story to preserve data fidelity.
 */
export function getTemplateStory(type, shiftData, tradeData) {
  const fromName = shiftData?.previousNarrative || 'N/A';
  const toName = shiftData?.dominantNarrative || 'N/A';
  const confidence = shiftData?.confidence || '0';
  const pair = tradeData?.pair || 'N/A';
  const side = tradeData?.side || 'N/A';
  const quantity = tradeData?.quantity || 'N/A';
  const fillPrice = tradeData?.fillPrice || 'N/A';
  const reason = tradeData?.reason || 'None';

  return `# Narrative Shift Alert: Transition to ${toName}\n\n` +
    `Cinder has detected a narrative shift from [${fromName}] to [${toName}] with ${confidence}% confidence.\n\n` +
    `Supporting evidence:\n` +
    `${Array.isArray(shiftData?.signals) ? shiftData.signals.map(s => `- ${s}`).join('\n') : shiftData?.signals || 'None'}\n\n` +
    `Trade Execution Details:\n` +
    `- Side: ${side}\n` +
    `- Pair: ${pair}\n` +
    `- Quantity: ${quantity}\n` +
    `- Price: ${fillPrice}\n` +
    `- Reason/Status: ${reason || tradeData?.status || 'SKIPPED'}\n\n` +
    `This template story has been generated automatically to preserve data fidelity after the AI generation failed validation checks.`;
}
