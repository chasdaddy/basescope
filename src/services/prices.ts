import { fetchJson } from "../http.js";
import { type ChainKey } from "../chains.js";

/**
 * Current USD price for a token, via DefiLlama (no API key).
 * The chain key doubles as DefiLlama's chain prefix (base, ethereum, ...).
 */
export async function getTokenPrice(chain: ChainKey, token: string) {
  const id = `${chain}:${token}`;
  const data = await fetchJson(
    `https://coins.llama.fi/prices/current/${id}`
  ).catch(() => null);
  const coin = data?.coins?.[id];
  if (!coin) return { chain, token, found: false, price: null as number | null };
  return {
    chain,
    token,
    found: true,
    price: coin.price ?? null,
    symbol: coin.symbol ?? null,
    decimals: coin.decimals ?? null,
    confidence: coin.confidence ?? null,
    updatedAt: coin.timestamp ?? null,
  };
}
