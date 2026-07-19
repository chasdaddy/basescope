import { keccak256, encodePacked, toBytes, getAddress, type Address, type Hex } from "viem";
import { namehash, normalize } from "viem/ens";
import { getClient, SUPPORTED_CHAINS } from "../chains.js";

/**
 * Basenames — Coinbase's ENS-compatible naming system on **Base mainnet**.
 * `*.base.eth` names are not resolvable by L1 ENS; they live on Base's own
 * L2 Resolver, which we read directly (namehash -> addr / name).
 *
 * Base mainnet contract (per the official base/basenames repo, "Deployments"):
 *   https://github.com/base/basenames
 * L2 Resolver: 0xC6d566A56A1aFf6508b41f6c90ff131615583BCD
 */
export const BASENAME_L2_RESOLVER =
  "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BASE_CHAIN_ID = SUPPORTED_CHAINS.base.id;

/** Minimal ENS public-resolver ABI: addr (forward) + name (reverse). */
const RESOLVER_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "addr",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** True for `*.base.eth` names (the Basenames namespace on Base mainnet). */
export function isBasename(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".base.eth");
}

/**
 * ENSIP-11 coin type for an EVM chain, as an uppercase hex string.
 * Base mainnet (8453) -> "80002105". Used to build reverse nodes.
 */
function chainCoinTypeHex(chainId: number): string {
  const coinType = (0x80000000 | chainId) >>> 0;
  return coinType.toString(16).toUpperCase();
}

/**
 * Deterministic reverse node for an address on a given chain — the namehash of
 * `<coinTypeHex>.reverse` hashed with the address label. Mirrors Coinbase
 * OnchainKit's `convertReverseNodeToBytes`.
 */
function reverseNode(address: Address, chainId: number): Hex {
  const addressLabel = keccak256(toBytes(address.toLowerCase().slice(2)));
  const baseReverseNode = namehash(`${chainCoinTypeHex(chainId)}.reverse`);
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressLabel])
  );
}

/**
 * Basename forward resolution (name -> address), read from the Base L2 Resolver.
 * Returns a checksummed address, or null if the name is unregistered.
 */
export async function resolveBasename(name: string) {
  const client = getClient("base");
  const node = namehash(normalize(name));
  const addr = (await client.readContract({
    address: BASENAME_L2_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "addr",
    args: [node],
  })) as Address;
  const resolved = addr && addr !== ZERO_ADDRESS ? getAddress(addr) : null;
  return { name, address: resolved, resolved: resolved != null };
}

/**
 * Basename reverse resolution (address -> primary basename) on Base mainnet,
 * read from the Base L2 Resolver. Returns null if the address has no primary
 * basename set.
 */
export async function resolveBaseNameForAddress(address: Address) {
  const client = getClient("base");
  const node = reverseNode(address, BASE_CHAIN_ID);
  const name = (await client.readContract({
    address: BASENAME_L2_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "name",
    args: [node],
  })) as string;
  const basename = name && name.length > 0 ? name : null;
  return { address, basename, hasPrimaryBasename: basename != null };
}
