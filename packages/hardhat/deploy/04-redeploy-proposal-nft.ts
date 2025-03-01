import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const redeployProposalNFT: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Hardcode the existing contract addresses
  const parcelNFTAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Replace with actual address
  const cityTokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Replace with actual address

  const proposalNFT = await deploy("ProposalNFT", {
    from: deployer,
    args: [parcelNFTAddress, cityTokenAddress],
    log: true,
    autoMine: true,
  });

  console.log(`ProposalNFT redeployed to: ${proposalNFT.address}`);
};

export default redeployProposalNFT;
redeployProposalNFT.tags = ["RedeployProposalNFT"]; 