/**
 * Risk settings as configured through environment variables, in the shape the UI displays.
 * @returns {{autoTradeEnabled: boolean, cooldownHours: number, maxAllocation: number, stopLossPercentage: number, threshold: number}}
 */
export function getRiskConfig() {
  return {
    autoTradeEnabled: process.env.AUTO_TRADE_ENABLED === 'true',
    cooldownHours: parseInt(process.env.COOLDOWN_HOURS || '48'),
    maxAllocation: parseFloat(process.env.MAX_ALLOCATION_PER_TRADE || '0.30'),
    stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.08'),
    threshold: parseInt(process.env.NARRATIVE_TRADE_THRESHOLD || '80')
  };
}
