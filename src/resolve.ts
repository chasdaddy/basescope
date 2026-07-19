import { isAddress, getAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { getClient } from "./chains.js";

/**
 * Accept either a 0x address or an ENS name and return a checksummed address.
 * ENS is resolved on Ethereum L1 (its canonical home).
 */
export async function toAddress(input: string): Promise<Address> {
  const value = input.trim();
  if (isAddress(value)) return getAddress(value);
  if (value.includes(".")) {
    const resolved = await getClient("ethereum")
      .getEnsAddress({ name: normalize(value) })
      .catch(() => null);
    if (resolved) return resolved;
  }
  throw new Error(`"${input}" is not a valid 0x address or resolvable ENS name`);
}
