// Deploys a NEW CinderToken. The app currently uses the existing deployment
// (0x6C64923FD6478D265A1b5a971c6bC59cB35A5FA7); pointing it at a new address starts
// every balance from zero and needs the treasury refunded.
//
// Usage (from contracts/):
//   npx hardhat vars set DEPLOYER_PRIVATE_KEY
//   npm run deploy:arbitrum-sepolia
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying CinderToken from ${deployer.address} to ${hre.network.name}...`);

  const token = await hre.ethers.deployContract('CinderToken');
  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log(`CinderToken deployed at ${address}`);
  console.log('To use it, set NEXT_PUBLIC_CNDR_TOKEN_ADDRESS to this address in Vercel and redeploy the app.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
