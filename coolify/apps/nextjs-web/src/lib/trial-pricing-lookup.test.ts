import { describe, expect, it } from "vitest";
import type { TrialInput } from "./trial-pricing";
import {
  type Criterion,
  DEFAULT_LOOKUP_TABLES,
  LOOKUP_TABLE_ID,
  type LookupTable,
} from "./trial-pricing-criteria";
import {
  COATING_OPTIONS,
  COATING_TABLE_IDS,
  coatingRawCost,
  normalizeLegacyExpressionIds,
  normalizeLegacyLookupIds,
} from "./trial-pricing-data";
import { runCriteriaEngine } from "./trial-pricing-engine";

const INPUT: TrialInput = {
  toolType: "ROUND_BAR",
  maxDiameter: 12,
  totalLength: 200,
  materialBarPrice: 1500,
  isBlackSkin: false,
  stepLength: 0,
  stepType: "NONE",
  neckLength: 0,
  neckType: "NONE",
  coating: "無",
  lapType: "NONE",
  inspection: "NONE",
  ldEnabled: false,
  ldLocation: "TIP",
  ldOuterDiameter: 0,
  ldBladeLength: 0,
  machiningMinutes: 0,
  machiningRatePer10min: 2000,
  spareShapeCount: 3,
  lotQuantities: [1],
};

const criteria = (expr: string): Criterion[] => [
  {
    id: "t",
    name: "t",
    role: "component",
    expression: expr,
    order: 10,
    enabled: true,
    toolTypes: ["ROUND_BAR", "CYLINDER", "OH"],
  },
  {
    id: "final",
    name: "final",
    role: "final",
    expression: "subtotal",
    order: 100,
    enabled: true,
    toolTypes: ["ROUND_BAR", "CYLINDER", "OH"],
  },
];

const table: LookupTable = {
  id: "rate",
  name: { ja: "レート", en: "rate" },
  keyColumns: ["shape", "grade"],
  valueType: "number",
  rows: [
    { keys: ["x", "1"], value: "42" },
    { keys: ["y", "2"], value: "7" },
  ],
};

describe("engine lookup() — multi-column", () => {
  it("returns the value for a matching key combination", () => {
    const r = runCriteriaEngine(INPUT, {
      criteria: criteria('lookup("rate", "x", "1")'),
      lookupTables: [table],
    });
    expect(r.lots[0].estimateUnitPrice).toBe(42);
    expect(r.lots[0].minimumPrice).toBe(42);
  });

  it("returns 0 for a missing combination (number table)", () => {
    const r = runCriteriaEngine(INPUT, {
      criteria: criteria('lookup("rate", "x", "9")'),
      lookupTables: [table],
    });
    expect(r.lots[0].minimumPrice).toBe(0);
  });

  it("string table returns a string value (usable in expressions)", () => {
    const strTable: LookupTable = {
      id: "code",
      name: { ja: "コード", en: "code" },
      keyColumns: ["k"],
      valueType: "string",
      rows: [{ keys: ["a"], value: "5" }],
    };
    // string "5" coerced by the arithmetic in the expression
    const r = runCriteriaEngine(INPUT, {
      criteria: criteria('Number(lookup("code", "a")) * 2'),
      lookupTables: [strTable],
    });
    expect(r.lots[0].minimumPrice).toBe(10);
  });
});

describe("lookup table ids — format + coating mapping", () => {
  it("every default table id is alphanumeric/hyphen/underscore only", () => {
    for (const t of DEFAULT_LOOKUP_TABLES) {
      expect(t.id, `invalid id: ${t.id}`).toMatch(LOOKUP_TABLE_ID);
    }
  });

  it("every coating option (except 無) maps to a seeded table", () => {
    const byId = new Set(DEFAULT_LOOKUP_TABLES.map((t) => t.id));
    for (const c of COATING_OPTIONS.filter((c) => c !== "無")) {
      const id = COATING_TABLE_IDS[c];
      expect(id, `no table id for coating: ${c}`).toBeTruthy();
      expect(byId.has(id), `table missing: ${id}`).toBe(true);
    }
  });

  it("coatingRawCost still resolves via the id map", () => {
    // CX200 φ12×200: seeded 本社 matrix value (≥-match 12/200).
    expect(coatingRawCost("CX200", 12, 200)).toBeGreaterThan(0);
    expect(coatingRawCost("オンワード OS-Ⅶ", 12, 200)).toBeGreaterThan(0);
    expect(coatingRawCost("無", 12, 200)).toBe(0);
  });

  it("legacy ids are normalized on tables and in expressions", () => {
    const legacyTable: LookupTable = {
      id: "coating:CX200",
      name: { ja: "CX200", en: "CX200" },
      keyColumns: ["k"],
      valueType: "number",
      rows: [],
    };
    expect(normalizeLegacyLookupIds([legacyTable, table])[0].id).toBe(
      "coating-cx200",
    );
    // 改名対象外はそのまま。
    expect(normalizeLegacyLookupIds([table])[0].id).toBe("rate");

    const legacyCriteria = criteria(
      "lookup(\"coating:オンワード OS-Ⅶ\", maxDiameter) + lookup('coating:CX200', maxDiameter)",
    );
    const normalized = normalizeLegacyExpressionIds(legacyCriteria);
    expect(normalized[0].expression).toBe(
      "lookup(\"coating-onward-os-7\", maxDiameter) + lookup('coating-cx200', maxDiameter)",
    );
    // 参照なしの式は同一オブジェクトのまま（無駄な複製をしない）。
    expect(normalizeLegacyExpressionIds([legacyCriteria[1]])[0]).toBe(
      legacyCriteria[1],
    );
  });
});
