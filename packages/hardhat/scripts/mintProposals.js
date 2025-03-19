const { ethers } = require('ethers');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

// Contract ABIs
const PROPOSAL_NFT_ABI = [
    "function mintAndFund(address to, string[] memory parcelIds, bool isConditional, string memory imageURI, uint256 ethAmount, uint256 tokenAmount) public payable returns (uint256)",
    "function ownerOf(uint256 tokenId) public view returns (address)",
    "function totalSupply() public view returns (uint256)"
];

const CITY_TOKEN_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)"
];

// Configuration
const CENTER_LAT = 45.760772;
const CENTER_LON = 15.962169;
const ZOOM = 17;
const NUM_PROPOSALS = 5; // Configure how many proposals to mint

// Contract addresses
const PROPOSAL_NFT_ADDRESS = fs.readFileSync('../.env.proposalNFT.address', 'utf8').trim();
const CITY_TOKEN_ADDRESS = fs.readFileSync('../.env.cityToken.address', 'utf8').trim();
const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const BLOCK_EXPLORER_URL = process.env.BLOCK_EXPLORER_URL;

// Helper function to get random number in range (inclusive)
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function to get random float in range
function getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// Helper function to get random boolean
function getRandomBoolean() {
    return Math.random() < 0.5;
}

// Helper function to get random ETH amount (between 0.001 and 0.005 ETH)
function getRandomEthAmount() {
    return ethers.parseEther(getRandomFloat(0.001, 0.005).toFixed(6));
}

// Helper function to get random token amount (between 1 and 10 tokens)
function getRandomTokenAmount() {
    return ethers.parseUnits(getRandomInt(1, 10).toString(), 18);
}

// Calculate bounding box for the given zoom level
function calculateBoundingBox(centerLat, centerLon, zoom) {
    const tiles = Math.pow(2, zoom);
    const degreesPerTile = 360 / tiles;

    // Approximate view range for zoom level 17
    const latRange = degreesPerTile * 2;
    const lonRange = degreesPerTile * 2;

    return {
        south: centerLat - latRange / 2,
        north: centerLat + latRange / 2,
        west: centerLon - lonRange / 2,
        east: centerLon + lonRange / 2
    };
}

// Function to fetch all buildings from OpenStreetMap within the bounding box
async function getBuildings(bounds) {
    const query = `
    [out:json][timeout:25];
    (
      way["building"]
        (${bounds.south},${bounds.west},${bounds.north},${bounds.east});
    );
    out body;
    >;
    out skel qt;
  `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
    });

    if (!response.ok) {
        throw new Error('Failed to fetch buildings');
    }

    const data = await response.json();
    return data.elements.filter(el => el.tags?.building && el.id);
}

// Helper function to find neighboring parcels
function findNeighbors(building, allBuildings) {
    // Convert building nodes to a set of coordinates
    const buildingNodes = new Set(building.nodes);

    // Find buildings that share at least one node (they are neighbors)
    return allBuildings.filter(other => {
        if (other.id === building.id) return false;
        return other.nodes.some(node => buildingNodes.has(node));
    });
}

// Generate a random chain of connected parcels
async function generateConnectedParcels(buildings) {
    if (buildings.length === 0) {
        throw new Error('No buildings found');
    }
    const numParcels = getRandomInt(1, 10);
    console.log('Number of parcels:', numParcels);
    const parcels = [];

    // Start with a random building
    const startIndex = getRandomInt(0, buildings.length - 1);
    console.log('Start index:', startIndex);
    let currentBuilding = buildings[startIndex];
    console.log('Starting with building:', currentBuilding.id);
    parcels.push(currentBuilding);

    // Add neighboring parcels
    while (parcels.length < numParcels) {
        const neighbors = findNeighbors(currentBuilding, buildings);
        if (neighbors.length === 0) {
            console.log('No neighbors found for building:', currentBuilding);
            break;
        }

        // Pick a random neighbor that hasn't been used yet
        const availableNeighbors = neighbors.filter(n => !parcels.includes(n.id.toString()));
        if (availableNeighbors.length === 0) break;

        const nextBuilding = availableNeighbors[getRandomInt(0, availableNeighbors.length - 1)];
        parcels.push(nextBuilding);
        currentBuilding = nextBuilding;
    }

    console.log('Generated:', parcels);

    return parcels;
}

