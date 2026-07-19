import { type Address } from "viem";
import { normalize } from "viem/ens";
import { getClient } from "../chains.js";

/**
 * ENS forward resolution (name -> address). ENS is canonical on Ethereum L1,
 * so we always resolve against mainnet regardless of the working chain.
 */
export async function resolveEns(name: string) {
  const client = getClient("ethereum");
  const address = await client.getEnsAddress({ name: normalize(name) });
  return { name, address: address ?? null, resolved: address != null };
}

/** ENS reverse resolution (address -> primary name). */
export async function reverseEns(address: Address) {
  const client = getClient("ethereum");
  const name = await client.getEnsName({ address });
  return { address, name: name ?? null, hasPrimaryName: name != null };
}
