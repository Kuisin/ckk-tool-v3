/**
 * product-routes-core.test.ts — 工程ルートスナップショット比較のユニットテスト。
 */

import { describe, expect, it } from "vitest";
import { type RouteStepSnapshot, routeStepsEqual } from "./product-routes-core";

const step = (
  processStepId: number,
  sortOrder: number,
  overrides: Partial<RouteStepSnapshot> = {},
): RouteStepSnapshot => ({
  processStepId,
  sortOrder,
  executionLocation: "INTERNAL",
  plantId: null,
  supplierBpId: null,
  workHours: null,
  ...overrides,
});

describe("routeStepsEqual", () => {
  it("同一構成は true（sortOrder の値差は無視 — 並びのみ比較）", () => {
    const a = [step(1, 0), step(7, 1), step(8, 2)];
    const b = [step(1, 10), step(7, 20), step(8, 30)];
    expect(routeStepsEqual(a, b)).toBe(true);
  });

  it("並び順が違えば false", () => {
    const a = [step(1, 0), step(7, 1)];
    const b = [step(7, 0), step(1, 1)];
    expect(routeStepsEqual(a, b)).toBe(false);
  });

  it("工程の追加・削除で false", () => {
    const a = [step(1, 0), step(7, 1)];
    expect(routeStepsEqual(a, [step(1, 0)])).toBe(false);
    expect(routeStepsEqual(a, [...a, step(8, 2)])).toBe(false);
  });

  it("実施場所の変更で false", () => {
    const a = [step(6, 0)];
    const b = [step(6, 0, { executionLocation: "OUTSOURCE" })];
    expect(routeStepsEqual(a, b)).toBe(false);
  });

  it("拠点・仕入先の変更で false / null と undefined 相当は同値", () => {
    expect(routeStepsEqual([step(6, 0, { plantId: 1 })], [step(6, 0)])).toBe(
      false,
    );
    expect(
      routeStepsEqual(
        [step(6, 0, { supplierBpId: "bp-1" })],
        [step(6, 0, { supplierBpId: "bp-2" })],
      ),
    ).toBe(false);
    expect(routeStepsEqual([step(6, 0)], [step(6, 0)])).toBe(true);
  });

  it("作業時間の変更で false / 同値・両方なしは true", () => {
    expect(
      routeStepsEqual([step(6, 0, { workHours: 1.5 })], [step(6, 0)]),
    ).toBe(false);
    expect(
      routeStepsEqual(
        [step(6, 0, { workHours: 1.5 })],
        [step(6, 0, { workHours: 2 })],
      ),
    ).toBe(false);
    expect(
      routeStepsEqual(
        [step(6, 0, { workHours: 1.5 })],
        [step(6, 0, { workHours: 1.5 })],
      ),
    ).toBe(true);
  });

  it("空 vs 空は true", () => {
    expect(routeStepsEqual([], [])).toBe(true);
  });
});
