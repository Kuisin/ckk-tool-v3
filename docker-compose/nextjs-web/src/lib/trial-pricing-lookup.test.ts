import { describe, expect, it } from "vitest";
import type { TrialInput } from "./trial-pricing";
import type { Criterion, LookupTable } from "./trial-pricing-criteria";
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
