import { formatGwei } from "viem";
import { getClient, type ChainKey } from "../chains.js";

/** Current gas price + EIP-1559 fee suggestion for a chain. */
export async function getGas(chain: ChainKey) {
  const client = getClient(chain);
  const [gasPrice, fees] = await Promise.all([
    client.getGasPrice().catch(() => null),
    client.estimateFeesPerGas().catch(() => null),
  ]);

  return {
    chain,
    gasPriceWei: gasPrice?.toString() ?? null,
    gasPriceGwei: gasPrice != null ? formatGwei(gasPrice) : null,
    maxFeePerGasGwei:
      fees?.maxFeePerGas != null ? formatGwei(fees.maxFeePerGas) : null,
    maxPriorityFeePerGasGwei:
      fees?.maxPriorityFeePerGas != null
        ? formatGwei(fees.maxPriorityFeePerGas)
        : null,
  };
}
