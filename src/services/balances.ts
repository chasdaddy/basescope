import {
  erc20Abi,
  formatEther,
  formatUnits,
  type Address,
} from "viem";
import { getClient, chainMeta, type ChainKey } from "../chains.js";

/** Native coin (ETH / MATIC / …) balance for an address. */
export async function getNativeBalance(chain: ChainKey, address: Address) {
  const client = getClient(chain);
  const wei = await client.getBalance({ address });
  const meta = chainMeta(chain);
  return {
    chain,
    address,
    symbol: meta.nativeCurrency.symbol,
    wei: wei.toString(),
    formatted: formatEther(wei),
  };
}

/**
 * ERC-20 token metadata (+ optional holder balance).
 * Every field is fetched defensively — non-standard tokens that revert on
 * name()/symbol() still return partial data instead of throwing.
 */
export async function getErc20Info(
  chain: ChainKey,
  token: Address,
  holder?: Address
) {
  const client = getClient(chain);

  const [name, symbol, decimalsRaw] = await Promise.all([
    client
      .readContract({ address: token, abi: erc20Abi, functionName: "name" })
      .catch(() => null),
    client
      .readContract({ address: token, abi: erc20Abi, functionName: "symbol" })
      .catch(() => null),
    client
      .readContract({ address: token, abi: erc20Abi, functionName: "decimals" })
      .catch(() => null),
  ]);

  const decimals = decimalsRaw != null ? Number(decimalsRaw) : null;

  let balance: { raw: string; formatted: string } | null = null;
  if (holder && decimals != null) {
    try {
      const raw = (await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [holder],
      })) as bigint;
      balance = { raw: raw.toString(), formatted: formatUnits(raw, decimals) };
    } catch {
      balance = null;
    }
  }

  return { chain, token, name, symbol, decimals, holder: holder ?? null, balance };
}
