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

  // Placeholder for controls component
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
              {isAnalyzing ? 'Analyzing...' : 'Analyze Area'}
            </button>
          </div>
          <div>
            <button
              className="btn btn-secondary w-full"
              disabled={selectedParcels.length === 0}
            >
              Create Proposal
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Placeholder for list component
  const ListPanel = () => {
    return (
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Selected Parcels</h2>
        <div className="space-y-2">
          {selectedParcels.length > 0 ? (
            selectedParcels.map((parcel) => (
              <div key={parcel.id} className="bg-base-200 p-4 rounded-lg relative">
                <button
                  className="btn btn-ghost btn-xs absolute top-2 right-2"
                  onClick={() => {
                    setSelectedParcels(selectedParcels.filter(p => p.id !== parcel.id));
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
          onParcelSelect={(parcelId, buildingDetails) => {
            if (!parcelId || !buildingDetails) return;

            setSelectedParcels(prevParcels => {
              const existingParcelIndex = prevParcels.findIndex(p => p.id === parcelId);

              if (existingParcelIndex >= 0) {
                // Remove the parcel if it's already selected
                return prevParcels.filter(p => p.id !== parcelId);
              } else {
                // Add the parcel if it's not already selected
                return [...prevParcels, { id: parcelId, buildingDetails }];
              }
            });
          }}
          onAnalyze={() => {
            setIsAnalyzing(false);
          }}
        />
      </div>

      {/* Upper Right - Controls */}
      <div className="w-1/2 h-1/2 border-b border-base-300">
        <ControlsPanel />
      </div>

      {/* Lower Left - List */}
      <div className="w-1/2 h-1/2 border-r border-base-300 overflow-auto">
        <ListPanel />
      </div>

      {/* Lower Right - Details */}
      <div className="w-1/2 h-1/2 overflow-auto">
        <DetailsPanel selectedBuilding={selectedParcels[selectedParcels.length - 1]?.buildingDetails || null} />
      </div>
    </div>
  );
}
