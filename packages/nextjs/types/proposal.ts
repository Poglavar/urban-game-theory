export interface ProposalMetadata {
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

export interface ProposalData {
  tokenId: bigint;
  metadata: ProposalMetadata;
  parcelIds: string[];
  ethAmount: bigint;
  tokenAmount: bigint;
  acceptanceCount: number;
} 