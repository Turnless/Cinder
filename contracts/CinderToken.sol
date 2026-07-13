// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev OpenZeppelin Contracts v4.9.0 (Standard ERC20 implementation)
 * Miniaturized standard implementation to allow clean copy-paste without external file dependencies.
 */
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract CinderToken is IERC20 {
    string public name = "Cinder Token";
    string public symbol = "CNDR";
    uint8 public decimals = 18;
    uint256 public override totalSupply = 10000000 * 10**18; // 10 Million initial supply

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    address public owner;
    uint256 public constant FAUCET_AMOUNT = 1000 * 10**18; // 1,000 CNDR
    uint256 public constant COOLDOWN_TIME = 1 days;
    mapping(address => uint256) public lastClaimed;

    event FaucetClaimed(address indexed beneficiary, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        _balances[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address from, address spender) public view override returns (uint256) {
        return _allowances[from][spender];
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
        return true;
    }

    /**
     * @dev Public faucet to claim 1,000 test CNDR tokens once a day.
     */
    function claimFaucet() external {
        require(
            block.timestamp >= lastClaimed[msg.sender] + COOLDOWN_TIME,
            "Faucet: Cooldown active. Try again tomorrow."
        );
        
        lastClaimed[msg.sender] = block.timestamp;
        _balances[msg.sender] += FAUCET_AMOUNT;
        totalSupply += FAUCET_AMOUNT;
        
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
        emit Transfer(address(0), msg.sender, FAUCET_AMOUNT);
    }

    /**
     * @dev Owner can mint additional tokens if needed for liquidity.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _balances[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(_balances[from] >= amount, "ERC20: transfer amount exceeds balance");

        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address ownerAccount, address spender, uint256 amount) internal {
        require(ownerAccount != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[ownerAccount][spender] = amount;
        emit Approval(ownerAccount, spender, amount);
    }

    function _spendAllowance(address ownerAccount, address spender, uint256 amount) internal {
        uint256 currentAllowance = allowance(ownerAccount, spender);
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            _approve(ownerAccount, spender, currentAllowance - amount);
        }
    }
}
