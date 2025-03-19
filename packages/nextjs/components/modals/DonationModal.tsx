"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { parseEther, parseUnits } from "viem";
import { ProposalData } from "../../types/proposal";

interface DonationModalProps {
    proposal: ProposalData | null;
    isOpen: boolean;
    onClose: () => void;
}

export const DonationModal = ({ proposal, isOpen, onClose }: DonationModalProps) => {
    const { address } = useAccount();
    const [donationAmount, setDonationAmount] = useState("0.001");
    const [currency, setCurrency] = useState("ETH");
    const [expiryDays, setExpiryDays] = useState("30");
    const [isLoading, setIsLoading] = useState(false);

    const { writeContractAsync: writeProposalNFT } = useScaffoldWriteContract({
        contractName: "ProposalNFT",
    });

    const handleDonate = async () => {
        if (!address) {
            notification.error("Please connect your wallet first");
            return;
        }

        if (!proposal) {
            notification.error("No proposal selected");
            return;
        }

        try {
            setIsLoading(true);
            const value = parseEther(donationAmount);

            const tx = await writeProposalNFT({
                functionName: "contributeFunds",
                args: [
                    proposal.tokenId,
                    currency === "ETH" ? "0x0000000000000000000000000000000000000000" : "",
                    value
                ],
                value: currency === "ETH" ? value : 0n,
            });

            notification.info("Processing donation...");
            await tx;
            notification.success("Donation successful!");
            onClose();
        } catch (error) {
            console.error("Error donating:", error);
            notification.error("Error processing donation");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <dialog id="donation_modal" className={`modal modal-bottom sm:modal-middle ${isOpen ? 'modal-open' : ''}`} style={{ zIndex: 9999 }}>
            <form onSubmit={(e) => {
                e.preventDefault();
                handleDonate();
            }} className="modal-box relative">
                <h3 className="font-bold text-lg mb-4">Donate to Proposal</h3>
                <p className="text-sm mb-6">
                    Your donation will help fund this proposal. The funds will be held in escrow until the proposal is either accepted or rejected.
                    If accepted, the funds will be released to the proposal creator. If rejected, you can withdraw your donation.
                </p>

                <div className="form-control w-full mb-4">
                    <label className="label">
                        <span className="label-text">Expiry</span>
                    </label>
                    <div className="join">
                        <input
                            type="number"
                            value={expiryDays}
                            onChange={(e) => setExpiryDays(e.target.value)}
                            className="input input-bordered join-item w-full"
                            min="1"
                        />
                        <span className="join-item btn btn-neutral">days</span>
                    </div>
                </div>

                <div className="form-control w-full mb-4">
                    <label className="label">
                        <span className="label-text">Currency</span>
                    </label>
                    <select
                        className="select select-bordered w-full"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                    >
                        <option value="ETH">ETH</option>
                        <option value="USDC">USDC</option>
                        <option value="USDT">USDT</option>
                    </select>
                </div>

                <div className="form-control w-full mb-6">
                    <label className="label">
                        <span className="label-text">Amount</span>
                    </label>
                    <div className="join">
                        <input
                            type="number"
                            value={donationAmount}
                            onChange={(e) => setDonationAmount(e.target.value)}
                            className="input input-bordered join-item w-full"
                            min="0"
                            step="0.001"
                        />
                        <span className="join-item btn btn-neutral">{currency}</span>
                    </div>
                </div>

                <div className="modal-action">
                    <button
                        type="button"
                        className="btn"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={`btn btn-primary ${isLoading ? "loading" : ""}`}
                        disabled={isLoading || !address}
                    >
                        {isLoading ? "Processing..." : "Donate"}
                    </button>
                </div>
            </form>
            <form method="dialog" className="modal-backdrop" onClick={onClose}>
                <button>close</button>
            </form>
        </dialog>
    );
}; 