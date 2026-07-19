import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
});
const client = new Client({ name: "smoke", version: "1.0.0" });

const text = (r) => r.content?.map((c) => c.text).join("\n");

async function call(name, args = {}) {
  process.stdout.write(`\n─── ${name}(${JSON.stringify(args)}) ───\n`);
  try {
    const r = await client.callTool({ name, arguments: args });
    process.stdout.write((text(r) ?? "(no text)") + "\n");
    if (r.isError) process.stdout.write("  ^ returned isError\n");
  } catch (e) {
    process.stdout.write(`  THREW: ${e?.message ?? e}\n`);
  }
}

await client.connect(transport);

const { tools } = await client.listTools();
process.stdout.write(`Connected. ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

await call("list_supported_chains");
await call("get_native_balance", { chain: "base", address: "vitalik.eth" });
await call("resolve_basename", { name: "jesse.base.eth" });
await call("resolve_basename", { name: "base.base.eth" });
await call("reverse_ens_lookup", { address: "0x2211d1D0020DAEA8039E46Cf1367962070d77DA9" });
await call("get_native_balance", { chain: "base", address: "jesse.base.eth" });
await call("get_token_info", { chain: "base", token: USDC_BASE });
await call("inspect_contract", { chain: "base", address: USDC_BASE });
await call("get_verified_source", { chain: "base", address: USDC_BASE });
await call("get_token_price", { chain: "base", token: USDC_BASE });
await call("get_gas", { chain: "base" });
await call("check_token_safety", { chain: "base", token: USDC_BASE });
await call("check_address_safety", { chain: "ethereum", address: "vitalik.eth" });
await call("get_token_approvals", { chain: "ethereum", address: "vitalik.eth" });

await client.close();
process.stdout.write("\n✓ smoke test finished\n");
process.exit(0);
