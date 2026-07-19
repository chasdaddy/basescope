import { fetchJson } from "../http.js";
import { chainMeta, type ChainKey } from "../chains.js";

export interface ApprovalRow {
  token: string | null;
  tokenSymbol: string | null;
  spender: string | null;
  spenderName: string | null;
  amount: string | null;
  risky: boolean;
  riskFlags: string[];
}

/**
 * Enumerate an address's outstanding ERC-20 approvals and flag risky spenders,
 * via GoPlus token_approval_security v2 (no key). Risky approvals are the #1
 * way wallets get drained, so risky ones are surfaced first.
 */
export async function getRiskyApprovals(chain: ChainKey, address: string) {
  const chainId = chainMeta(chain).id;
  const data = await fetchJson(
    `https://api.gopluslabs.io/api/v2/token_approval_security/${chainId}?addresses=${address.toLowerCase()}`
  ).catch(() => null);

  if (!data || data.code !== 1) {
    return { chain, address, count: 0, riskyCount: 0, approvals: [] as ApprovalRow[], note: "no data (or chain unsupported by GoPlus)" };
  }

  const list: any[] = Array.isArray(data.result) ? data.result : [];
  const approvals: ApprovalRow[] = [];

  for (const tok of list) {
    const approvedList: any[] = Array.isArray(tok.approved_list) ? tok.approved_list : [];
    for (const ap of approvedList) {
      const info = ap.address_info ?? {};
      const riskFlags: string[] = [];
      if (info.is_contract === 0) riskFlags.push("spender is an EOA, not a contract");
      if (Array.isArray(info.malicious_behavior) && info.malicious_behavior.length)
        riskFlags.push(...info.malicious_behavior.map((x: any) => String(x)));
      if (info.doubt_list === 1 || info.doubt_list === "1") riskFlags.push("spender on GoPlus doubt list");
      if (info.trust_list === 0 && info.is_contract === 1) {
        // not on trust list — informational, not alone a red flag
      }

      approvals.push({
        token: tok.token_address ?? null,
        tokenSymbol: tok.token_symbol ?? null,
        spender: ap.approved_contract ?? null,
        spenderName: info.tag ?? info.contract_name ?? null,
        amount: ap.approved_amount ?? null,
        risky: riskFlags.length > 0,
        riskFlags: Array.from(new Set(riskFlags)),
      });
    }
  }

  approvals.sort((a, b) => Number(b.risky) - Number(a.risky));
  return {
    chain,
    address,
    count: approvals.length,
    riskyCount: approvals.filter((a) => a.risky).length,
    approvals,
  };
}
