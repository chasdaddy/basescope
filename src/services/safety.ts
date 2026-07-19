import { fetchJson } from "../http.js";
import { chainMeta, type ChainKey } from "../chains.js";

/** honeypot.is only covers Ethereum (1), BSC (56), Base (8453). */
const HONEYPOT_CHAIN_IDS = new Set([1, 56, 8453]);

export type RiskLevel = "critical" | "high" | "medium" | "low" | "unknown";

export interface TokenSafety {
  chain: ChainKey;
  token: string;
  riskLevel: RiskLevel;
  isHoneypot: boolean | null;
  buyTaxPct: number | null;
  sellTaxPct: number | null;
  flags: string[];
  details: Record<string, unknown>;
  sources: string[];
}

/**
 * Cross-checks GoPlus Token Security + honeypot.is into one normalized,
 * agent-readable risk object. Both are free / no-key. Provenance is kept in
 * `sources` so a caller can see when the two disagree.
 */
export async function checkTokenSafety(
  chain: ChainKey,
  token: string
): Promise<TokenSafety> {
  const chainId = chainMeta(chain).id;
  const tokenLc = token.toLowerCase();
  const sources: string[] = [];
  const flags: string[] = [];

  const [goplusRes, honeypotRes] = await Promise.all([
    fetchJson(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${tokenLc}`
    )
      .then((d) => {
        sources.push("goplus");
        return d;
      })
      .catch(() => null),
    HONEYPOT_CHAIN_IDS.has(chainId)
      ? fetchJson(
          `https://api.honeypot.is/v2/IsHoneypot?address=${token}&chainID=${chainId}`
        )
          .then((d) => {
            sources.push("honeypot.is");
            return d;
          })
          .catch(() => null)
      : null,
  ]);

  const g: any = goplusRes?.result?.[tokenLc] ?? null;
  const h: any = honeypotRes ?? null;

  // Taxes: GoPlus gives fractions ("0.05"); honeypot.is gives percentages.
  let buyTaxPct: number | null = null;
  let sellTaxPct: number | null = null;
  if (g) {
    if (g.buy_tax != null && g.buy_tax !== "") buyTaxPct = round2(parseFloat(g.buy_tax) * 100);
    if (g.sell_tax != null && g.sell_tax !== "") sellTaxPct = round2(parseFloat(g.sell_tax) * 100);
  }
  if (h?.simulationResult) {
    if (h.simulationResult.buyTax != null) buyTaxPct = round2(Number(h.simulationResult.buyTax));
    if (h.simulationResult.sellTax != null) sellTaxPct = round2(Number(h.simulationResult.sellTax));
  }

  let isHoneypot: boolean | null = null;
  if (typeof h?.honeypotResult?.isHoneypot === "boolean") isHoneypot = h.honeypotResult.isHoneypot;
  if (g?.is_honeypot === "1") isHoneypot = true;

  if (g) {
    if (g.is_open_source === "0") flags.push("source code not verified");
    if (g.is_proxy === "1") flags.push("proxy contract (logic can be swapped)");
    if (g.is_mintable === "1") flags.push("owner can mint more supply");
    if (g.can_take_back_ownership === "1") flags.push("ownership can be reclaimed after renounce");
    if (g.hidden_owner === "1") flags.push("hidden owner");
    if (g.owner_change_balance === "1") flags.push("owner can change balances");
    if (g.selfdestruct === "1") flags.push("contract can self-destruct");
    if (g.is_blacklisted === "1") flags.push("has a blacklist");
    if (g.transfer_pausable === "1") flags.push("transfers can be paused");
    if (g.trading_cooldown === "1") flags.push("trading cooldown enforced");
    if (g.cannot_sell_all === "1") flags.push("cannot sell entire balance");
    if (g.cannot_buy === "1") flags.push("buying is blocked");
    if (g.external_call === "1") flags.push("makes external calls on transfer");
  }
  if (Array.isArray(h?.summary?.flags)) {
    for (const f of h.summary.flags) if (typeof f === "string") flags.push(`honeypot.is: ${f}`);
  }
  if (buyTaxPct != null && buyTaxPct >= 10) flags.push(`high buy tax (${buyTaxPct}%)`);
  if (sellTaxPct != null && sellTaxPct >= 10) flags.push(`high sell tax (${sellTaxPct}%)`);

  const riskLevel = deriveRiskLevel({
    isHoneypot,
    sellTaxPct,
    g,
    honeypotRiskLevel: h?.summary?.riskLevel,
    hasData: !!(g || h),
  });

  return {
    chain,
    token,
    riskLevel,
    isHoneypot,
    buyTaxPct,
    sellTaxPct,
    flags: dedupe(flags),
    details: {
      tokenName: g?.token_name ?? null,
      tokenSymbol: g?.token_symbol ?? null,
      holderCount: g?.holder_count != null ? Number(g.holder_count) : null,
      ownerAddress: g?.owner_address ?? null,
      isOpenSource: bool01(g?.is_open_source),
      honeypotRisk: h?.summary?.risk ?? null,
      honeypotRiskLevel: h?.summary?.riskLevel ?? null,
    },
    sources,
  };
}

