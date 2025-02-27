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