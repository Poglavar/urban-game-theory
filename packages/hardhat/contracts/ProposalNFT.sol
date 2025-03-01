// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ParcelNFT.sol";

contract ProposalNFT is ERC721Enumerable, Ownable {
    struct Proposal {
        string[] parcelIds;
        bool isConditional;
        string imageURI;
        bool isActive;
        uint256 ethBalance;
        uint256 tokenBalance;
        mapping(string => bool) hasAccepted;
        uint256 acceptanceCount;
    }

    ParcelNFT public parcelNFT;
    IERC20 public cityToken;
    IERC20 public usdcToken;
    mapping(uint256 => Proposal) public proposals;
    uint256 private _tokenIdCounter;

    event ProposalAccepted(uint256 indexed proposalId, string parcelId, address owner);
    event FundsDeposited(uint256 indexed proposalId, uint256 ethAmount, uint256 tokenAmount);
    event FundsDistributed(uint256 indexed proposalId, uint256 ethAmount, uint256 tokenAmount);

    constructor(address _parcelNFTAddress, address _cityTokenAddress)
        ERC721("Urban Game Theory Proposal", "UGTR")
        Ownable(msg.sender)
    {
        parcelNFT = ParcelNFT(_parcelNFTAddress);
        cityToken = IERC20(_cityTokenAddress);
    }

    function mintAndFund(
        address to,
        string[] memory parcelIds,
        bool isConditional,
        string memory imageURI,
        uint256 ethAmount,
        uint256 tokenAmount
    ) public payable returns (uint256) {
        require(parcelIds.length > 0, "ProposalNFT: Must include at least one parcel");

        if (ethAmount > 0) {
            require(msg.value == ethAmount, "ProposalNFT: ETH amount mismatch");
        }
        if (tokenAmount > 0) {
            require(
                cityToken.allowance(msg.sender, address(this)) >= tokenAmount,
                "ProposalNFT: Token allowance insufficient"
            );
            require(
                cityToken.transferFrom(msg.sender, address(this), tokenAmount), "ProposalNFT: Token transfer failed"
            );
        }

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _safeMint(to, tokenId);

        Proposal storage newProposal = proposals[tokenId];
        newProposal.parcelIds = parcelIds;
        newProposal.isConditional = isConditional;
        newProposal.imageURI = imageURI;
        newProposal.isActive = true;
        newProposal.ethBalance = ethAmount;
        newProposal.tokenBalance = tokenAmount;
        newProposal.acceptanceCount = 0;

        return tokenId;
    }

    function acceptProposal(uint256 proposalId, string memory parcelId) public {
        require(_ownerOf(proposalId) != address(0), "ProposalNFT: Proposal does not exist");
        require(proposals[proposalId].isActive, "ProposalNFT: Proposal is not active");

        // Verify parcel is part of the proposal
        bool isValidParcel = false;
        for (uint256 i = 0; i < proposals[proposalId].parcelIds.length; i++) {
            if (keccak256(bytes(proposals[proposalId].parcelIds[i])) == keccak256(bytes(parcelId))) {
                isValidParcel = true;
                break;
            }
        }
        require(isValidParcel, "ProposalNFT: Parcel not part of proposal");

        // Convert parcelId string to uint256 using proper string parsing
        uint256 parcelTokenId = stringToUint(parcelId);

        // Verify caller owns the parcel
        require(parcelNFT.ownerOf(parcelTokenId) == msg.sender, "ProposalNFT: Not parcel owner");

        // Check if parcel hasn't already accepted
        require(!proposals[proposalId].hasAccepted[parcelId], "ProposalNFT: Parcel already accepted");

        // Record acceptance
        proposals[proposalId].hasAccepted[parcelId] = true;
        proposals[proposalId].acceptanceCount++;

        emit ProposalAccepted(proposalId, parcelId, msg.sender);
    }

    // Helper function to convert string to uint256
    function stringToUint(string memory s) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 result = 0;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
        return result;
    }

    function depositFunds(uint256 proposalId) public payable {
        require(_ownerOf(proposalId) != address(0), "ProposalNFT: Proposal does not exist");
        require(proposals[proposalId].isActive, "ProposalNFT: Proposal is not active");
        require(msg.sender == ownerOf(proposalId), "ProposalNFT: Not proposal owner");

        uint256 tokenAmount = cityToken.allowance(msg.sender, address(this));
        require(tokenAmount > 0 || msg.value > 0, "ProposalNFT: No funds to deposit");

        if (tokenAmount > 0) {
            require(
                cityToken.transferFrom(msg.sender, address(this), tokenAmount), "ProposalNFT: Token transfer failed"
            );
            proposals[proposalId].tokenBalance += tokenAmount;
        }

        if (msg.value > 0) {
            proposals[proposalId].ethBalance += msg.value;
        }

        emit FundsDeposited(proposalId, msg.value, tokenAmount);
    }

    function distributeFunds(uint256 proposalId) public {
        require(_ownerOf(proposalId) != address(0), "ProposalNFT: Proposal does not exist");
        require(proposals[proposalId].isActive, "ProposalNFT: Proposal is not active");

        Proposal storage proposal = proposals[proposalId];

        if (proposal.isConditional) {
            require(proposal.acceptanceCount == proposal.parcelIds.length, "ProposalNFT: Not all parcels accepted");
        } else {
            require(proposal.acceptanceCount > 0, "ProposalNFT: No acceptances");
        }

        uint256 ethPerParcel = proposal.ethBalance / proposal.acceptanceCount;
        uint256 tokensPerParcel = proposal.tokenBalance / proposal.acceptanceCount;

        // Distribute funds to accepting parcels
        for (uint256 i = 0; i < proposal.parcelIds.length; i++) {
            string memory parcelId = proposal.parcelIds[i];
            if (proposal.hasAccepted[parcelId]) {
                // Convert parcelId string to uint256
                uint256 parcelTokenId;
                assembly {
                    parcelTokenId := mload(add(parcelId, 32))
                }
                address parcelOwner = parcelNFT.ownerOf(parcelTokenId);

                if (proposal.ethBalance > 0) {
                    (bool success,) = parcelOwner.call{value: ethPerParcel}("");
                    require(success, "ProposalNFT: ETH transfer failed");
                }

                if (proposal.tokenBalance > 0) {
                    require(cityToken.transfer(parcelOwner, tokensPerParcel), "ProposalNFT: Token transfer failed");
                }
            }
        }

        // Mark proposal as inactive after distribution
        proposal.isActive = false;

        emit FundsDistributed(proposalId, proposal.ethBalance, proposal.tokenBalance);
    }

    function getProposal(uint256 proposalId)
        public
        view
        returns (
            string[] memory parcelIds,
            bool isConditional,
            string memory imageURI,
            bool isActive,
            uint256 ethBalance,
            uint256 tokenBalance,
            uint256 acceptanceCount
        )
    {
        require(_ownerOf(proposalId) != address(0), "ProposalNFT: Proposal does not exist");
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.parcelIds,
            proposal.isConditional,
            proposal.imageURI,
            proposal.isActive,
            proposal.ethBalance,
            proposal.tokenBalance,
            proposal.acceptanceCount
        );
    }

    function hasAccepted(uint256 proposalId, string memory parcelId) public view returns (bool) {
        require(_ownerOf(proposalId) != address(0), "ProposalNFT: Proposal does not exist");
        return proposals[proposalId].hasAccepted[parcelId];
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "ProposalNFT: URI query for nonexistent token");
        return proposals[tokenId].imageURI;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function depositERC20(address tokenAddress, uint256 proposalId, uint256 amount) public {
        require(_ownerOf(proposalId) != address(0), "ProposalNFT: Proposal does not exist");
        require(proposals[proposalId].isActive, "ProposalNFT: Proposal is not active");
        require(amount > 0, "ProposalNFT: Amount must be greater than 0");
        require(
            IERC20(tokenAddress).allowance(msg.sender, address(this)) >= amount,
            "ProposalNFT: USDC allowance insufficient"
        );

        require(
            IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), "ProposalNFT: USDC transfer failed"
        );

        // Convert USDC (6 decimals) to ETH equivalent (18 decimals)
        // Assuming 1 USDC = 1 USD and using current ETH price
        uint256 ethEquivalent = (amount * 1e18) / (2500 * 1e6); // Assuming 1 ETH = $2500 USD
        proposals[proposalId].ethBalance += ethEquivalent;

        emit FundsDeposited(proposalId, ethEquivalent, 0);
    }
}
