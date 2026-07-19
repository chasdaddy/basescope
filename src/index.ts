#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { CHAIN_KEYS, chainMeta, type ChainKey } from "./chains.js";
import { toAddress } from "./resolve.js";
import { getNativeBalance, getErc20Info } from "./services/balances.js";
import { inspectContract, getActivity } from "./services/contract.js";
import { resolveEns, reverseEns } from "./services/ens.js";
import { resolveBasename, resolveBaseNameForAddress } from "./services/basenames.js";
import { getGas } from "./services/gas.js";
import { getTokenPrice } from "./services/prices.js";
import { checkTokenSafety, checkAddressSafety } from "./services/safety.js";
import { getRiskyApprovals } from "./services/approvals.js";
import { getVerifiedSource } from "./services/source.js";

const chainEnum = z.enum(CHAIN_KEYS as [ChainKey, ...ChainKey[]]).default("base");

const server = new McpServer({ name: "basescope", version: "0.1.0" });

// ---- helpers -------------------------------------------------------------
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}
function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// ---- read tools ----------------------------------------------------------
server.registerTool(
  "list_supported_chains",
  {
    title: "List supported chains",
    description:
      "List the chains this server can read (chain id + native currency). Base is the default. Read-only.",
    inputSchema: {},
  },
  async () => ok({ chains: CHAIN_KEYS.map(chainMeta), default: "base" })
);

server.registerTool(
  "get_native_balance",
  {
    title: "Get native balance",
    description:
      "Read the native coin balance (ETH, MATIC, …) of an address or ENS name. Read-only.",
    inputSchema: {
      chain: chainEnum,
      address: z.string().describe("0x address or ENS name"),
    },
  },
  async ({ chain, address }) => {
    try {
      return ok(await getNativeBalance(chain, await toAddress(address)));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "get_token_info",
  {
    title: "Get ERC-20 token info",
    description:
      "Read an ERC-20 token's name/symbol/decimals, and optionally a holder's balance. Read-only.",
    inputSchema: {
      chain: chainEnum,
      token: z.string().describe("ERC-20 token contract address"),
      holder: z.string().optional().describe("optional holder address/ENS to include a balance"),
    },
  },
  async ({ chain, token, holder }) => {
    try {
      const holderAddr = holder ? await toAddress(holder) : undefined;
      return ok(await getErc20Info(chain, await toAddress(token), holderAddr));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "resolve_ens_name",
  {
    title: "Resolve ENS name",
    description: "Resolve an ENS name (e.g. vitalik.eth) to its address. Read-only.",
    inputSchema: { name: z.string().describe("ENS name, e.g. name.eth") },
  },
  async ({ name }) => {
    try {
      return ok(await resolveEns(name));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "resolve_basename",
  {
    title: "Resolve Basename",
    description:
      "Resolve a Basename (e.g. jesse.base.eth) to its address via the Base L2 Resolver. Basenames are Coinbase's ENS-compatible names on Base mainnet and are not resolvable by L1 ENS. Read-only.",
    inputSchema: { name: z.string().describe("Basename, e.g. name.base.eth") },
  },
  async ({ name }) => {
    try {
      return ok(await resolveBasename(name));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "reverse_ens_lookup",
  {
    title: "Reverse name lookup",
    description:
      "Find the primary name for an address: its primary ENS name (Ethereum L1) and its primary Basename (Base mainnet), if set. Read-only.",
    inputSchema: { address: z.string().describe("0x address or ENS name") },
  },
  async ({ address }) => {
    try {
      const addr = await toAddress(address);
      const [ens, base] = await Promise.all([
        reverseEns(addr).catch(() => ({ name: null, hasPrimaryName: false })),
        resolveBaseNameForAddress(addr).catch(() => ({
          basename: null,
          hasPrimaryBasename: false,
        })),
      ]);
      return ok({
        address: addr,
        name: ens.name,
        basename: base.basename,
        hasPrimaryName: ens.hasPrimaryName || base.hasPrimaryBasename,
      });
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "inspect_contract",
  {
    title: "Inspect contract",
    description:
      "Check whether an address is a contract, its bytecode size, and its transaction count. Read-only.",
    inputSchema: {
      chain: chainEnum,
      address: z.string().describe("0x address or ENS name"),
    },
  },
  async ({ chain, address }) => {
    try {
      const addr = await toAddress(address);
      const [inspect, activity] = await Promise.all([
        inspectContract(chain, addr),
        getActivity(chain, addr),
      ]);
      return ok({ ...inspect, transactionCount: activity.transactionCount });
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "get_verified_source",
  {
    title: "Get verified source",
    description:
      "Look up whether a contract's source code is verified (via Sourcify) and return its name/compiler/functions. Read-only.",
    inputSchema: {
      chain: chainEnum,
      address: z.string().describe("contract address or ENS name"),
    },
  },
  async ({ chain, address }) => {
    try {
      return ok(await getVerifiedSource(chain, await toAddress(address)));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

// ---- safety tools (the differentiator) -----------------------------------
server.registerTool(
  "check_token_safety",
  {
    title: "Check token safety",
    description:
      "Assess whether an ERC-20 token is a honeypot / rug risk: honeypot check, buy/sell tax, mint/blacklist/pausable authority, verified source, and a normalized risk level. Cross-checks GoPlus + honeypot.is. Read-only, no keys. Best on Base and Ethereum.",
    inputSchema: {
      chain: chainEnum,
      token: z.string().describe("ERC-20 token contract address"),
    },
  },
  async ({ chain, token }) => {
    try {
      return ok(await checkTokenSafety(chain, await toAddress(token)));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "check_address_safety",
  {
    title: "Check address reputation",
    description:
      "Check an address against known-malicious databases (phishing, sanctioned, scam, money laundering, etc.) via GoPlus. Read-only, no keys.",
    inputSchema: {
      chain: chainEnum,
      address: z.string().describe("0x address or ENS name"),
    },
  },
  async ({ chain, address }) => {
    try {
      return ok(await checkAddressSafety(chain, await toAddress(address)));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "get_token_approvals",
  {
    title: "Get risky token approvals",
    description:
      "List a wallet's outstanding ERC-20 approvals and flag risky spenders (the #1 wallet-drain vector). Risky approvals are surfaced first. Read-only, no keys.",
    inputSchema: {
      chain: chainEnum,
      address: z.string().describe("wallet address or ENS name"),
    },
  },
  async ({ chain, address }) => {
    try {
      return ok(await getRiskyApprovals(chain, await toAddress(address)));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

// ---- market / network tools ---------------------------------------------
server.registerTool(
  "get_gas",
  {
    title: "Get gas price",
    description:
      "Current gas price + EIP-1559 fee suggestion for a chain. Note: on Base (an OP-Stack L2) total tx cost also includes an L1 data fee. Read-only.",
    inputSchema: { chain: chainEnum },
  },
  async ({ chain }) => {
    try {
      return ok(await getGas(chain));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

server.registerTool(
  "get_token_price",
  {
    title: "Get token price",
    description: "Current USD price for a token, via DefiLlama. Read-only, no keys.",
    inputSchema: {
      chain: chainEnum,
      token: z.string().describe("token contract address"),
    },
  },
  async ({ chain, token }) => {
    try {
      return ok(await getTokenPrice(chain, await toAddress(token)));
    } catch (e) {
      return fail(errMsg(e));
    }
  }
);

// ---- boot ----------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("basescope MCP server running on stdio");
