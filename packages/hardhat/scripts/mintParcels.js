const { ethers } = require('ethers');
const fetch = require('node-fetch');
const fs = require('fs');
const readline = require('readline');
// load .env file from parent directory
require('dotenv').config({ path: '../.env' });

// Updated ABI to include only the mint function
const PARCEL_NFT_ABI = [
    "function mint(address to, uint256 osmId) public returns (uint256)",
    "function mintBatch(address to, uint256[] calldata osmIds) public returns (uint256[] memory)",
    "function ownerOf(uint256 tokenId) public view returns (address)"
];

// Configuration
const CENTER_LAT = 45.760772;
const CENTER_LON = 15.962169;
const ZOOM = 17;
// read the PARCEL_NFT_ADDRESS from the .env.parcelNFT.address file in the parent directory
const PARCEL_NFT_ADDRESS = fs.readFileSync('../.env.parcelNFT.address', 'utf8').trim();
const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const BLOCK_EXPLORER_URL = process.env.BLOCK_EXPLORER_URL;

// Batch size for concurrent processing
const BATCH_SIZE = 20;
const CONCURRENT_BATCHES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const MAX_RETRIES = 3;

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
        process.env.ACCOUNT_5_ADDRESS
    ]
    return addressList[Math.floor(Math.random() * addressList.length)];
}

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

async function checkParcelOwnership(contract, osmId) {
    try {
        await contract.ownerOf(osmId);
        return true; // Parcel is already minted
    } catch (error) {
        if (error.message.includes("ERC721: invalid token ID") ||
            error.message.includes("owner query for nonexistent token")) {
            return false; // Parcel is not minted
        }
        throw error; // Unexpected error
    }
}

async function filterUnmintedParcels(contract, buildings) {
    console.log('\nChecking ownership status of parcels...');
    const unminted = [];
    const minted = [];

    for (const building of buildings) {
        const osmId = BigInt(building.id);
        const isMinted = await checkParcelOwnership(contract, osmId);
        if (isMinted) {
            minted.push(building.id);
        } else {
            unminted.push(building);
        }
    }

    if (minted.length > 0) {
        console.log(`\nSkipping ${minted.length} already minted parcels:`, minted);
    }
    console.log(`Found ${unminted.length} unminted parcels to process`);

    return unminted;
}

async function processBatch(contract, buildings, wallet, batchIndex) {
    // First filter out already minted parcels
    const unmintedBuildings = await filterUnmintedParcels(contract, buildings);

    if (unmintedBuildings.length === 0) {
        console.log(`\nSkipping batch ${batchIndex + 1} - all parcels already minted`);
        return true;
    }

    const address = pickAnAddress(); // Only pick one address for the entire batch
    const osmIds = unmintedBuildings.map(b => BigInt(b.id));

    console.log(`\nProcessing batch ${batchIndex + 1} with ${unmintedBuildings.length} unminted buildings`);
    console.log(`Minting to address: ${address}`);

    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            const nonce = await wallet.getNonce();
            const gasPrice = await wallet.provider.getFeeData();

            // Use EIP-1559 transaction format for better gas optimization
            const tx = await contract.mintBatch(address, osmIds, {
                nonce,
                maxFeePerGas: gasPrice.maxFeePerGas,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
            });

            console.log(`Batch ${batchIndex + 1} transaction submitted: ${BLOCK_EXPLORER_URL}${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`✅ Batch ${batchIndex + 1} minted - Block: ${receipt.blockNumber}`);
            return true;
        } catch (error) {
            // Check for "not enough funds" error
            if ((error.error?.code == -32000) ||
                JSON.stringify(error).includes('Sender doesn\'t have enough funds to send tx')) {
                console.error('\n❌ ERROR: Not enough funds to process transaction');
                console.error('Error details:', error.data?.message || error.message);
                // Exit the process entirely
                process.exit(1);
            }

            retries++;
            if (retries < MAX_RETRIES) {
                console.log(`Retrying batch ${batchIndex + 1} (attempt ${retries + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                console.error(`❌ Failed to process batch ${batchIndex + 1} after ${MAX_RETRIES} attempts:`, error.message);
                if (error.data?.message) {
                    console.error('Detailed error:', error.data.message);
                }
                return false;
            }
        }
    }
}

