import { type Address } from "viem";
import { getClient, chainMeta, type ChainKey } from "../chains.js";

/**
 * Low-level, RPC-only contract inspection: is this address a contract, and
 * how big is its deployed bytecode. (Verified-source lookups live elsewhere.)
 */
export async function inspectContract(chain: ChainKey, address: Address) {
  const client = getClient(chain);
  const code = await client.getCode({ address });
  const isContract = !!code && code !== "0x";
  return {
    chain,
    address,
    isContract,
    bytecodeSize: isContract ? (code!.length - 2) / 2 : 0,
    explorer: isContract ? `${chainMeta(chain).explorer}/address/${address}` : null,
  };
}

/** Transaction count (nonce) — a cheap signal of how active an EOA/contract is. */
export async function getActivity(chain: ChainKey, address: Address) {
  const client = getClient(chain);
  const txCount = await client.getTransactionCount({ address });
  return { chain, address, transactionCount: txCount };
}
