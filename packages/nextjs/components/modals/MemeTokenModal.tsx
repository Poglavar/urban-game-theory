"use client";

import type { Contract } from "~~/utils/scaffold-eth/contract";

interface MemeTokenModalProps {
    showMemeTokenModal: boolean;
    setShowMemeTokenModal: (show: boolean) => void;
    memeTokenContract: Contract<any> | null;
    totalSupply: bigint | undefined;
    owner: string | undefined;
}

export const MemeTokenModal = ({
    showMemeTokenModal,
    setShowMemeTokenModal,
    memeTokenContract,
    totalSupply,
    owner,
}: MemeTokenModalProps) => {
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