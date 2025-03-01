"use client";

import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { useAccount } from "wagmi";
import { useWalletClient } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract, useScaffoldContract } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldContractWrite } from "~~/hooks/scaffold-eth/useScaffoldContractWrite";
import MapView from "~~/components/map/MapView";
import type { Parcel } from "~~/types/parcel";
import { toPng } from "html-to-image";
import { notification } from "~~/utils/scaffold-eth";
import type { Contract } from "~~/utils/scaffold-eth/contract";
import React from "react";
import { formatEther, parseEther, parseUnits } from "viem";

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
  tokenId: bigint;
  metadata: ProposalMetadata;
  parcelIds: string[];
  ethAmount: bigint;
  tokenAmount: bigint;
  acceptanceCount: number;
}

interface ProposalResponse {
  parcelIds: readonly string[];
  isConditional: boolean;
  imageURI: string;
  isActive: boolean;
}

// Add this interface with the other interfaces at the top of the file
interface OwnedParcel {
  id: string;
  owner: string;
  osmId: string;
}

// Update ControlsPanel to be memoized and only receive necessary props
const ControlsPanel = React.memo(({
  isAnalyzingParcels,
  setIsAnalyzingParcels,
  hasSelectedParcels,
  onCreateProposal,
  onLoadProposals,
  onShowMemeToken,
  isLoadingProposals,
}: {
  isAnalyzingParcels: boolean;
  setIsAnalyzingParcels: (value: boolean) => void;
  hasSelectedParcels: boolean;
  onCreateProposal: () => void;
  onLoadProposals: () => void;
  onShowMemeToken: () => void;
  isLoadingProposals: boolean;
}) => {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Controls</h2>
      <div className="space-y-4">
        <div>
          <button
            className="btn btn-primary w-full"
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
            disabled={!hasSelectedParcels}
            onClick={onCreateProposal}
          >
            Create Proposal
          </button>
        </div>
        <div>
          <button
            className={`btn btn-accent w-full flex items-center justify-center gap-2`}
            onClick={onLoadProposals}
            disabled={isLoadingProposals}
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
            onClick={onShowMemeToken}
          >
            Meme Token Status
          </button>
        </div>
      </div>
    </div>
  );
});

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

