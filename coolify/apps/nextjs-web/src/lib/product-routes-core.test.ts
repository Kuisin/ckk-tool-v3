/**
 * product-routes-core.test.ts — 工程ルートスナップショット比較のユニットテスト。
 */

import { describe, expect, it } from "vitest";
import {
  pickDefaultRoute,
  type RouteStepSnapshot,
  type RouteView,
  routeStepsEqual,
} from "./product-routes-core";

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

describe("pickDefaultRoute（顧客一致 → 汎用 → 先頭）", () => {
  const route = (id: number, customerBpId: string | null): RouteView => ({
    id,
    name: `route-${id}`,
    nameEn: "",
    customerBpId,
    customerName: customerBpId ? `顧客-${customerBpId}` : null,
    isActive: true,
    notes: null,
    updatedAt: "",
    versions: [],
  });

  it("顧客一致ルートを最優先", () => {
    const routes = [route(1, null), route(2, "bp-a"), route(3, "bp-b")];
    expect(pickDefaultRoute(routes, "bp-b")?.id).toBe(3);
  });

  it("一致が無ければ汎用ルート", () => {
    const routes = [route(2, "bp-a"), route(1, null)];
    expect(pickDefaultRoute(routes, "bp-x")?.id).toBe(1);
    expect(pickDefaultRoute(routes, null)?.id).toBe(1);
  });

  it("汎用も無ければ先頭（他顧客専用でも手動選択の起点として返す）", () => {
    const routes = [route(2, "bp-a")];
    expect(pickDefaultRoute(routes, null)?.id).toBe(2);
  });

  it("空配列は null", () => {
    expect(pickDefaultRoute([], "bp-a")).toBeNull();
  });
});