// Function to mint a proposal
async function mintProposal(contract, cityTokenContract, buildings, proposalIndex) {
    try {
        const parcels = await generateConnectedParcels(buildings);
        const parcelIds = parcels.map(p => p.id.toString());
        const isConditional = getRandomBoolean();
        const ethAmount = getRandomEthAmount();
        const tokenAmount = getRandomTokenAmount();

        console.log(`\nMinting proposal ${proposalIndex + 1}/${NUM_PROPOSALS}`);
        console.log(`Parcels: ${parcelIds.join(', ')}`);
        console.log(`Conditional: ${isConditional}`);
        console.log(`ETH Amount: ${ethers.formatEther(ethAmount)} ETH`);
        console.log(`Token Amount: ${ethers.formatEther(tokenAmount)} CITY`);

        // First approve tokens if needed
        if (tokenAmount > 0n) {
            console.log('\nApproving tokens...');
            const approveTx = await cityTokenContract.approve(PROPOSAL_NFT_ADDRESS, tokenAmount);
            await approveTx.wait();
            console.log('Token approval confirmed');
        }

        // Mint the proposal
        console.log('\nMinting proposal...');
        const tx = await contract.mintAndFund(
            DEPLOYER_ADDRESS,
            parcelIds,
            isConditional,
            "https://test.com/img.jpg",
            ethAmount,
            tokenAmount,
            { value: ethAmount }
        );

        console.log(`Transaction submitted: ${BLOCK_EXPLORER_URL}${tx.hash}`);
        const receipt = await tx.wait();
        console.log('Receipt:', receipt);
        console.log(`✅ Proposal ${proposalIndex + 1} minted - Block: ${receipt.blockNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to mint proposal ${proposalIndex + 1}:`, error.message);
        if (error.data?.message) {
            console.error('Detailed error:', error.data.message);
        }
        console.error('Error details:', error);
        return false;
    }
}

// Add this function to check total proposals
async function getTotalProposals(contract) {
    try {
        const total = await contract.totalSupply();
        return total;
    } catch (error) {
        console.error("Error getting total proposals:", error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log("\n🏗️  Urban Game Theory - Proposal NFT Minter");
        console.log("----------------------------------------");
        console.log(`PROPOSAL_NFT_ADDRESS: ${PROPOSAL_NFT_ADDRESS}`);
        console.log(`CITY_TOKEN_ADDRESS: ${CITY_TOKEN_ADDRESS}`);
        console.log(`DEPLOYER_ADDRESS: ${DEPLOYER_ADDRESS}`);

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        const proposalContract = new ethers.Contract(PROPOSAL_NFT_ADDRESS, PROPOSAL_NFT_ABI, wallet);
        const cityTokenContract = new ethers.Contract(CITY_TOKEN_ADDRESS, CITY_TOKEN_ABI, wallet);

        console.log("\nCalculating bounding box...");
        const bounds = calculateBoundingBox(CENTER_LAT, CENTER_LON, ZOOM);

        console.log("Fetching all buildings from OpenStreetMap in the bounding box...");
        const allBuildings = await getBuildings(bounds);
        console.log(`Found ${allBuildings.length} buildings`);

        const totalProposals = await getTotalProposals(proposalContract);
        console.log(`\nCurrent number of proposals minted: ${totalProposals}`);

        console.log("\n🚀 Starting proposal minting process...");
        console.log("----------------------------------------");

        const success = [];
        for (let i = 0; i < NUM_PROPOSALS; i++) {
            const buildings = await generateConnectedParcels(allBuildings);
            await mintProposal(proposalContract, cityTokenContract, buildings, i);
        }

        console.log("\n✨ All done!");
    } catch (error) {
        console.error("\n❌ Error--->:", error.message);
        process.exit(1);
    }
}

main();