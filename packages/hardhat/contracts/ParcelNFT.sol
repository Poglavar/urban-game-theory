// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ParcelNFT is ERC721URIStorage, Ownable {
    struct Parcel {
        string coordinates; // OpenStreetMap coordinates
        string buildingId; // OpenStreetMap building ID
        uint256 area; // Area in square meters
    }

    mapping(uint256 => Parcel) public parcels;
    uint256 private _tokenIdCounter;

    constructor() ERC721("Urban Game Theory Parcel", "UGTP") Ownable(msg.sender) {}

    function mint(address to, string memory coordinates, string memory buildingId, uint256 area)
        public
        onlyOwner
        returns (uint256)
    {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _safeMint(to, tokenId);
        parcels[tokenId] = Parcel(coordinates, buildingId, area);

        return tokenId;
    }

    function getParcel(uint256 tokenId) public view returns (Parcel memory) {
        require(_ownerOf(tokenId) != address(0), "ParcelNFT: Parcel does not exist");
        return parcels[tokenId];
    }
}
