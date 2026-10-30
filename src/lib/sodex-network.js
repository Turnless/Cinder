/**
 * Which SoDEX network this deployment trades on, chosen once per deployment with
 * NEXT_PUBLIC_SODEX_NETWORK ('testnet' or 'mainnet'). Anything else falls back to testnet,
 * so a typo can never send real orders.
 */

const NETWORKS = {
  testnet: {
    name: 'testnet',
    label: 'SoDEX testnet',
    chainId: 138565,
    gateway: 'https://testnet-gw.sodex.dev',
    appUrl: 'https://testnet.sodex.com',
    isMainnet: false
  },
  mainnet: {
    name: 'mainnet',
    label: 'SoDEX mainnet',
    chainId: 286623,
    gateway: 'https://mainnet-gw.sodex.dev',
    appUrl: 'https://sodex.com',
    isMainnet: true
  }
};

/**
 * @param {string} [value] - Network name; defaults to NEXT_PUBLIC_SODEX_NETWORK
 * @returns {{name: string, label: string, chainId: number, gateway: string, appUrl: string,
 *   isMainnet: boolean, publicBase: string, spotBase: string}}
 */
export function getSodexNetwork(value = process.env.NEXT_PUBLIC_SODEX_NETWORK) {
  const network = NETWORKS[String(value || '').trim().toLowerCase()] || NETWORKS.testnet;
  return {
    ...network,
    publicBase: `${network.gateway}/api/v1`,
    spotBase: `${network.gateway}/api/v1/spot`
  };
}

/**
 * Cinder's builder settings: the SoDEX account that receives builder fees and the rate
 * requested on each order, in tenths of a basis point (50 = 0.05%).
 * @returns {{id: number, fee: number, maxFee: number} | null} null when no builder is configured
 */
export function getBuilderConfig(
  id = process.env.NEXT_PUBLIC_SODEX_BUILDER_ID,
  fee = process.env.NEXT_PUBLIC_SODEX_BUILDER_FEE
) {
  const builderId = Number(id);
  const feeRate = Number(fee);
  if (!Number.isSafeInteger(builderId) || builderId <= 0) return null;
  if (!Number.isInteger(feeRate) || feeRate < 0 || feeRate > 2000) return null;
  // The user approves exactly the rate Cinder asks for, so the approval can't be used to charge more
  return { id: builderId, fee: feeRate, maxFee: feeRate };
}
