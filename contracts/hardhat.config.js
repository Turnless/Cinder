require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const { vars } = require('hardhat/config');

// Deployment credentials are Hardhat configuration variables, stored outside the repo:
//   npx hardhat vars set DEPLOYER_PRIVATE_KEY
//   npx hardhat vars set ARBITRUM_SEPOLIA_RPC_URL   (optional, defaults to the public RPC)
const networks = {};
if (vars.has('DEPLOYER_PRIVATE_KEY')) {
  networks.arbitrumSepolia = {
    url: vars.get('ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc'),
    chainId: 421614,
    accounts: [vars.get('DEPLOYER_PRIVATE_KEY')]
  };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.24',
  paths: {
    sources: './src'
  },
  networks
};
