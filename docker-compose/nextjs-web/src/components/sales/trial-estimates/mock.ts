/**
 * mock.ts — saved 試算 (見積試算) demo records + helpers.
 *
 * A record snapshots the full calc input plus the chosen material + reference
 * price, so the detail page can recompute deterministically via
 * `calcTrialPricing`. MIGRATION NOTE: replace with `trial_estimates` (+items).
 */

import type { TrialInput } from "@/lib/trial-pricing";

export interface TrialEstimateRecord {
  id: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  materialId: string;
  materialLabel: string;
  /** Full calc input snapshot (materialBarPrice = chosen reference price). */
  input: TrialInput;
  /** Date of the purchase point used as the reference price. */
  referenceDate: string;
  /** True when the material price was set manually (not from the policy). */
  isCustomPrice: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const MOCK_TRIAL_ESTIMATES: TrialEstimateRecord[] = [
  {
    id: "te-0001",
    name: "精密軸 φ3×38 BAL ｱﾙｸﾛｰﾅ",
    customerId: "bp-001",
    customerName: "株式会社ABC製作所",
    materialId: "A01A0001-A001-001",
    materialLabel: "A01A0001-A001-001 — SUS303 φ20×3000（研磨）",
    referenceDate: "2026-05-27",
    isCustomPrice: false,
    input: {
      toolType: "ROUND_BAR",
      maxDiameter: 3,
      totalLength: 38,
      materialBarPrice: 16980,
      isBlackSkin: false,
      stepLength: 9,
      stepType: "FINISH",
      neckLength: 0,
      neckType: "NONE",
      coating: "CX400",
      lapType: "OTHER",
      inspection: "NONE",
      ldEnabled: true,
      ldLocation: "TIP",
      ldOuterDiameter: 3,
      ldBladeLength: 10,
      machiningMinutes: 6,
      machiningRatePer10min: 2000,
      spareShapeCount: 3,
      lotQuantities: [20, 50, 100],
    },
    createdBy: "鈴木 一郎",
    createdAt: "2026-05-28 10:15",
    updatedAt: "2026-05-28 10:15",
  },
  {
    id: "te-0002",
    name: "ロッド φ7×80 円筒 通常",
    customerId: "bp-002",
    customerName: "合同会社XYZ工業",
    materialId: "B01A0007-A002-001",
    materialLabel: "B01A0007-A002-001 — S45C φ16×4000（研磨）",
    referenceDate: "2026-04-21",
    isCustomPrice: true,
    input: {
      toolType: "CYLINDER",
      maxDiameter: 7,
      totalLength: 80,
      materialBarPrice: 0,
      isBlackSkin: false,
      cylinderMaterialPrice: 13086,
      cylinderType: "NORMAL",
      stepLength: 0,
      stepType: "NONE",
      neckLength: 0,
      neckType: "NONE",
      coating: "無",
      lapType: "NONE",
      inspection: "THREE",
      ldEnabled: false,
      ldLocation: "TIP",
      ldOuterDiameter: 3,
      ldBladeLength: 20,
      machiningMinutes: 40,
      machiningRatePer10min: 3000,
      spareShapeCount: 2,
      lotQuantities: [5, 0, 0],
    },
    createdBy: "田中 太郎",
    createdAt: "2026-04-22 14:30",
    updatedAt: "2026-04-22 14:30",
  },
];

export function getTrialEstimate(
  id: string,
  records = MOCK_TRIAL_ESTIMATES,
): TrialEstimateRecord | undefined {
  return records.find((r) => r.id === id);
}
