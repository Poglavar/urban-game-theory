const { ethers } = require('ethers');
const fetch = require('node-fetch');
const fs = require('fs');
// load .env file from parent directory
require('dotenv').config({ path: '../.env' });

// Contract ABI - we only need the mint function
const PARCEL_NFT_ABI = [
    "function mint(address to, uint256 osmId) public returns (uint256)"
];

// Configuration
const CENTER_LAT = 45.760772;
const CENTER_LON = 15.962169;
const ZOOM = 17;
// read the PARCEL_NFT_ADDRESS from the .env.parcelNFT.address file in the parent directory
const PARCEL_NFT_ADDRESS = fs.readFileSync('../.env.parcelNFT.address', 'utf8');
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const BLOCK_EXPLORER_URL = process.env.BLOCK_EXPLORER_URL;

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

async function getBuildings(bounds) {
    const query = `
    [out:json][timeout:25];
    (
      way["building"]
        (${bounds.south},${bounds.west},${bounds.north},${bounds.east});
    );
    out body;
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

// function to generate a random address
function pickAnAddress() {
    const addressList = [
        process.env.ACCOUNT_0_ADDRESS,
        process.env.ACCOUNT_1_ADDRESS,
        process.env.ACCOUNT_2_ADDRESS,
        process.env.ACCOUNT_3_ADDRESS,
        process.env.ACCOUNT_4_ADDRESS,
        process.env.ACCOUNT_5_ADDRESS,
        process.env.ACCOUNT_6_ADDRESS
    ]
    return addressList[Math.floor(Math.random() * addressList.length)];
}

async function mintParcelNFTs(buildings) {
    if (!PARCEL_NFT_ADDRESS) {
        throw new Error("PARCEL_NFT_ADDRESS not set in environment");
    }
    if (!PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY not set in environment");
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(PARCEL_NFT_ADDRESS, PARCEL_NFT_ABI, wallet);

    console.log(`Found ${buildings.length} buildings to mint`);
    console.log('----------------------------------------');

    for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i];
        try {
            // Prepare mint parameters
            // const to = wallet.address;
            const to = pickAnAddress();
            const osmId = BigInt(building.id);

            console.log(`\nMinting NFT ${i + 1} of ${buildings.length}`);
            console.log(`Building ID: ${building.id}`);
            console.log(`Minting to: ${to}`);
            // Mint the NFT
            const tx = await contract.mint(to, osmId);
            console.log(`Transaction submitted: ${BLOCK_EXPLORER_URL}${tx.hash}`);

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(`✅ Minted NFT ${i + 1} of ${buildings.length} - Block: ${receipt.blockNumber}`);
            console.log('----------------------------------------');

            // Add a small delay between mints to avoid rate limiting
            // wait 1 second between mints but only if not on the local network            
            if (!RPC_URL.includes('localhost')) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

        } catch (error) {
            // if the error is due to the NFT already being minted, don't output the full error message
            if (error.message.includes("ParcelNFT: Token ID already minted")) {
                console.log(`✔ Error minting NFT ${i + 1} of ${buildings.length} for building ${building.id}:`, 'Parcel already minted');
            } else {
                console.error(`❌ Error minting NFT ${i + 1} of ${buildings.length} for building ${building.id}:`, error.message);
            }
            console.log('----------------------------------------');
        }
    }
}

async function main() {
    try {
        console.log("\n🏗️  Urban Game Theory - Parcel NFT Minter");
        console.log("----------------------------------------");
        console.log(`PARCEL_NFT_ADDRESS: ${PARCEL_NFT_ADDRESS}`);

        console.log("Calculating bounding box...");
        const bounds = calculateBoundingBox(CENTER_LAT, CENTER_LON, ZOOM);

        console.log("Fetching buildings from OpenStreetMap...");
        const buildings = await getBuildings(bounds);

        console.log("\n🚀 Starting minting process...");
        console.log("----------------------------------------");

        await mintParcelNFTs(buildings);

        console.log("\n✨ All done!");
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    }
}

main(); 