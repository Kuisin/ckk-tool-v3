import { describe, expect, it } from "vitest";
import {
  calcTrialPricing,
  calcTrialPricingLegacy,
  type TrialInput,
  type TrialResult,
} from "./trial-pricing";
import {
  type Criterion,
  type CustomInputDef,
  DEFAULT_CRITERIA,
} from "./trial-pricing-criteria";
import { runCriteriaEngine } from "./trial-pricing-engine";

const base: TrialInput = {
  toolType: "ROUND_BAR",
  maxDiameter: 12,
  totalLength: 200,
  materialBarPrice: 1500,
  isBlackSkin: false,
  cylinderMaterialPrice: undefined,
  cylinderType: undefined,
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
  machiningMinutes: 8,
  machiningRatePer10min: 2000,
  spareShapeCount: 3,
  lotQuantities: [10, 50, 100],
  lotMarkups: undefined,
};

const cases: Array<{ name: string; input: TrialInput }> = [
  { name: "丸棒 基本", input: base },
  { name: "丸棒 黒皮(センタレス)", input: { ...base, isBlackSkin: true } },
  {
    name: "OH 黒皮(×1.3)",
    input: { ...base, toolType: "OH", isBlackSkin: true },
  },
  {
    name: "段加工あり",
    input: { ...base, stepLength: 20, stepType: "FINISH" },
  },
  {
    name: "首下あり(テーパー)",
    input: { ...base, neckLength: 15, neckType: "TAPER" },
  },
  {
    name: "コートあり(CX200)",
    input: { ...base, coating: "CX200" },
  },
  {
    name: "ラップOSG(=コート/2)",
    input: { ...base, coating: "CX200", lapType: "OSG" },
  },
  {
    name: "ラップ社内",
    input: { ...base, lapType: "INHOUSE" },
  },
  {
    name: "LD(先端+外周)",
    input: {
      ...base,
      ldEnabled: true,
      ldLocation: "TIP_OUTER",
      ldOuterDiameter: 6,
      ldBladeLength: 30,
    },
  },
  {
    name: "検査 2ヶ所R",
    input: { ...base, inspection: "TWO_R" },
  },
  {
    name: "円筒(高精度)",
    input: {
      ...base,
      toolType: "CYLINDER",
      materialBarPrice: 0,
      cylinderMaterialPrice: 5000,
      cylinderType: "HIGH",
    },
  },
  {
    name: "掛け率手動上書き",
    input: { ...base, lotMarkups: [1.5, null, 0.9] },
  },
  {
    name: "全部盛り",
    input: {
      ...base,
      toolType: "OH",
      maxDiameter: 10,
      totalLength: 160,
      isBlackSkin: true,
      stepLength: 30,
      stepType: "ROUGH_15",
      neckLength: 20,
      neckType: "STRAIGHT",
      coating: "CX200",
      lapType: "OSG",
      inspection: "THREE_R",
      ldEnabled: true,
      ldLocation: "TIP_GASH",
      ldOuterDiameter: 8,
      ldBladeLength: 25,
      machiningMinutes: 12,
      lotQuantities: [5, 25, 300],
    },
  },
];

function expectParity(engine: TrialResult, legacy: TrialResult) {
  for (const k of Object.keys(legacy.breakdown) as Array<
    keyof TrialResult["breakdown"]
  >) {
    expect(engine.breakdown[k]).toBeCloseTo(legacy.breakdown[k], 4);
  }
  expect(engine.shapeOutPrice).toBeCloseTo(legacy.shapeOutPrice, 4);
  expect(engine.lots.length).toBe(legacy.lots.length);
  engine.lots.forEach((lot, i) => {
    const exp = legacy.lots[i];
    expect(lot.quantity).toBe(exp.quantity);
    expect(lot.discountRate).toBeCloseTo(exp.discountRate, 6);
    expect(lot.minimumPrice).toBeCloseTo(exp.minimumPrice, 4);
    // 見積単価 is the acceptance gate — must match exactly (10円単位).
    expect(lot.estimateUnitPrice).toBe(exp.estimateUnitPrice);
  });
}

describe("criteria engine parity with legacy", () => {
  for (const c of cases) {
    it(`reproduces legacy output — ${c.name}`, () => {
      expectParity(calcTrialPricing(c.input), calcTrialPricingLegacy(c.input));
    });
  }

  it("respects correction/ld overrides identically", () => {
    const opts = { correctionFactor: 1.4, ldChargePer10min: 9000 };
    const input = cases[8].input; // LD case
    expectParity(
      calcTrialPricing(input, opts),
      calcTrialPricingLegacy(input, opts),
    );
  });
});