async function checkBatchMintingSupport(contract) {
    try {
        if (!contract || !contract.runner?.provider) {
            console.log('\n⚠️  Invalid contract or missing provider');
            return false;
        }

        // Get the deployed bytecode using the contract's provider through the runner (wallet)
        console.log('\nChecking contract at address:', contract.target);
        const code = await contract.runner.provider.getCode(contract.target);

        // Check if the function signature exists in the deployed bytecode
        const mintBatchSignature = ethers.keccak256(ethers.toUtf8Bytes("mintBatch(address,uint256[])")).slice(0, 10);

        if (!code.includes(mintBatchSignature.slice(2))) {
            console.log('\n⚠️  Contract does not support batch minting. Falling back to single mints...');
            return false;
        }

        console.log('\n✅ Contract supports batch minting');
        return true;
    } catch (error) {
        console.log('\n⚠️  Contract does not support batch minting:', error.message);
        console.log('Error details:', error);
        return false;
    }
}

async function mintParcelNFTsSingle(contract, buildings, wallet) {
    console.log(`Processing ${buildings.length} buildings individually...`);

    for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i];
        try {
            const to = pickAnAddress();
            const osmId = BigInt(building.id);

            console.log(`\nMinting NFT ${i + 1} of ${buildings.length}`);
            console.log(`Building ID: ${building.id}`);
            console.log(`Minting to: ${to}`);

            const nonce = await wallet.getNonce();
            const tx = await contract.mint(to, osmId, { nonce });
            console.log(`Transaction submitted: ${BLOCK_EXPLORER_URL}${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`✅ Minted NFT ${i + 1} of ${buildings.length} - Block: ${receipt.blockNumber}`);
            console.log('----------------------------------------');

            if (!RPC_URL.includes('localhost')) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            if (error.message.includes("ParcelNFT: Token ID already minted")) {
                console.log(`✔ Error minting NFT ${i + 1} of ${buildings.length} for building ${building.id}:`, 'Parcel already minted');
            } else {
                console.error(`❌ Error minting NFT ${i + 1} of ${buildings.length} for building ${building.id}:`, error.message);
            }
            console.log('----------------------------------------');
        }
    }
}

async function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.toLowerCase());
        });
    });
}

async function mintParcelNFTs(buildings) {
    if (!PARCEL_NFT_ADDRESS || !PRIVATE_KEY) {
        throw new Error("Missing required environment variables");
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(PARCEL_NFT_ADDRESS, PARCEL_NFT_ABI, wallet);

    console.log(`Found ${buildings.length} buildings to mint`);
    console.log('----------------------------------------');

    // Check if contract supports batch minting
    const supportsBatchMinting = await checkBatchMintingSupport(contract);

    if (!supportsBatchMinting) {
        // Ask user whether to continue with single mints
        console.log('\n⚠️  This will process each mint individually, which will be slower and more expensive.');
        const answer = await promptUser('Do you want to continue with single minting? (Y/N): ');

        if (answer !== 'y') {
            console.log('\n❌ Minting process cancelled by user');
            process.exit(0);
        }

        // Fall back to single mints
        await mintParcelNFTsSingle(contract, buildings, wallet);
        return;
    }

    // Proceed with batch minting
    console.log('\n🚀 Contract supports batch minting. Proceeding with batched operations...');

    // Split buildings into batches
    const batches = chunkArray(buildings, BATCH_SIZE);
    console.log(`Split into ${batches.length} batches of up to ${BATCH_SIZE} buildings each`);

    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
        const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
        const promises = currentBatches.map((batch, index) =>
            processBatch(contract, batch, wallet, i + index)
        );

        await Promise.all(promises);

        // Add delay between concurrent batch groups if not on localhost
        if (!RPC_URL.includes('localhost') && i + CONCURRENT_BATCHES < batches.length) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
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

        console.log('The deployer (minter) address is:', DEPLOYER_ADDRESS);

        await mintParcelNFTs(buildings);

        console.log("\n✨ All done!");
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    }
}

main(); 