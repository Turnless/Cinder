// Named without ".test" on purpose: Vitest (the app's test runner) would otherwise try to run it.
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const CNDR = (amount) => ethers.parseUnits(String(amount), 18);
const INITIAL_SUPPLY = CNDR(10_000_000);
const FAUCET_AMOUNT = CNDR(10_000);

describe('CinderToken', function () {
  let token;
  let owner;
  let alice;
  let bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract('CinderToken');
  });

  describe('deployment', function () {
    it('has the expected metadata', async function () {
      expect(await token.name()).to.equal('Cinder Token');
      expect(await token.symbol()).to.equal('CNDR');
      expect(await token.decimals()).to.equal(18);
    });

    it('mints the 10M initial supply to the deployer, who becomes owner', async function () {
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
      expect(await token.owner()).to.equal(owner.address);
    });
  });

  describe('transfer', function () {
    it('moves tokens and emits Transfer', async function () {
      await expect(token.transfer(alice.address, CNDR(100)))
        .to.emit(token, 'Transfer')
        .withArgs(owner.address, alice.address, CNDR(100));
      expect(await token.balanceOf(alice.address)).to.equal(CNDR(100));
    });

    it('reverts when the balance is too low', async function () {
      await expect(token.connect(alice).transfer(bob.address, 1))
        .to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });

    it('reverts when sending to the zero address', async function () {
      await expect(token.transfer(ethers.ZeroAddress, 1))
        .to.be.revertedWith('ERC20: transfer to the zero address');
    });
  });

  describe('approve and transferFrom', function () {
    it('spends the allowance', async function () {
      await token.approve(alice.address, CNDR(50));
      await token.connect(alice).transferFrom(owner.address, bob.address, CNDR(20));

      expect(await token.balanceOf(bob.address)).to.equal(CNDR(20));
      expect(await token.allowance(owner.address, alice.address)).to.equal(CNDR(30));
    });

    it('does not reduce an unlimited allowance', async function () {
      await token.approve(alice.address, ethers.MaxUint256);
      await token.connect(alice).transferFrom(owner.address, bob.address, CNDR(20));

      expect(await token.allowance(owner.address, alice.address)).to.equal(ethers.MaxUint256);
    });

    it('reverts when spending more than allowed', async function () {
      await token.approve(alice.address, CNDR(10));
      await expect(token.connect(alice).transferFrom(owner.address, bob.address, CNDR(11)))
        .to.be.revertedWith('ERC20: insufficient allowance');
    });
  });

  describe('faucet', function () {
    it('gives 10,000 CNDR and grows the supply', async function () {
      await expect(token.connect(alice).claimFaucet())
        .to.emit(token, 'FaucetClaimed')
        .withArgs(alice.address, FAUCET_AMOUNT)
        .and.to.emit(token, 'Transfer')
        .withArgs(ethers.ZeroAddress, alice.address, FAUCET_AMOUNT);

      expect(await token.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + FAUCET_AMOUNT);
    });

    it('refuses a second claim within 24 hours', async function () {
      await token.connect(alice).claimFaucet();
      await time.increase(23 * 60 * 60);

      await expect(token.connect(alice).claimFaucet())
        .to.be.revertedWith('Faucet: Cooldown active. Try again tomorrow.');
    });

    it('allows another claim after 24 hours', async function () {
      await token.connect(alice).claimFaucet();
      await time.increase(24 * 60 * 60);
      await token.connect(alice).claimFaucet();

      expect(await token.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT * 2n);
    });

    it('tracks the cooldown per wallet', async function () {
      await token.connect(alice).claimFaucet();
      await token.connect(bob).claimFaucet();

      expect(await token.balanceOf(bob.address)).to.equal(FAUCET_AMOUNT);
    });
  });

  describe('mint', function () {
    it('lets the owner mint', async function () {
      await token.mint(alice.address, CNDR(5));
      expect(await token.balanceOf(alice.address)).to.equal(CNDR(5));
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + CNDR(5));
    });

    it('rejects anyone else', async function () {
      await expect(token.connect(alice).mint(alice.address, CNDR(5)))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
