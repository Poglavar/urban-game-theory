// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CityMemeToken is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10 ** 18; // 1 billion tokens with 18 decimals

    constructor() ERC20("Zagreb Meme Token", "ZAGREB") Ownable(msg.sender) {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
