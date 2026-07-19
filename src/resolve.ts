import { isAddress, getAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { getClient } from "./chains.js";
import { isBasename, resolveBasename } from "./services/basenames.js";

/**
 * Accept a 0x address, an ENS name, or a Basename and return a checksummed
 * address. `*.base.eth` Basenames resolve via the Base L2 Resolver; all other
 * ENS names resolve on Ethereum L1 (their canonical home).
 */
export async function toAddress(input: string): Promise<Address> {
  const value = input.trim();
  if (isAddress(value)) return getAddress(value);
  if (isBasename(value)) {
    const { address } = await resolveBasename(value).catch(() => ({
      address: null,
    }));
    if (address) return address;
  } else if (value.includes(".")) {
    const resolved = await getClient("ethereum")
      .getEnsAddress({ name: normalize(value) })
      .catch(() => null);
    if (resolved) return resolved;
  }
  throw new Error(
    `"${input}" is not a valid 0x address or resolvable ENS / Basename`
  );
}
