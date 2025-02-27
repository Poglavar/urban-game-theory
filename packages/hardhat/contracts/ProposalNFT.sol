// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ParcelNFT.sol";

contract ProposalNFT is ERC721, Ownable {
    struct Proposal {
        string[] parcelIds;
        bool isConditional;
        string imageURI;
        bool isActive;
    }

    ParcelNFT public parcelNFT;
    mapping(uint256 => Proposal) public proposals;
    uint256 private _tokenIdCounter;

    constructor(address _parcelNFTAddress) ERC721("Urban Game Theory Proposal", "UGTR") Ownable(msg.sender) {
        parcelNFT = ParcelNFT(_parcelNFTAddress);
    }

    function mint(
        address to,
        string[] memory parcelIds,
        bool isConditional,
        string memory imageURI
    ) public onlyOwner returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _safeMint(to, tokenId);
        proposals[tokenId] = Proposal(parcelIds, isConditional, imageURI, true);

        return tokenId;
    }

    function getProposal(uint256 proposalId) public view returns (Proposal memory) {
        require(_ownerOf(proposalId) != address(0), "ProposalNFT: Proposal does not exist");
        return proposals[proposalId];
    }

    function setActive(uint256 tokenId, bool active) public {
        require(_ownerOf(tokenId) != address(0), "ProposalNFT: Proposal does not exist");
        require(msg.sender == ownerOf(tokenId), "ProposalNFT: Not the owner");
        proposals[tokenId].isActive = active;
    }
}
