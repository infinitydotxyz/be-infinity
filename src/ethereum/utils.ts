import { BigNumber, ethers } from 'ethers';

export function getFeesAtTarget(currentBaseFee: BigNumber, blocksInFuture: number) {
  const MAX_SINGLE_BLOCK_INCREASE = 1.125;
  const MAX_SINGLE_BLOCK_DECREASE = 0.875;
  const maxIncreaseAtTarget = Math.ceil(MAX_SINGLE_BLOCK_INCREASE ** blocksInFuture * 1000);
  const maxDecreaseAtTarget = Math.floor(MAX_SINGLE_BLOCK_DECREASE ** blocksInFuture * 1000);

  const maxBaseFee = currentBaseFee.mul(maxIncreaseAtTarget).div(1000);
  const minBaseFee = currentBaseFee.mul(maxDecreaseAtTarget).div(1000);

  return {
    maxBaseFeeWei: maxBaseFee.toString(),
    minBaseFeeWei: minBaseFee.toString(),
    maxBaseFeeGwei: ethers.utils.formatUnits(maxBaseFee, 'gwei'),
    minBaseFeeGwei: ethers.utils.formatUnits(minBaseFee, 'gwei')
  };
}
