"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldContract } from "~~/hooks/scaffold-eth/useScaffoldContract";
import MapView from "~~/components/map/MapView";
import type { Parcel } from "~~/types/parcel";
import { toPng } from "html-to-image";
import { notification } from "~~/utils/scaffold-eth";
import { Contract } from "ethers";

// Extend Window interface to include analyzeArea
declare global {
  interface Window {
    analyzeArea?: () => Promise<void>;
  }
}

interface BuildingDetails {
  id: string;
  area: number;
  center: { lat: number; lon: number };
  tags: Record<string, string>;
  geometry: Array<{ lat: number; lon: number }>;
  parcelId?: string;
}

interface SelectedParcel {
  id: string;
  buildingDetails: BuildingDetails | null;
}

interface ProposalMetadata {
  name: string;
  description: string;
  type: string;
  image: string;
  image_url: string;
  external_url: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
}

interface ProposalData {
  tokenId: number;
  metadata: ProposalMetadata;
  parcelIds: string[];
}

interface ProposalResponse {
  parcelIds: readonly string[];
  isConditional: boolean;
  imageURI: string;
  isActive: boolean;
}

export default function Home() {
  const { address } = useAccount();
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([]);
  const [isAnalyzingParcels, setIsAnalyzingParcels] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showMemeTokenModal, setShowMemeTokenModal] = useState(false);
  const [activeTab, setActiveTab] = useState("my");
  const [cityTokenAmount, setCityTokenAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [memeTokenData, setMemeTokenData] = useState<any>(null);
  const [isLoadingMemeData, setIsLoadingMemeData] = useState(false);

  const { writeContractAsync: writeProposalNFT } = useScaffoldWriteContract({
    contractName: "ProposalNFT",
  });

  const { data: memeTokenContract } = useScaffoldContract({
    contractName: "CityMemeToken",
  }) as { data: Contract | null };

  const { data: totalSupply } = useScaffoldReadContract({
    contractName: "CityMemeToken",
    functionName: "totalSupply",
  });

  const { data: owner } = useScaffoldReadContract({
    contractName: "CityMemeToken",
    functionName: "owner",
  });

  // Check if contract is initialized by trying to read first proposal
  const { data: firstProposal } = useScaffoldReadContract({
    contractName: "ProposalNFT",
    functionName: "getProposal",
    args: [BigInt(0)],
  });

  const loadAllProposals = async () => {
    if (!firstProposal) {
      notification.error("Contract not initialized");
      return;
    }

    setIsLoadingProposals(true);
    try {
      // Get all proposals by iterating through token IDs
      let tokenId = BigInt(0);
      const proposals: ProposalData[] = [];

      while (true) {
        try {
          // Try to get proposal data
          const { data: proposal } = await useScaffoldReadContract({
            contractName: "ProposalNFT",
            functionName: "getProposal",
            args: [tokenId],
          });

          if (!proposal || !proposal.isActive) {
            tokenId = tokenId + BigInt(1);
            continue;
          }

          // Get token URI
          const { data: uri } = await useScaffoldReadContract({
            contractName: "ProposalNFT",
            functionName: "tokenURI",
            args: [tokenId],
          });

          if (!uri) {
            tokenId = tokenId + BigInt(1);
            continue;
          }

          // Remove ipfs:// prefix if present
          const cleanUri = uri.replace("ipfs://", "");

          // Fetch metadata from IPFS via Pinata gateway
          const metadataResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${cleanUri}`);
          if (!metadataResponse.ok) {
            tokenId = tokenId + BigInt(1);
            continue;
          }

          const metadata = await metadataResponse.json();

          proposals.push({
            tokenId: Number(tokenId),
            metadata,
            parcelIds: [...proposal.parcelIds] // Spread operator to create new mutable array
          });

          tokenId = tokenId + BigInt(1);
        } catch (error) {
          // If we get an error, we've likely reached the end of valid tokens
          break;
        }
      }

      // Get unique parcel IDs from all valid proposals
      const uniqueParcelIds = new Set(
        proposals.flatMap(proposal => proposal.parcelIds)
      );

      // Update selected parcels with proper typing
      const newSelectedParcels: SelectedParcel[] = Array.from(uniqueParcelIds).map(parcelId => ({
        id: parcelId.toString(),
        buildingDetails: null
      }));

      notification.success(`Loaded ${proposals.length} proposals with ${uniqueParcelIds.size} unique parcels`);

      // Update selected parcels without triggering analysis
      setSelectedParcels(newSelectedParcels);
      setActiveTab("selected");

    } catch (error) {
      console.error("Error loading proposals:", error);
      notification.error(error instanceof Error ? error.message : "Failed to load proposals");
    } finally {
      setIsLoadingProposals(false);
    }
  };

  const handleParcelSelect = (parcelId: string | null, buildingDetails: BuildingDetails | null) => {
    if (!parcelId) return;

    setSelectedParcels(prevParcels => {
      const existingParcelIndex = prevParcels.findIndex(p => p.id === parcelId);

      if (existingParcelIndex >= 0) {
        // Remove the parcel if it's already selected
        return prevParcels.filter(p => p.id !== parcelId);
      } else if (buildingDetails) {
        // Add the parcel if it's not already selected and we have building details
        setActiveTab("selected"); // Switch to selected tab when adding a parcel
        return [...prevParcels, { id: parcelId, buildingDetails }];
      }
      return prevParcels;
    });
  };

  // Proposal Modal Component
  const ProposalModal = () => {
    const { address } = useAccount();
    const [proposalName, setProposalName] = useState("");
    const [proposalDescription, setProposalDescription] = useState("");
    const [proposalType, setProposalType] = useState("Road");
    const [isConditional, setIsConditional] = useState(false);
    const [shareUpside, setShareUpside] = useState(false);
    const [ethAmount, setEthAmount] = useState("");
    const [cityTokenAmount, setCityTokenAmount] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
    const mapRef = useRef(null);

    const { writeContractAsync, isMining } = useScaffoldWriteContract({
      contractName: "ProposalNFT",
    });

    const captureMapPreview = async () => {
      try {
        const mapElement = document.querySelector('.leaflet-container');
        if (!mapElement) {
          throw new Error('Map element not found');
        }

        const dataUrl = await toPng(mapElement as HTMLElement, {
          quality: 0.95,
          backgroundColor: 'white'
        });

        // Store the preview URL
        setImagePreviewUrl(dataUrl);
      } catch (error) {
        console.error("Error capturing map preview:", error);
        notification.error(error instanceof Error ? error.message : "Failed to capture map preview");
      }
    };

    const uploadToIPFS = async () => {
      try {
        notification.info("Uploading to IPFS...");
        const apiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
        const apiSecret = process.env.NEXT_PUBLIC_PINATA_API_SECRET;
        if (!apiKey || !apiSecret) {
          throw new Error('Pinata API key or secret not found. Please check your .env.local file');
        }

        // Convert data URL to Blob
        const response = await fetch(imagePreviewUrl);
        const blob = await response.blob();

        // Create form data for the file
        const formData = new FormData();
        formData.append('file', blob, `${proposalName}-map-screenshot.png`);

        // Upload image to Pinata
        const imageUploadResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: {
            'pinata_api_key': apiKey,
            'pinata_secret_api_key': apiSecret,
          },
          body: formData
        });

        if (!imageUploadResponse.ok) {
          throw new Error('Failed to upload image to Pinata');
        }

        const imageResult = await imageUploadResponse.json();
        const imageUrl = `https://gateway.pinata.cloud/ipfs/${imageResult.IpfsHash}`;

        // Create and upload metadata
        const metadata = {
          name: proposalName,
          description: proposalDescription,
          type: proposalType,
          image: imageUrl,
          image_url: imageUrl, // Adding image_url as some marketplaces use this
          external_url: imageUrl,
          attributes: [
            {
              trait_type: "Proposal Type",
              value: proposalType
            },
            {
              trait_type: "Conditional",
              value: isConditional ? "Yes" : "No"
            },
            {
              trait_type: "Share Upside",
              value: shareUpside ? "Yes" : "No"
            },
            {
              trait_type: "Parcels",
              value: selectedParcels.length.toString()
            }
          ]
        };

        // Upload metadata to Pinata
        const metadataUploadResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': apiKey,
            'pinata_secret_api_key': apiSecret,
          },
          body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: {
              name: `${proposalName}-metadata.json`
            }
          })
        });

        if (!metadataUploadResponse.ok) {
          throw new Error('Failed to upload metadata to Pinata');
        }

        const metadataResult = await metadataUploadResponse.json();
        return `ipfs://${metadataResult.IpfsHash}`;
      } catch (error) {
        console.error("Error uploading to IPFS:", error);
        notification.error(error instanceof Error ? error.message : "Failed to upload to IPFS");
        throw error;
      }
    };

    // Update useEffect to use the new preview function
    useEffect(() => {
      if (showProposalModal) {
        captureMapPreview();
      } else {
        setImagePreviewUrl("");
      }
    }, [showProposalModal]);

    const handleMint = async () => {
      if (!address || selectedParcels.length === 0) {
        notification.error("Please connect wallet and select parcels");
        return;
      }

      if (!proposalName || !proposalDescription) {
        notification.error("Please fill in proposal name and description");
        return;
      }

      if (!imagePreviewUrl) {
        notification.error("Please wait for the map preview to load");
        return;
      }

      setIsLoading(true);
      try {
        notification.info("Starting proposal creation...");
        const ipfsUrl = await uploadToIPFS();

        notification.info("Minting NFT...");
        console.log("Minting with args:", {
          address,
          parcelIds: selectedParcels.map(parcel => parcel.id),
          isConditional,
          ipfsUrl
        });

        await writeContractAsync({
          functionName: "mint",
          args: [address, selectedParcels.map(parcel => parcel.id), isConditional, ipfsUrl],
        });

        notification.success("Proposal created successfully!");
        setShowProposalModal(false);
      } catch (error) {
        console.error("Error minting proposal:", error);
        notification.error(error instanceof Error ? error.message : "Failed to create proposal");
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <dialog id="proposal_modal" className={`modal modal-bottom sm:modal-top ${showProposalModal ? 'modal-open' : ''}`} style={{ zIndex: 1000 }}>
        <div className="modal-box relative z-[1000] mt-8 mx-auto !w-[33vw] !max-w-[33vw] !rounded-[1rem] bg-base-100 shadow-xl" style={{ borderRadius: '1rem' }}>
          <h3 className="font-bold text-lg mb-4">Create New Proposal</h3>
          <div className="space-y-4">
            {imagePreviewUrl && (
              <div className="w-full aspect-video rounded-lg overflow-hidden border-2 border-base-300">
                <img
                  src={imagePreviewUrl}
                  alt="Map Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Proposal Type</span>
              </label>
              <select
                className="select select-bordered w-full rounded-lg"
                value={proposalType}
                onChange={(e) => setProposalType(e.target.value)}
              >
                <option value="Road">Road</option>
                <option value="Park">Park</option>
                <option value="Square">Square</option>
                <option value="Buildings">Buildings</option>
                <option value="Mixed">Mixed</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Proposal Name</span>
              </label>
              <input
                type="text"
                placeholder="Enter proposal name"
                className="input input-bordered w-full rounded-lg"
                value={proposalName}
                onChange={(e) => setProposalName(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Proposal Description</span>
              </label>
              <textarea
                placeholder="Enter proposal description"
                className="textarea textarea-bordered w-full h-24 rounded-lg"
                value={proposalDescription}
                onChange={(e) => setProposalDescription(e.target.value)}
              />
            </div>
            <div>
              <h4 className="font-semibold mb-2">Selected Parcels:</h4>
              <div className="bg-base-200 p-2 rounded-lg">
                {selectedParcels.map(parcel => (
                  <div key={parcel.id} className="text-sm">
                    {parcel.id}
                  </div>
                ))}
              </div>
            </div>
            <div className="form-control">
              <div className="flex items-center gap-6">
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    className="checkbox rounded-md"
                    checked={isConditional}
                    onChange={(e) => setIsConditional(e.target.checked)}
                  />
                  <span className="label-text">Conditional</span>
                  <div className="tooltip" data-tip="If checked, the proposal executes only if all parcels accept it. Otherwise each accepting parcel gets a proportional share of the attached crypto">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                </label>
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    className="checkbox rounded-md"
                    checked={shareUpside}
                    onChange={(e) => setShareUpside(e.target.checked)}
                  />
                  <span className="label-text">Share of the upside</span>
                  <div className="tooltip" data-tip="If you check this box, the parcels form a meta-parcel for sale, which when sold appropriates an amount to each parcel proportional to its share of the area involved">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                </label>
              </div>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">ETH Amount</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="Enter ETH amount"
                className="input input-bordered w-full rounded-lg"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">City Token Amount</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="Enter City Token amount"
                className="input input-bordered w-full rounded-lg"
                value={cityTokenAmount}
                onChange={(e) => setCityTokenAmount(e.target.value)}
              />
            </div>
            <div className="text-sm text-base-content/70 italic">
              When you create this proposal it will be minted as an NFT and linked to all the land parcels included in it
            </div>
            <div className="modal-action flex items-center gap-2">
              {!address && <RainbowKitCustomConnectButton />}
              {address && (
                <button
                  className={`btn btn-primary ${isLoading || isMining ? 'loading' : ''}`}
                  onClick={() => {
                    console.log("Mint button clicked");
                    handleMint();
                  }}
                  disabled={isLoading || isMining || selectedParcels.length === 0}
                >
                  {isLoading || isMining ? 'Minting...' : 'Mint and Fund'}
                </button>
              )}
              <button
                className="btn"
                onClick={() => setShowProposalModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop bg-neutral-900/50" onClick={() => setShowProposalModal(false)}>
          <button className="cursor-default">close</button>
        </form>
      </dialog>
    );
  };

  // Add this after ProposalModal component
  const MemeTokenModal = ({ showMemeTokenModal, setShowMemeTokenModal, memeTokenContract, totalSupply, owner }: {
    showMemeTokenModal: boolean;
    setShowMemeTokenModal: (show: boolean) => void;
    memeTokenContract: Contract | null;
    totalSupply: bigint | undefined;
    owner: string | undefined;
  }) => {
    return (
      <dialog id="meme_token_modal" className={`modal modal-bottom sm:modal-top ${showMemeTokenModal ? 'modal-open' : ''}`} style={{ zIndex: 1000 }}>
        <div className="modal-box relative z-[1000] mt-8 mx-auto !w-[66vw] !max-w-[66vw] !rounded-[1rem] bg-gradient-to-br from-indigo-900 via-blue-900 to-purple-900 text-white" style={{ borderRadius: '1rem' }}>
          <h3 className="font-bold text-lg mb-4">City Meme Token Status</h3>
          <div className="space-y-4">
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Market Information</h4>
              <div className="space-y-2">
                <p><span className="font-medium">Current Market Value:</span> $0.008</p>
                <p><span className="font-medium">Current Market Cap:</span> ${((totalSupply ?
                  Number(totalSupply) / 10 ** 18 : 0) * 0.008).toLocaleString()}</p>
                <p>
                  <span className="font-medium">Coingecko:</span>{' '}
                  <a
                    href="https://www.coingecko.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link text-blue-300 hover:text-blue-200"
                  >
                    View on Coingecko
                  </a>
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Token Information</h4>
              <div className="space-y-2">
                <p><span className="font-medium">Name:</span> Zagreb Meme Token</p>
                <p><span className="font-medium">Symbol:</span> ZAGREB</p>
                <p><span className="font-medium">Deployment Date:</span> March 1, 2025</p>
                <p>
                  <span className="font-medium">Contract Address:</span>{' '}
                  <a
                    href={`https://sepolia.etherscan.io/address/${memeTokenContract?.target}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link text-blue-300 hover:text-blue-200"
                  >
                    {memeTokenContract?.target}
                  </a>
                </p>
                <p>
                  <span className="font-medium">Contract Creator:</span>{' '}
                  <a
                    href={`https://sepolia.etherscan.io/address/${owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link text-blue-300 hover:text-blue-200"
                  >
                    {owner}
                  </a>
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Supply Information</h4>
              <div className="space-y-2">
                <p><span className="font-medium">Initial Supply:</span> 1,000,000,000 ZAGREB</p>
                <p><span className="font-medium">Current Supply:</span> {totalSupply ?
                  Number(totalSupply) / 10 ** 18 : 'Loading...'} ZAGREB</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Top Holders</h4>
              <div className="space-y-2">
                <p className="text-white/70">Loading top holders data...</p>
              </div>
            </div>

            <div className="modal-action">
              <button
                className="btn bg-white/20 hover:bg-white/30 text-white border-0"
                onClick={() => setShowMemeTokenModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop bg-neutral-900/50" onClick={() => setShowMemeTokenModal(false)}>
          <button className="cursor-default">close</button>
        </form>
      </dialog>
    );
  };

  // Update ControlsPanel to use firstProposal for button disable state
  const ControlsPanel = () => {
    return (
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Controls</h2>
        <div className="space-y-4">
          <div>
            <button
              className={`btn btn-primary w-full ${isAnalyzingParcels ? 'loading' : ''}`}
              onClick={() => {
                setIsAnalyzingParcels(true);
                (window as any).analyzeArea?.();
              }}
              disabled={isAnalyzingParcels}
            >
              {isAnalyzingParcels ? 'Loading...' : 'Load Parcel Data'}
            </button>
          </div>
          <div>
            <button
              className="btn btn-secondary w-full"
              disabled={selectedParcels.length === 0}
              onClick={() => setShowProposalModal(true)}
            >
              Create Proposal
            </button>
          </div>
          <div>
            <button
              className={`btn btn-accent w-full flex items-center justify-center gap-2`}
              onClick={loadAllProposals}
              disabled={isLoadingProposals || !firstProposal}
            >
              {isLoadingProposals ? (
                <>
                  <span className="inline-block animate-bounce">⬇</span>
                  <span>Loading Proposals</span>
                  <span className="inline-block animate-bounce" style={{ animationDelay: '0.2s' }}>⬇</span>
                </>
              ) : (
                'Load All Proposals'
              )}
            </button>
          </div>
          <div>
            <button
              className="btn w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600"
              onClick={() => setShowMemeTokenModal(true)}
            >
              Meme Token Status
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add this helper function near the top of the file, after the interfaces
  const calculateDimensions = (geometry: Array<{ lat: number; lon: number }>) => {
    const lats = geometry.map(p => p.lat);
    const lons = geometry.map(p => p.lon);

    // Calculate height and width in meters (approximate)
    const latDiff = Math.max(...lats) - Math.min(...lats);
    const lonDiff = Math.max(...lons) - Math.min(...lons);

    // Convert to meters (rough approximation)
    const metersPerLat = 111320; // meters per degree of latitude
    const metersPerLon = 111320 * Math.cos(geometry[0].lat * Math.PI / 180); // meters per degree of longitude at this latitude

    return {
      width: (lonDiff * metersPerLon).toFixed(1),
      height: (latDiff * metersPerLat).toFixed(1)
    };
  };

  // Update BuildingDetailsTooltip to handle null buildingDetails
  const BuildingDetailsTooltip = ({ buildingDetails }: { buildingDetails: BuildingDetails | null }) => {
    if (!buildingDetails) {
      return <div className="p-3">Loading building details...</div>;
    }

    const { width, height } = calculateDimensions(buildingDetails.geometry);

    return (
      <div className="max-w-sm space-y-2 p-3 text-base-content">
        <div>
          <span className="font-semibold text-primary">Building ID:</span> {buildingDetails.id}
        </div>
        <div>
          <span className="font-semibold text-primary">Area:</span> {(buildingDetails.area * 1000000).toFixed(1)} m²
        </div>
        <div>
          <span className="font-semibold text-primary">Location:</span> {buildingDetails.center.lat.toFixed(6)}, {buildingDetails.center.lon.toFixed(6)}
        </div>
        <div>
          <span className="font-semibold text-primary">Dimensions:</span>
          <div className="pl-3 space-y-1">
            <div>Width: ~{width} m</div>
            <div>Height: ~{height} m</div>
            <div>Vertices: {buildingDetails.geometry.length}</div>
          </div>
        </div>
        {Object.entries(buildingDetails.tags).length > 0 && (
          <div>
            <span className="font-semibold text-primary">Building Tags:</span>
            <div className="pl-3 space-y-1">
              {Object.entries(buildingDetails.tags).map(([key, value]) => (
                <div key={key}>
                  <span className="font-medium">{key}:</span> {value}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Update the ListPanel's parcel rendering
  const ListPanel = ({ onParcelSelect }: { onParcelSelect?: (parcelId: string | null, buildingDetails: BuildingDetails | null) => void }) => {
    return (
      <div className="p-4">
        <div role="tablist" className="tabs tabs-lifted">
          <a
            role="tab"
            className={`tab tab-lg ${activeTab === "my" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("my")}
          >
            My Parcels (0)
          </a>
          <a
            role="tab"
            className={`tab tab-lg ${activeTab === "selected" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("selected")}
          >
            Selected Parcels{selectedParcels.length > 0 ? ` (${selectedParcels.length})` : ''}
          </a>
        </div>

        <div className={`p-4 bg-base-100 rounded-b-box border-base-300 border-2 border-t-0`}>
          {activeTab === "selected" ? (
            <div className="space-y-2">
              {selectedParcels.length > 0 ? (
                selectedParcels.map((parcel) => (
                  <div key={parcel.id} className="bg-base-200 p-4 rounded-lg relative">
                    <button
                      className="btn btn-ghost btn-xs absolute top-2 right-2"
                      onClick={() => {
                        onParcelSelect?.(parcel.id, null);
                      }}
                    >
                      ✕
                    </button>
                    <h3 className="text-xl font-semibold mb-2">Parcel</h3>
                    <div className="group relative inline-block">
                      <div className="text-sm hover:text-primary cursor-help">
                        {parcel.id}
                        <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200 absolute left-0 top-full mt-1 z-[99999] bg-[#e6d5b8] rounded-lg shadow-xl border border-[#d4bc94] w-[25vw] text-black transform -translate-x-1/4">
                          <BuildingDetailsTooltip buildingDetails={parcel.buildingDetails} />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-base-content/70">Building: {parcel.buildingDetails?.tags.building || 'Unknown'}</p>
                  </div>
                ))
              ) : (
                <p>No parcels selected</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p>No parcels owned yet</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Replace DetailsPanel with ProposalsPanel
  const ProposalsPanel = () => {
    return (
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Proposals</h2>
        <div className="space-y-4">
          {firstProposal ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between items-start">
                    <h3 className="card-title text-lg">New Park Development</h3>
                    <span className="badge badge-accent">Park</span>
                  </div>
                  <p className="text-sm text-base-content/70 mt-2">Create a new public park with recreational facilities</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Parcels Involved:</span>
                      <span className="font-medium">3</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Status:</span>
                      <span className="text-success">Active</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Conditional:</span>
                      <span>Yes</span>
                    </div>
                  </div>
                  <div className="card-actions justify-end mt-4">
                    <button className="btn btn-sm btn-primary">View Details</button>
                  </div>
                </div>
              </div>

              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between items-start">
                    <h3 className="card-title text-lg">Road Extension</h3>
                    <span className="badge badge-secondary">Road</span>
                  </div>
                  <p className="text-sm text-base-content/70 mt-2">Extend the main road to improve connectivity</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Parcels Involved:</span>
                      <span className="font-medium">5</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Status:</span>
                      <span className="text-success">Active</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Conditional:</span>
                      <span>No</span>
                    </div>
                  </div>
                  <div className="card-actions justify-end mt-4">
                    <button className="btn btn-sm btn-primary">View Details</button>
                  </div>
                </div>
              </div>

              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between items-start">
                    <h3 className="card-title text-lg">Mixed-Use Development</h3>
                    <span className="badge badge-warning">Mixed</span>
                  </div>
                  <p className="text-sm text-base-content/70 mt-2">Create a mixed-use area with retail and residential spaces</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Parcels Involved:</span>
                      <span className="font-medium">8</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Status:</span>
                      <span className="text-success">Active</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Conditional:</span>
                      <span>Yes</span>
                    </div>
                  </div>
                  <div className="card-actions justify-end mt-4">
                    <button className="btn btn-sm btn-primary">View Details</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-base-content/70">No proposals available yet</p>
              <button
                className="btn btn-primary mt-4"
                onClick={() => setShowProposalModal(true)}
                disabled={selectedParcels.length === 0}
              >
                Create First Proposal
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-wrap h-screen">
      {/* Upper Left - Map */}
      <div className="w-1/2 h-1/2 border-r border-b border-base-300">
        <MapView
          onParcelSelect={handleParcelSelect}
          onAnalyze={() => {
            setIsAnalyzingParcels(false);
          }}
          selectedParcelIds={selectedParcels.map(p => p.id)}
        />
      </div>

      {/* Upper Right - Controls */}
      <div className="w-1/2 h-1/2 border-b border-base-300">
        <ControlsPanel />
      </div>

      {/* Lower Left - List */}
      <div className="w-1/2 h-1/2 border-r border-base-300 overflow-auto">
        <ListPanel onParcelSelect={handleParcelSelect} />
      </div>

      {/* Lower Right - Proposals */}
      <div className="w-1/2 h-1/2 overflow-auto">
        <ProposalsPanel />
      </div>

      {/* Proposal Modal */}
      <ProposalModal />
      <MemeTokenModal
        showMemeTokenModal={showMemeTokenModal}
        setShowMemeTokenModal={setShowMemeTokenModal}
        memeTokenContract={memeTokenContract}
        totalSupply={totalSupply}
        owner={owner}
      />
    </div>
  );
}