/** Reputation check for any address (phishing / sanctioned / scam), via GoPlus. */
export async function checkAddressSafety(chain: ChainKey, address: string) {
  const chainId = chainMeta(chain).id;
  const data = await fetchJson(
    `https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=${chainId}`
  ).catch(() => null);
  const r: any = data?.result ?? null;
  if (!r) return { address, malicious: null as boolean | null, flags: [] as string[], note: "no data returned" };

  // These fields are descriptive, not risk signals — exclude from the verdict.
  const INFO_FIELDS = new Set(["contract_address", "data_source"]);
  const flags: string[] = [];
  for (const [k, v] of Object.entries(r)) {
    if (INFO_FIELDS.has(k)) continue;
    if (k === "number_of_malicious_contracts_created") {
      const n = Number(v);
      if (n > 0) flags.push(`created ${n} malicious contract(s)`);
      continue;
    }
    if (v === "1") flags.push(k.replace(/_/g, " "));
  }
  return {
    address,
    malicious: flags.length > 0,
    flags,
    isContract: r.contract_address === "1",
    details: r,
  };
}

/**
 * Pure risk-tiering from the normalized signals. Exported so the heuristic —
 * the core of the product — is locked down by unit tests.
 */
export function deriveRiskLevel(args: {
  isHoneypot: boolean | null;
  sellTaxPct: number | null;
  g: any;
  honeypotRiskLevel: unknown;
  hasData: boolean;
}): RiskLevel {
  const { isHoneypot, sellTaxPct, g, honeypotRiskLevel, hasData } = args;
  if (!hasData) return "unknown";
  if (isHoneypot === true || g?.cannot_sell_all === "1" || g?.cannot_buy === "1") return "critical";
  const sell = sellTaxPct ?? 0;
  if (sell >= 30) return "critical";
  const highSignals = [
    g?.can_take_back_ownership === "1",
    g?.hidden_owner === "1",
    g?.owner_change_balance === "1",
    g?.selfdestruct === "1",
    g?.is_blacklisted === "1",
    sell >= 15,
  ].filter(Boolean).length;
  if (highSignals >= 1) return "high";
  // Note: a proxy contract is informational (kept as a flag) but is not on its
  // own a risk driver — most blue-chip tokens are upgradeable proxies.
  const medSignals = [
    g?.is_open_source === "0",
    g?.is_mintable === "1",
    g?.transfer_pausable === "1",
    sell >= 5,
    honeypotRiskLevel != null && Number(honeypotRiskLevel) >= 3,
  ].filter(Boolean).length;
  if (medSignals >= 1) return "medium";
  return "low";
}

function round2(n: number) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null as unknown as number;
}
function dedupe(a: string[]) {
  return Array.from(new Set(a));
}
function bool01(v: unknown): boolean | null {
  return v === "1" ? true : v === "0" ? false : null;
}
