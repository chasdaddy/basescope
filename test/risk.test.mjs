import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveRiskLevel } from "../dist/services/safety.js";

const base = { isHoneypot: null, sellTaxPct: 0, g: {}, honeypotRiskLevel: 1, hasData: true };

test("no data -> unknown", () => {
  assert.equal(deriveRiskLevel({ ...base, hasData: false }), "unknown");
});

test("honeypot -> critical", () => {
  assert.equal(deriveRiskLevel({ ...base, isHoneypot: true }), "critical");
});

test("cannot sell entire balance -> critical", () => {
  assert.equal(deriveRiskLevel({ ...base, g: { cannot_sell_all: "1" } }), "critical");
});

test("extreme sell tax -> critical", () => {
  assert.equal(deriveRiskLevel({ ...base, sellTaxPct: 40 }), "critical");
});

test("reclaimable ownership -> high", () => {
  assert.equal(deriveRiskLevel({ ...base, g: { can_take_back_ownership: "1" } }), "high");
});

test("high sell tax (>=15) -> high", () => {
  assert.equal(deriveRiskLevel({ ...base, sellTaxPct: 20 }), "high");
});

test("unverified source -> medium", () => {
  assert.equal(deriveRiskLevel({ ...base, g: { is_open_source: "0" } }), "medium");
});

test("mintable -> medium", () => {
  assert.equal(deriveRiskLevel({ ...base, g: { is_mintable: "1" } }), "medium");
});

test("proxy alone is NOT a risk driver -> low", () => {
  // A verified, non-taxing proxy (like USDC) must not be flagged medium+.
  assert.equal(
    deriveRiskLevel({ ...base, g: { is_proxy: "1", is_open_source: "1" } }),
    "low"
  );
});

test("clean token -> low", () => {
  assert.equal(deriveRiskLevel({ ...base, g: { is_open_source: "1" } }), "low");
});
