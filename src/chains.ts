import { createPublicClient, http, type PublicClient } from "viem";
import { base, mainnet, optimism, arbitrum, polygon } from "viem/chains";

/**
 * Supported chains, keyed by the short name the MCP tools accept.
 * Base is first-class; the major EVM L2s + Ethereum L1 are included so the
 * server is useful beyond a single ecosystem.
 */
export const SUPPORTED_CHAINS = {
  base,
  ethereum: mainnet,
  optimism,
  arbitrum,
  polygon,
} as const;

export type ChainKey = keyof typeof SUPPORTED_CHAINS;

export const CHAIN_KEYS = Object.keys(SUPPORTED_CHAINS) as ChainKey[];

/** Optional per-chain RPC override via env (falls back to the public RPC). */
const RPC_ENV: Record<ChainKey, string> = {
  base: "BASE_RPC_URL",
  ethereum: "ETHEREUM_RPC_URL",
  optimism: "OPTIMISM_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
  polygon: "POLYGON_RPC_URL",
};

const clients = new Map<ChainKey, PublicClient>();

/** Lazily create & cache a viem public client for the given chain. */
export function getClient(chainKey: ChainKey): PublicClient {
  let client = clients.get(chainKey);
  if (!client) {
    const chain = SUPPORTED_CHAINS[chainKey];
    const url = process.env[RPC_ENV[chainKey]];
    client = createPublicClient({ chain, transport: http(url) }) as PublicClient;
    clients.set(chainKey, client);
  }
  return client;
}

/** Validate a user-supplied chain string, with a helpful error. */
export function assertChain(value: string): ChainKey {
  if ((CHAIN_KEYS as string[]).includes(value)) return value as ChainKey;
  throw new Error(
    `Unsupported chain "${value}". Supported: ${CHAIN_KEYS.join(", ")}.`
  );
}

export function chainMeta(chainKey: ChainKey) {
  const c = SUPPORTED_CHAINS[chainKey];
  return {
    key: chainKey,
    id: c.id,
    name: c.name,
    nativeCurrency: c.nativeCurrency,
    explorer: c.blockExplorers?.default?.url ?? null,
  };
}
