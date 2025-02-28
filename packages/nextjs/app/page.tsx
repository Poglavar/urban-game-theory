"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import MapView from "~~/components/map/MapView";
import type { Parcel } from "~~/types/parcel";

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
  buildingDetails: BuildingDetails;
}

export default function Home() {
  const { address } = useAccount();
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [activeTab, setActiveTab] = useState("my");

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
    const [isConditional, setIsConditional] = useState(false);
    const [ethAmount, setEthAmount] = useState("");
    const [cityTokenAmount, setCityTokenAmount] = useState("");

    return (
      <dialog id="proposal_modal" className={`modal modal-bottom sm:modal-top ${showProposalModal ? 'modal-open' : ''}`} style={{ zIndex: 1000 }}>
        <div className="modal-box relative z-[1000] mt-8 mx-auto !w-[33vw] !max-w-[33vw]">
          <h3 className="font-bold text-lg mb-4">Create New Proposal</h3>
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Proposal Name</span>
              </label>
              <input
                type="text"
                placeholder="Enter proposal name"
                className="input input-bordered w-full"
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
                className="textarea textarea-bordered w-full h-24"
                value={proposalDescription}
                onChange={(e) => setProposalDescription(e.target.value)}
              />
            </div>
            <div>
              <h4 className="font-semibold mb-2">Selected Parcels:</h4>
              <div className="bg-base-200 p-2 rounded">
                {selectedParcels.map(parcel => (
                  <div key={parcel.id} className="text-sm">
                    {parcel.id}
                  </div>
                ))}
              </div>
            </div>
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={isConditional}
                  onChange={(e) => setIsConditional(e.target.checked)}
                />
                <span className="label-text">Conditional</span>
                <div className="tooltip" data-tip="If checked, the proposal executes only if all parcels accept it. Otherwise each accepting parcel gets a proportional share of the attached crypto">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
              </label>
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
                className="input input-bordered w-full"
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
                className="input input-bordered w-full"
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
                  className="btn btn-primary"
                  onClick={() => {
                    // Handle minting logic here
                    console.log("Minting proposal:", {
                      proposalName,
                      proposalDescription,
                      parcels: selectedParcels,
                      isConditional,
                      ethAmount,
                      cityTokenAmount
                    });
                  }}
                >
                  Mint and Fund
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
        <div className="modal-backdrop bg-neutral-900/50" style={{ zIndex: 999 }} onClick={() => setShowProposalModal(false)}>
          <button>close</button>
        </div>
      </dialog>
    );
  };

  // Update ControlsPanel to handle modal
  const ControlsPanel = () => {
    return (
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Controls</h2>
        <div className="space-y-4">
          <div>
            <button
              className={`btn btn-primary w-full ${isAnalyzing ? 'loading' : ''}`}
              onClick={() => {
                setIsAnalyzing(true);
                (window as any).analyzeArea?.();
              }}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Loading...' : 'Load Parcel Data'}
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
        </div>
      </div>
    );
  };

  // Placeholder for list component
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
                        setSelectedParcels(prevParcels => prevParcels.filter(p => p.id !== parcel.id));
                        onParcelSelect?.(parcel.id, null);
                      }}
                    >
                      ✕
                    </button>
                    <h3 className="text-xl font-semibold mb-2">Parcel</h3>
                    <p>ID: {parcel.id}</p>
                    <p className="text-sm text-base-content/70">Building: {parcel.buildingDetails.tags.building || 'Unknown'}</p>
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

  // Placeholder for details component
  const DetailsPanel = ({ selectedBuilding }: { selectedBuilding: BuildingDetails | null }) => {
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

    return (
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Details</h2>
        {selectedBuilding ? (
          <div className="space-y-2">
            <div className="bg-base-200 p-4 rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Building Information</h3>
              <p>ID: {selectedBuilding.id}</p>
              <p>Area: {(selectedBuilding.area * 1000000).toFixed(1)} m²</p>
              <p>Location: {selectedBuilding.center.lat.toFixed(6)}, {selectedBuilding.center.lon.toFixed(6)}</p>
              {selectedBuilding.geometry && (
                <div className="mt-2">
                  <p className="font-semibold">Dimensions</p>
                  <div className="space-y-1">
                    {(() => {
                      const { width, height } = calculateDimensions(selectedBuilding.geometry);
                      return (
                        <>
                          <p>Width: ~{width} m</p>
                          <p>Height: ~{height} m</p>
                          <p>Vertices: {selectedBuilding.geometry.length}</p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {selectedBuilding.parcelId ? (
              <div className="bg-base-200 p-4 rounded-lg">
                <h3 className="text-xl font-semibold mb-2">Land Parcel</h3>
                <p>Parcel ID: {selectedBuilding.parcelId}</p>
                <p className="text-sm text-base-content/70">This building is part of the highlighted land parcel</p>
              </div>
            ) : (
              <div className="bg-warning/20 p-4 rounded-lg">
                <h3 className="text-xl font-semibold mb-2">Land Parcel</h3>
                <p className="text-warning-content">No land parcel information available for this building</p>
              </div>
            )}

            {Object.entries(selectedBuilding.tags).length > 0 && (
              <div className="bg-base-200 p-4 rounded-lg">
                <h3 className="text-xl font-semibold mb-2">Building Tags</h3>
                <div className="space-y-1">
                  {Object.entries(selectedBuilding.tags).map(([key, value]) => (
                    <p key={key} className="text-sm">
                      <span className="font-semibold">{key}:</span> {value}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-base-200 p-4 rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Offers</h3>
              <p>No offers yet</p>
            </div>

            <div className="bg-base-200 p-4 rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Proposals</h3>
              <p>No proposals yet</p>
            </div>
          </div>
        ) : (
          <p>No building selected</p>
        )}
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
            setIsAnalyzing(false);
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

      {/* Lower Right - Details */}
      <div className="w-1/2 h-1/2 overflow-auto">
        <DetailsPanel selectedBuilding={selectedParcels[selectedParcels.length - 1]?.buildingDetails || null} />
      </div>

      {/* Proposal Modal */}
      <ProposalModal />
    </div>
  );
}
