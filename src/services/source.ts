import { fetchJson } from "../http.js";
import { chainMeta, type ChainKey } from "../chains.js";

/**
 * Verified-source lookup via Sourcify (no key). Returns whether the contract's
 * source is verified, plus name/compiler/ABI function names when available.
 */
export async function getVerifiedSource(chain: ChainKey, address: string) {
  const chainId = chainMeta(chain).id;
  const data = await fetchJson(
    `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=metadata,abi`
  ).catch(() => null);

  if (!data || (!data.match && !data.metadata)) {
    return {
      chain,
      address,
      verified: false,
      note: "source not verified on Sourcify",
      explorer: `${chainMeta(chain).explorer}/address/${address}`,
    };
  }

  const compilationTarget = data?.metadata?.settings?.compilationTarget ?? {};
  const contractName = (Object.values(compilationTarget)[0] as string | undefined) ?? null;
  const abi: any[] = Array.isArray(data.abi) ? data.abi : [];

  return {
    chain,
    address,
    verified: true,
    match: data.match ?? null,
    verifiedAt: data.verifiedAt ?? null,
    contractName,
    compiler: data?.metadata?.compiler?.version ?? null,
    language: data?.metadata?.language ?? null,
    functions: abi.filter((x) => x?.type === "function").map((x) => x.name),
    explorer: `${chainMeta(chain).explorer}/address/${address}#code`,
  };
}