describe("custom inputs as variables", () => {
  it("a custom-input-driven criterion moves the price", () => {
    const customInputs: CustomInputDef[] = [
      {
        key: "surcharge",
        label: "追加費",
        type: "number",
        default: 0,
        order: 1,
      },
    ];
    const criteria: Criterion[] = [
      ...DEFAULT_CRITERIA.filter((c) => c.role !== "final"),
      {
        id: "surchargeCriterion",
        name: "追加費",
        role: "component",
        order: 105,
        enabled: true,
        expression: "surcharge",
      },
      DEFAULT_CRITERIA.find((c) => c.role === "final") as Criterion,
    ];
    const withVal = runCriteriaEngine(
      { ...base, surcharge: 250 } as unknown as TrialInput,
      { criteria, customInputs },
    );
    const withoutVal = runCriteriaEngine(base, { criteria, customInputs });
    expect(withVal.lots[0].minimumPrice - withoutVal.lots[0].minimumPrice).toBe(
      250,
    );
  });
});

describe("per-tool-type criteria on/off", () => {
  it("a CYLINDER-scoped criterion only affects CYLINDER estimates", () => {
    const finalC = DEFAULT_CRITERIA.find(
      (c) => c.role === "final",
    ) as Criterion;
    const withCyl: Criterion[] = [
      ...DEFAULT_CRITERIA.filter((c) => c.role !== "final"),
      {
        id: "cylOnly",
        name: "円筒のみ加算",
        role: "component",
        order: 105,
        enabled: true,
        expression: "1000",
        toolTypes: ["CYLINDER"],
      },
      finalC,
    ];
    const roundInput: TrialInput = { ...base, toolType: "ROUND_BAR" };
    const cylInput: TrialInput = {
      ...base,
      toolType: "CYLINDER",
      materialBarPrice: 0,
      cylinderMaterialPrice: 5000,
      cylinderType: "NORMAL",
    };
    // ROUND_BAR: scoped criterion excluded → same as default criteria.
    expect(
      runCriteriaEngine(roundInput, { criteria: withCyl }).lots[0].minimumPrice,
    ).toBeCloseTo(runCriteriaEngine(roundInput).lots[0].minimumPrice, 4);
    // CYLINDER: scoped criterion applies → +1000 vs default criteria.
    const cylDefault = runCriteriaEngine(cylInput).lots[0].minimumPrice;
    const cylWith = runCriteriaEngine(cylInput, {
      criteria: withCyl,
    }).lots[0].minimumPrice;
    expect(cylWith - cylDefault).toBeCloseTo(1000, 4);
  });

  it("empty toolTypes applies to no product type", () => {
    const finalC = DEFAULT_CRITERIA.find(
      (c) => c.role === "final",
    ) as Criterion;
    const criteria: Criterion[] = [
      ...DEFAULT_CRITERIA.filter((c) => c.role !== "final"),
      {
        id: "appliesToNone",
        name: "適用なし",
        role: "component",
        order: 105,
        enabled: true,
        expression: "9999",
        toolTypes: [],
      },
      finalC,
    ];
    // base is ROUND_BAR; the empty-scoped criterion must never apply.
    expect(
      runCriteriaEngine(base, { criteria }).lots[0].minimumPrice,
    ).toBeCloseTo(runCriteriaEngine(base).lots[0].minimumPrice, 4);
  });
});

describe("sandbox + error handling", () => {
  it("shadows dangerous globals to undefined", () => {
    const criteria: Criterion[] = [
      {
        id: "probe",
        name: "probe",
        role: "component",
        order: 1,
        enabled: true,
        expression: "typeof process === 'undefined' ? 7 : 999",
      },
      {
        id: "final",
        name: "見積単価",
        role: "final",
        order: 999,
        enabled: true,
        expression: "subtotal",
      },
    ];
    const res = runCriteriaEngine(base, { criteria });
    expect(res.lots[0].minimumPrice).toBe(7);
  });

  it("a throwing criterion yields 0 + a warning, never crashes", () => {
    const criteria: Criterion[] = [
      {
        id: "boom",
        name: "boom",
        role: "component",
        order: 1,
        enabled: true,
        expression: "(function(){ throw new Error('x'); })()",
      },
      {
        id: "final",
        name: "見積単価",
        role: "final",
        order: 999,
        enabled: true,
        expression: "subtotal",
      },
    ];
    const res = runCriteriaEngine(base, { criteria });
    expect(res.lots[0].minimumPrice).toBe(0);
    expect(res.warnings.some((w) => w.includes("boom"))).toBe(true);
  });
});
