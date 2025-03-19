"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract, useScaffoldContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { toPng } from "html-to-image";
import { parseEther, parseUnits } from "viem";
import type { Contract } from "~~/utils/scaffold-eth/contract";
import type { SelectedParcel } from "~~/types/parcel";

interface ProposalModalProps {
    showProposalModal: boolean;
    setShowProposalModal: (show: boolean) => void;
    selectedParcels: SelectedParcel[];
    parcelNFTContract: Contract<any> | null;
    proposalNFTContract: Contract<any> | null;
    loadAllProposals: () => Promise<void>;
}

export const ProposalModal = ({
    showProposalModal,
    setShowProposalModal,
    selectedParcels,
    parcelNFTContract,
    proposalNFTContract,
    loadAllProposals,
}: ProposalModalProps) => {
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

    // First, approve the CityToken if needed
    const { writeContractAsync: approveCityToken } = useScaffoldWriteContract({
        contractName: "CityMemeToken",
    });

    // Then use mintAndFund
    const { writeContractAsync: writeProposalNFT } = useScaffoldWriteContract({
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

            const txHash = await writeProposalNFT({
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

            notification.info("Waiting for transaction confirmation...");
            await txHash;
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