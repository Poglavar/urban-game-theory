"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import MapView from "~~/components/map/MapView";
import type { Parcel } from "~~/types/parcel";

export default function Home() {
  const { address } = useAccount();
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Placeholder for controls component
  const ControlsPanel = () => (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Controls</h2>
        <RainbowKitCustomConnectButton />
      </div>
      <button
        className={`btn ${isAnalyzing ? 'btn-disabled' : 'btn-primary'}`}
        onClick={() => {
          setIsAnalyzing(true);
          // @ts-ignore
          window.analyzeArea?.();
        }}
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze Area'}
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => {
          // TODO: Implement create proposal functionality
          console.log("Create proposal clicked");
        }}
      >
        Create Proposal
      </button>
    </div>
  );

  // Placeholder for list component
  const ListPanel = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Your Parcels</h2>
      {address ? (
        parcels.length > 0 ? (
          <ul className="space-y-2">
            {parcels.map(parcel => (
              <li
                key={parcel.id}
                className={`p-2 rounded cursor-pointer ${selectedParcelId === parcel.id ? 'bg-primary text-white' : 'bg-base-200'}`}
                onClick={() => setSelectedParcelId(parcel.id)}
              >
                Parcel {parcel.id}
              </li>
            ))}
          </ul>
        ) : (
          <p>No parcels found</p>
        )
      ) : (
        <p>Connect your wallet to view your parcels</p>
      )}
    </div>
  );

  // Placeholder for details component
  const DetailsPanel = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Details</h2>
      {selectedParcelId ? (
        <div className="space-y-2">
          <p>Selected Parcel: {selectedParcelId}</p>
          <h3 className="text-xl font-semibold mt-4">Offers</h3>
          <p>No offers yet</p>
          <h3 className="text-xl font-semibold mt-4">Proposals</h3>
          <p>No proposals yet</p>
        </div>
      ) : (
        <p>No parcel selected</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-wrap h-screen">
      {/* Upper Left - Map */}
      <div className="w-1/2 h-1/2 border-r border-b border-base-300">
        <MapView
          onParcelSelect={setSelectedParcelId}
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
        <DetailsPanel />
      </div>
    </div>
  );
}
