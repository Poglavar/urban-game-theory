export interface Parcel {
    id: string;
    coordinates: string;
    buildingId: string;
    area: number;
    isSelected?: boolean;
}

export interface ParcelNFT {
    tokenId: string;
    owner: string;
    coordinates: string;
    buildingId: string;
    area: number;
}

export interface Proposal {
    tokenId: string;
    parcelIds: string[];
    isConditional: boolean;
    imageURI: string;
    proposer: string;
    isActive: boolean;
}

export interface SelectedParcel {
  id: string;
  // Add any other properties that might be needed for selected parcels
} 