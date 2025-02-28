import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployCityMemeToken: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const cityMemeToken = await deploy("CityMemeToken", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  console.log(`CityMemeToken deployed to: ${cityMemeToken.address}`);
};

export default deployCityMemeToken;
deployCityMemeToken.tags = ["CityMemeToken"]; 