// Update the ListPanel component
const ListPanel = React.memo(({ onParcelSelect, proposals, selectedMyParcel }: {
  onParcelSelect?: (parcelId: string | null, buildingDetails: BuildingDetails | null) => void;
  proposals: ProposalData[];
  selectedMyParcel: string | null;
}) => {
  const { selectedParcels, activeTab, setActiveTab, parcelOwners, parcelNFTContract, setParcelOwners, setHighlightedParcelIds, setFilteredProposals, setSelectedMyParcel } = useContext(AppContext);
  const { address } = useAccount();
  const [ownedParcels, setOwnedParcels] = useState<OwnedParcel[]>([]);
  const [isLoadingOwned, setIsLoadingOwned] = useState(false);
  const [hasLoadedParcels, setHasLoadedParcels] = useState(false);
  const [lastLoadedAddress, setLastLoadedAddress] = useState<string | undefined>();

  const fetchParcelOwner = useCallback(async (parcelId: string) => {
    if (!parcelNFTContract) {
      console.error('ParcelNFT contract not initialized');
      return;
    }

    try {
      const owner = await parcelNFTContract.read.ownerOf([BigInt(parcelId)]);
      console.log('Owner found for parcel', parcelId, ':', owner);
      setParcelOwners(prev => ({ ...prev, [parcelId]: owner }));
    } catch (error: any) {
      if (error.message && (
        error.message.includes("ERC721Nonexistent") ||
        error.message.includes("nonexistent token") ||
        error.message.includes("ownerOf reverted")
      )) {
        console.log('Parcel', parcelId, 'is not minted yet');
        setParcelOwners(prev => ({ ...prev, [parcelId]: "Not minted" }));
      } else {
        console.error('Error checking ownership for parcel', parcelId, ':', error);
        setParcelOwners(prev => ({ ...prev, [parcelId]: "Error checking ownership" }));
      }
    }
  }, [parcelNFTContract, setParcelOwners]);

  // Effect to fetch owners for selected parcels
  useEffect(() => {
    if (activeTab === "selected" && selectedParcels.length > 0 && parcelNFTContract) {
      selectedParcels.forEach(parcel => {
        if (!parcelOwners[parcel.id]) {
          fetchParcelOwner(parcel.id);
        }
      });
    }
  }, [activeTab, selectedParcels, parcelNFTContract, parcelOwners, fetchParcelOwner]);

  const handleParcelClick = useCallback((parcelId: string) => {
    if (activeTab === "my") {
      // For My Parcels tab, toggle the selectedMyParcel and update filtered proposals
      setSelectedMyParcel(prevSelected => {
        const newSelected = prevSelected === parcelId ? null : parcelId;
        // Only update filtered proposals if there's a change in selection
        if (prevSelected !== newSelected) {
          if (newSelected) {
            const filtered = proposals.filter(proposal => proposal.parcelIds.includes(parcelId));
            setFilteredProposals(filtered.length > 0 ? filtered : []);
          } else {
            setFilteredProposals([]);
          }
        }
        return newSelected;
      });

      // Update highlighted parcels only if in "my" tab
      setHighlightedParcelIds([parcelId]);
    } else {
      // For Selected tab, find the parcel in ownedParcels to get its details
      const parcel = ownedParcels.find(p => p.id === parcelId);
      if (parcel) {
        onParcelSelect?.(parcelId, {
          id: parcel.id,
          area: 0,
          center: { lat: 0, lon: 0 },
          tags: {},
          geometry: []
        });
      }

      // Filter proposals for this parcel
      const filtered = proposals.filter(proposal => proposal.parcelIds.includes(parcelId));
      setFilteredProposals(filtered);
    }
  }, [activeTab, ownedParcels, onParcelSelect, proposals, setFilteredProposals, setHighlightedParcelIds, setSelectedMyParcel]);

  // Fetch owned parcels only when necessary
  useEffect(() => {
    const shouldFetchParcels =
      activeTab === "my" &&
      parcelNFTContract &&
      address &&
      (!hasLoadedParcels || lastLoadedAddress !== address);

    const fetchOwnedParcels = async () => {
      if (!shouldFetchParcels) {
        console.log('Skipping parcel fetch because:', {
          activeTab,
          hasContract: !!parcelNFTContract,
          hasAddress: !!address,
          hasLoadedParcels,
          lastLoadedAddress,
          currentAddress: address
        });
        return;
      }

      setIsLoadingOwned(true);
      try {
        console.log('Starting to fetch owned parcels for address:', address);
        console.log('Using ParcelNFT contract:', parcelNFTContract);

        if (!parcelNFTContract) {
          throw new Error('ParcelNFT contract is not initialized');
        }

        // Get the number of parcels owned by the address
        const balance = await parcelNFTContract.read.balanceOf([address]);
        console.log('Balance of owned parcels:', balance.toString());

        const owned: OwnedParcel[] = [];
        // Iterate through each owned token
        for (let i = 0; i < Number(balance); i++) {
          try {
            // Get token ID at index i for the owner
            const tokenId = await parcelNFTContract.read.tokenOfOwnerByIndex([address, BigInt(i)]);
            console.log(`Found token ${i}:`, tokenId.toString());

            // Get parcel details
            const parcel = await parcelNFTContract.read.getParcel([tokenId]);
            console.log(`Parcel details for token ${tokenId}:`, parcel);

            owned.push({
              id: tokenId.toString(),
              owner: address,
              osmId: parcel.osmId.toString()
            } as OwnedParcel);
            console.log(`Successfully added parcel ${tokenId} to owned list`);
          } catch (error) {
            console.error(`Error fetching token at index ${i}:`, error);
            if (error instanceof Error) {
              console.error('Error details:', {
                message: error.message,
                stack: error.stack
              });
            }
          }
        }

        console.log('Final list of owned parcels:', owned);
        setOwnedParcels(owned);
        setHasLoadedParcels(true);
        setLastLoadedAddress(address);
      } catch (error) {
        console.error('Error in fetchOwnedParcels:', error);
        if (error instanceof Error) {
          console.error('Error details:', {
            message: error.message,
            stack: error.stack
          });
        }
        // Reset state on error
        setOwnedParcels([]);
        setHasLoadedParcels(false);
        setLastLoadedAddress(undefined);
      } finally {
        setIsLoadingOwned(false);
      }
    };

    fetchOwnedParcels();
  }, [parcelNFTContract, address, activeTab, hasLoadedParcels, lastLoadedAddress]);

  // Reset loaded state when address changes
  useEffect(() => {
    if (lastLoadedAddress !== address) {
      setHasLoadedParcels(false);
      setLastLoadedAddress(undefined);
    }
  }, [address, lastLoadedAddress]);

  // Render owned parcels list
  const renderOwnedParcels = useCallback(() => {
    if (!address) {
      return (
        <div className="text-center py-8">
          <p className="text-base-content/70 mb-4">Connect your wallet to view your parcels</p>
          <RainbowKitCustomConnectButton />
        </div>
      );
    }

    if (isLoadingOwned) {
      return (
        <div className="text-center py-8">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4 text-base-content/70">Loading your parcels...</p>
        </div>
      );
    }

    if (ownedParcels.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-base-content/70">You don't own any parcels yet</p>
        </div>
      );
    }

    // Create array of parcels with their proposal counts
    const parcelsWithCounts = ownedParcels.map(parcel => ({
      parcel,
      proposalCount: proposals.filter(proposal => proposal.parcelIds.includes(parcel.id)).length
    }));

    // Sort by proposal count in descending order
    parcelsWithCounts.sort((a, b) => b.proposalCount - a.proposalCount);

    return parcelsWithCounts.map(({ parcel, proposalCount }) => (
      <div
        key={parcel.id}
        className={`bg-base-200 p-4 rounded-lg cursor-pointer hover:bg-base-300 transition-colors ${selectedMyParcel === parcel.id ? 'border-2 border-primary' : ''
          }`}
        onClick={() => handleParcelClick(parcel.id)}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-xl font-semibold mb-2">Parcel {parcel.id}</h3>
          <div className="badge badge-accent badge-lg gap-1">
            {proposalCount} Proposals
          </div>
        </div>
        <p className="text-sm text-base-content/70 mt-1">
          Owner: <span className="font-mono">{parcel.owner}</span>
        </p>
      </div>
    ));
  }, [address, isLoadingOwned, ownedParcels, handleParcelClick, proposals, selectedMyParcel]);

  // Render selected parcels list
  const renderSelectedParcels = useCallback(() => {
    if (selectedParcels.length === 0) {
      return <p>No parcels selected</p>;
    }

    return selectedParcels.map((parcel) => (
      <div key={parcel.id} className="bg-base-200 p-4 rounded-lg relative">
        <button
          className="btn btn-ghost btn-xs absolute top-2 right-2"
          onClick={() => onParcelSelect?.(parcel.id, null)}
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
        <p className="text-sm text-base-content/70 mt-1">
          Owner: {parcelOwners[parcel.id] === "Not minted" ? (
            <span className="text-warning">Not minted</span>
          ) : parcelOwners[parcel.id] ? (
            <span className="font-mono">{parcelOwners[parcel.id]}</span>
          ) : (
            <span className="loading loading-dots">Loading</span>
          )}
        </p>
      </div>
    ));
  }, [selectedParcels, parcelOwners, onParcelSelect]);

  return (
    <div className="p-4">
      <div role="tablist" className="tabs tabs-lifted">
        <a
          role="tab"
          className={`tab tab-lg ${activeTab === "my" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("my")}
        >
          My Parcels {ownedParcels.length > 0 ? `(${ownedParcels.length})` : ''}
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
        <div className="space-y-2">
          {activeTab === "selected" ? renderSelectedParcels() : renderOwnedParcels()}
        </div>
      </div>
    </div>
  );
});

// Create AppContext
const AppContext = React.createContext<{
  selectedParcels: SelectedParcel[];
  selectedMyParcel: string | null;
  setSelectedMyParcel: React.Dispatch<React.SetStateAction<string | null>>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  parcelOwners: Record<string, string>;
  parcelNFTContract: Contract<any> | null;
  setParcelOwners: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  firstProposal: any;
  setShowProposalModal: (show: boolean) => void;
  highlightedParcelIds: string[];
  setHighlightedParcelIds: (ids: string[]) => void;
  setFilteredProposals: React.Dispatch<React.SetStateAction<ProposalData[]>>;
}>({
  selectedParcels: [],
  selectedMyParcel: null,
  setSelectedMyParcel: () => { },
  activeTab: "my",
  setActiveTab: () => { },
  parcelOwners: {},
  parcelNFTContract: null,
  setParcelOwners: () => { },
  firstProposal: null,
  setShowProposalModal: () => { },
  highlightedParcelIds: [],
  setHighlightedParcelIds: () => { },
  setFilteredProposals: () => { },
});

// Update ProposalsPanel to be memoized
const ProposalsPanel = React.memo(({ proposals, loadAllProposals, nativeCurrencyPrice }: {
  proposals: ProposalData[];
  loadAllProposals: () => Promise<void>;
  nativeCurrencyPrice?: number;
}) => {
  const { selectedMyParcel, setHighlightedParcelIds, activeTab } = useContext(AppContext);
  const [selectedProposal, setSelectedProposal] = useState<ProposalData | null>(null);
  const [acceptedProposals, setAcceptedProposals] = useState<Record<string, boolean>>({});
  const [isCheckingAcceptance, setIsCheckingAcceptance] = useState(false);
  const { writeContractAsync: writeProposalNFT } = useScaffoldWriteContract({
    contractName: "ProposalNFT",
  });
  const { data: proposalNFTContract } = useScaffoldContract({
    contractName: "ProposalNFT",
  }) as { data: Contract<any> | null };

  const handleAcceptProposal = async (proposalId: bigint, parcelId: string | null) => {
    if (!parcelId) {
      notification.error("No parcel selected");
      return;
    }

    try {
      notification.info("Accepting proposal...");
      console.log("Accepting proposal with ID:", proposalId.toString(), "and parcel:", parcelId);

      const txHash = await writeProposalNFT({
        functionName: "acceptProposal",
        args: [proposalId, parcelId],
      });

      notification.info("Waiting for transaction confirmation...");
      await txHash;
      notification.success("Proposal accepted successfully!");

      // Reload proposals to update acceptance count
      await loadAllProposals();
    } catch (error) {
      console.error("Error accepting proposal:", error);
      notification.error(error instanceof Error ? error.message : "Failed to accept proposal");
    }
  };

  const handleDonateToProposal = async (proposal: ProposalData) => {
    if (!proposalNFTContract) {
      notification.error("Contract not initialized");
      return;
    }

    try {
      notification.info("Processing donation...");
      const txHash = await writeProposalNFT({
        functionName: "depositFunds",
        args: [proposal.tokenId],
        value: parseEther("0.1"), // Default donation of 0.1 ETH
      });

      notification.info("Waiting for transaction confirmation...");
      await txHash;
      notification.success("Successfully donated to proposal!");

      // Reload proposals to update the budget
      await loadAllProposals();
    } catch (error) {
      console.error("Error donating to proposal:", error);
      notification.error(error instanceof Error ? error.message : "Failed to donate to proposal");
    }
  };

  // Check acceptance status only when dependencies change
  useEffect(() => {
    const checkAcceptance = async () => {
      if (!proposalNFTContract || !selectedMyParcel || isCheckingAcceptance) {
        return;
      }

      setIsCheckingAcceptance(true);
      try {
        const newAcceptedProposals: Record<string, boolean> = {};

        // Process proposals in batches to avoid overwhelming the network
        for (const proposal of proposals) {
          try {
            const result = await proposalNFTContract.read.hasAccepted([proposal.tokenId, selectedMyParcel]);
            newAcceptedProposals[proposal.tokenId.toString()] = result;
          } catch (error) {
            console.error("Error checking acceptance for proposal", proposal.tokenId.toString(), error);
            newAcceptedProposals[proposal.tokenId.toString()] = false;
          }
        }

        setAcceptedProposals(newAcceptedProposals);
      } catch (error) {
        console.error("Error checking proposal acceptance:", error);
      } finally {
        setIsCheckingAcceptance(false);
      }
    };

    checkAcceptance();
  }, [proposalNFTContract, selectedMyParcel, proposals]);

  // Reset accepted proposals when selectedMyParcel changes
  useEffect(() => {
    if (!selectedMyParcel) {
      setAcceptedProposals({});
    }
  }, [selectedMyParcel]);

  const calculateBudget = (ethAmount: bigint, tokenAmount: bigint) => {
    const ethValue = Number(ethAmount) / 1e18 * (nativeCurrencyPrice || 0);
    const tokenValue = Number(tokenAmount) / 1e18 * 0.008; // Hardcoded city token price
    return ethValue + tokenValue;
  };

  const handleProposalClick = (proposal: ProposalData) => {
    setSelectedProposal(proposal);
    setHighlightedParcelIds(proposal.parcelIds);
  };

  // Sort proposals by budget
  const sortedProposals = [...proposals].sort((a, b) => {
    const budgetA = calculateBudget(a.ethAmount, a.tokenAmount);
    const budgetB = calculateBudget(b.ethAmount, b.tokenAmount);
    return budgetB - budgetA;
  });

  // Function to check if a proposal can be accepted by the selected parcel
  const canAcceptProposal = (proposal: ProposalData) => {
    // Add debug logging
    console.log('Checking if can accept proposal:', {
      proposalId: proposal.tokenId,
      activeTab,
      hasSelectedMyParcel: !!selectedMyParcel,
      selectedMyParcel,
      proposalParcelIds: proposal.parcelIds,
      wouldIncludeSelectedParcel: selectedMyParcel ? proposal.parcelIds.includes(selectedMyParcel) : false
    });

    // Only show accept button if:
    // 1. We're in the "my" tab
    // 2. There is a selected parcel from My Parcels
    // 3. The proposal includes the selected parcel
    // 4. The parcel hasn't already accepted this proposal
    return activeTab === "my" &&
      !!selectedMyParcel &&
      proposal.parcelIds.includes(selectedMyParcel);
  };

  // Add donation function
  const handleDonation = async (proposal: ProposalData) => {
    if (!writeProposalNFT) {
      notification.error("Contract not initialized");
      return;
    }

    try {
      notification.info("Processing donation...");
      const txHash = await writeProposalNFT({
        functionName: "donate",
        args: [proposal.tokenId],
        value: parseEther("0.1"), // Default donation of 0.1 ETH
      });

      notification.info("Waiting for transaction confirmation...");
      await txHash;
      notification.success("Thank you for your donation!");

      // Reload proposals to update the budget
      await loadAllProposals();
    } catch (error) {
      console.error("Error donating:", error);
      notification.error(error instanceof Error ? error.message : "Failed to donate");
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Proposals</h2>
      <div className="space-y-4">
        {sortedProposals.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {sortedProposals.map((proposal) => (
              <div
                key={proposal.tokenId.toString()}
                className="card bg-base-100 shadow-xl cursor-pointer hover:bg-opacity-70 transition-colors"
                onClick={() => handleProposalClick(proposal)}
              >
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="card-title text-lg">{proposal.metadata.name}</h3>
                      <span className={`badge ${proposal.metadata.type === "Road" ? "bg-amber-200 text-amber-800 border-amber-300" :
                        proposal.metadata.type === "Park" ? "bg-emerald-200 text-emerald-800 border-emerald-300" :
                          proposal.metadata.type === "Square" ? "bg-slate-100 text-slate-800 border-slate-200" :
                            proposal.metadata.type === "Buildings" ? "bg-zinc-300 text-zinc-800 border-zinc-400" :
                              "badge-accent"
                        }`}>{proposal.metadata.type}</span>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="badge badge-lg bg-success/10 text-success border-success/20">
                        ${calculateBudget(proposal.ethAmount, proposal.tokenAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <button
                        className="btn btn-xs btn-outline btn-success"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDonation(proposal);
                        }}
                      >
                        Donate to budget
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-base-content/70 mb-2">{proposal.metadata.description}</p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                    <div className="flex gap-2">
                      <span className="text-base-content/70">Parcels:</span>
                      <span className="font-medium">{proposal.parcelIds.length}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-base-content/70">Progress:</span>
                      <div className="flex gap-1 items-center">
                        {[...Array(proposal.parcelIds.length)].map((_, index) => (
                          <div
                            key={index}
                            className={`w-2 h-2 rounded-full ${index < (proposal.acceptanceCount || 0)
                                ? "bg-success"
                                : "border border-base-content/30"
                              }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-base-content/70">Status:</span>
                      <span className="text-success">Active</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-base-content/70">Conditional:</span>
                      <span>{proposal.metadata.attributes.find(attr => attr.trait_type === "Conditional")?.value || "No"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-base-content/70">Share Upside:</span>
                      <span>{proposal.metadata.attributes.find(attr => attr.trait_type === "Share Upside")?.value || "No"}</span>
                    </div>
                  </div>
                  {canAcceptProposal(proposal) && (
                    <div className="mt-4 flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {acceptedProposals[proposal.tokenId.toString()] ? (
                        <div className="badge badge-success gap-2 p-4">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-4 h-4 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                          Accepted
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptProposal(proposal.tokenId, selectedMyParcel);
                          }}
                        >
                          Accept Proposal
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-base-content/70">No proposals loaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
});

export default function Home() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([]);
  const [selectedMyParcel, setSelectedMyParcel] = useState<string | null>(null);
  const [isAnalyzingParcels, setIsAnalyzingParcels] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showMemeTokenModal, setShowMemeTokenModal] = useState(false);
  const [activeTab, setActiveTab] = useState("my");
  const [cityTokenAmount, setCityTokenAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [memeTokenData, setMemeTokenData] = useState<any>(null);
  const [isLoadingMemeData, setIsLoadingMemeData] = useState(false);
  const [highlightedParcelIds, setHighlightedParcelIds] = useState<string[]>([]);
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [filteredProposals, setFilteredProposals] = useState<ProposalData[]>([]);

  const { writeAsync: writeProposalNFT } = useScaffoldWriteContract({
    contractName: "ProposalNFT",
  });

  const { data: memeTokenContract } = useScaffoldContract({
    contractName: "CityMemeToken",
  }) as { data: Contract<any> | null };

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

  // Update the ParcelNFT contract hook with proper typing and options
  const { data: parcelNFTContract, isLoading: isParcelNFTLoading } = useScaffoldContract({
    contractName: "ParcelNFT",
    walletClient: walletClient,
  }) as { data: Contract<any> | null; isLoading: boolean };

  // Add this state to store parcel owners
  const [parcelOwners, setParcelOwners] = useState<Record<string, string>>({});

  // Add these hooks at the top level with other hooks
  const { data: proposalData } = useScaffoldReadContract({
    contractName: "ProposalNFT",
    functionName: "getProposal",
    args: [BigInt(0)],
  });

  const { data: tokenURIData } = useScaffoldReadContract({
    contractName: "ProposalNFT",
    functionName: "tokenURI",
    args: [BigInt(0)],
  });

  // Add ProposalNFT contract hook
  const { data: proposalNFTContract } = useScaffoldContract({
    contractName: "ProposalNFT",
    walletClient: walletClient,
  }) as { data: Contract<any> | null };

  // Update the loadAllProposals function to be memoized
  const loadAllProposals = useCallback(async () => {
    if (!proposalNFTContract) {
      console.log('ProposalNFT contract not initialized:', proposalNFTContract);
      notification.error("Contract not initialized");
      return;
    }

    console.log('Starting to load proposals with contract:', {
      address: proposalNFTContract.address,
      functions: Object.keys(proposalNFTContract.read || {})
    });

    setIsLoadingProposals(true);
    try {
      const loadedProposals: ProposalData[] = [];

      // Get total number of proposals using ERC721Enumerable
      const totalSupply = await proposalNFTContract.read.totalSupply();
      console.log('Total supply of proposals:', totalSupply.toString());

      // Load each proposal by index
      for (let i = 0; i < Number(totalSupply); i++) {
        try {
          console.log(`Loading proposal ${i} of ${totalSupply}...`);
          // Get token ID at current index
          const tokenId = await proposalNFTContract.read.tokenByIndex([BigInt(i)]);
          console.log(`Token ID at index ${i}:`, tokenId.toString());

          // Get proposal data
          const proposal = await proposalNFTContract.read.getProposal([tokenId]);
          console.log(`Proposal data for token ${tokenId}:`, proposal);

          // Skip inactive proposals
          if (!proposal || !proposal[3]) {  // index 3 is isActive in the array
            console.log(`Skipping inactive proposal ${tokenId}`);
            continue;
          }

          // Get token URI
          const uri = await proposalNFTContract.read.tokenURI([tokenId]);
          console.log(`Token URI for ${tokenId}:`, uri);
          if (!uri) {
            console.log(`No URI for proposal ${tokenId}, skipping`);
            continue;
          }

          // Remove ipfs:// prefix if present
          const cleanUri = uri.replace("ipfs://", "");
          console.log(`Fetching metadata from: https://gateway.pinata.cloud/ipfs/${cleanUri}`);

          // Fetch metadata from IPFS via Pinata gateway
          const metadataResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${cleanUri}`);
          if (!metadataResponse.ok) {
            console.warn(`Failed to fetch metadata for token ${tokenId}: ${metadataResponse.status} ${metadataResponse.statusText}`);
            continue;
          }

          const metadata = await metadataResponse.json();
          console.log(`Metadata for token ${tokenId}:`, metadata);

          loadedProposals.push({
            tokenId: tokenId,
            metadata,
            parcelIds: [...proposal[0]],
            ethAmount: proposal[4],
            tokenAmount: proposal[5],
            acceptanceCount: proposal[6]
          });
          console.log(`Successfully added proposal ${tokenId} to loaded proposals`);

        } catch (error) {
          console.error(`Error loading proposal at index ${i}:`, error);
          if (error instanceof Error) {
            console.error('Error details:', {
              message: error.message,
              stack: error.stack
            });
          }
          continue;
        }
      }

      console.log('Final loaded proposals:', loadedProposals);

      if (loadedProposals.length === 0) {
        console.log('No active proposals found');
        notification.warning("No active proposals found");
        return;
      }

      notification.success(`Loaded ${loadedProposals.length} active proposal${loadedProposals.length === 1 ? '' : 's'}`);
      setProposals(loadedProposals);

    } catch (error) {
      console.error("Error loading proposals:", error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
      notification.error(error instanceof Error ? error.message : "Failed to load proposals");
    } finally {
      setIsLoadingProposals(false);
    }
  }, [proposalNFTContract, setIsLoadingProposals, setProposals]);

  // Add effect to clear filtered proposals when loading all proposals
  useEffect(() => {
    setFilteredProposals([]);
  }, [proposals]);

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

    // First, approve the CityToken if needed
    const { writeAsync: approveCityToken } = useScaffoldWriteContract({
      contractName: "CityMemeToken",
    });

    // Then use mintAndFund
    const { writeAsync: writeProposalNFT } = useScaffoldWriteContract({
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

        const ethValue = ethAmount ? parseEther(ethAmount) : 0n;
        const tokenValue = cityTokenAmount ? parseUnits(cityTokenAmount, 18) : 0n;

        // If city tokens are being used, approve them first
        if (tokenValue > 0n) {
          notification.info("Approving City Tokens...");
          const contractAddress = parcelNFTContract?.address;
          console.log('ParcelNFT Contract Address:', contractAddress);
          await approveCityToken({
            functionName: "approve",
            args: [
              proposalNFTContract?.address,
              tokenValue
            ],
          });
        }

        notification.info("Minting NFT...");
        console.log("Minting with args:", {
          address,
          parcelIds: selectedParcels.map(parcel => parcel.id),
          isConditional,
          ipfsUrl,
          ethAmount: ethValue,
          cityTokenAmount: tokenValue
        });

        await writeProposalNFT({
          functionName: "mintAndFund",
          args: [
            address,
            selectedParcels.map(parcel => parcel.id),
            isConditional,
            ipfsUrl,
            ethValue,
            tokenValue
          ],
          value: ethValue,
        });

        notification.success("Proposal created successfully!");
        setShowProposalModal(false);

        // Reload proposals after successful mint
        await loadAllProposals();
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
                  className={`btn btn-primary ${isLoading ? 'loading' : ''}`}
                  onClick={() => {
                    console.log("Mint button clicked");
                    handleMint();
                  }}
                  disabled={isLoading || selectedParcels.length === 0}
                >
                  {isLoading ? 'Minting...' : 'Mint and Fund'}
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
    memeTokenContract: Contract<any> | null;
    totalSupply: bigint | undefined;
    owner: string | undefined;
  }) => {
    return (
      <dialog id="meme_token_modal" className={`modal modal-bottom sm:modal-top ${showMemeTokenModal ? 'modal-open' : ''}`} style={{ zIndex: 1000 }}>
        <div className="modal-box relative z-[1000] mt-8 mx-auto !w-[66vw] !max-w-[66vw] !rounded-[1rem] bg-gradient-to-br from-indigo-900 via-blue-900 to-purple-900 text-white" style={{ borderRadius: '1rem' }}>
          <h3 className="font-bold text-lg mb-4">City Meme Token Status</h3>
          <div className="space-y-4">
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <div className="space-y-2">
                <p><span className="font-medium">Current Market Value:</span> $0.008</p>
                <p><span className="font-medium">Current Market Cap:</span> ${((totalSupply ?
                  Number(totalSupply) / 10 ** 18 : 0) * 0.008).toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <div className="space-y-2">
                <p><span className="font-medium">Name:</span> Zagreb Meme Token</p>
                <p><span className="font-medium">Symbol:</span> ZAGREB</p>
                <p><span className="font-medium">Deployment Date:</span> March 1, 2025</p>
                <p>
                  <span className="font-medium">Contract Address:</span>{' '}
                  {memeTokenContract && (
                    <a
                      href={`https://sepolia.etherscan.io/address/${memeTokenContract.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link text-blue-300 hover:text-blue-200"
                    >
                      {memeTokenContract.address}
                    </a>
                  )}
                </p>
                <p>
                  <span className="font-medium">Contract Creator:</span>{' '}
                  {owner ? (
                    <a
                      href={`https://sepolia.etherscan.io/address/${owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link text-blue-300 hover:text-blue-200"
                    >
                      {owner}
                    </a>
                  ) : (
                    <span className="text-white/70">Not available</span>
                  )}
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
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

  const handleParcelSelect = useCallback((parcelId: string | null, buildingDetails: BuildingDetails | null) => {
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
  }, [setActiveTab]);

  const handleCreateProposal = useCallback(() => {
    setShowProposalModal(true);
  }, []);

  const handleShowMemeToken = useCallback(() => {
    setShowMemeTokenModal(true);
  }, []);

  const contextValue = {
    selectedParcels,
    selectedMyParcel,
    setSelectedMyParcel,
    activeTab,
    setActiveTab,
    parcelOwners,
    parcelNFTContract,
    setParcelOwners,
    firstProposal,
    setShowProposalModal,
    highlightedParcelIds,
    setHighlightedParcelIds,
    setFilteredProposals,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="flex flex-wrap h-screen">
        {/* Upper Left - Map */}
        <div className="w-1/2 h-1/2 border-r border-b border-base-300">
          <MapView
            onParcelSelect={handleParcelSelect}
            onAnalyze={() => setIsAnalyzingParcels(false)}
            selectedParcelIds={selectedParcels.map(p => p.id)}
            highlightedParcelIds={highlightedParcelIds}
            isAnalyzing={isAnalyzingParcels}
          />
        </div>

        {/* Upper Right - Controls */}
        <div className="w-1/2 h-1/2 border-b border-base-300">
          <ControlsPanel
            isAnalyzingParcels={isAnalyzingParcels}
            setIsAnalyzingParcels={setIsAnalyzingParcels}
            hasSelectedParcels={selectedParcels.length > 0}
            onCreateProposal={handleCreateProposal}
            onLoadProposals={loadAllProposals}
            onShowMemeToken={handleShowMemeToken}
            isLoadingProposals={isLoadingProposals}
          />
        </div>

        {/* Lower Left - List */}
        <div className="w-1/2 h-1/2 border-r border-base-300 overflow-auto">
          <ListPanel onParcelSelect={handleParcelSelect} proposals={proposals} selectedMyParcel={selectedMyParcel} />
        </div>

        {/* Lower Right - Proposals */}
        <div className="w-1/2 h-1/2 overflow-auto">
          <ProposalsPanel
            proposals={filteredProposals.length > 0 ? filteredProposals : proposals}
            loadAllProposals={loadAllProposals}
            nativeCurrencyPrice={0.008}
          />
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
    </AppContext.Provider>
  );
}
