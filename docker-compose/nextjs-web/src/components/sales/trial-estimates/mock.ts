/**
 * mock.ts — saved 試算 (見積試算) demo records + helpers.
 *
 * A record snapshots the full calc input plus the chosen material + reference
 * price, so the detail page can recompute deterministically via
 * `calcTrialPricing`. MIGRATION NOTE: replace with `trial_estimates` (+items).
 */

import type { TrialInput } from "@/lib/trial-pricing";

/**
 * 試算 lifecycle — DRAFT: 編集可 / CONFIRMED: 計算確定・価格表登録可 /
 * REGISTERED: 価格表登録済（ロック — 複製して再試算）.
 */
export type EstimateStatus = "DRAFT" | "CONFIRMED" | "REGISTERED";

export interface TrialEstimateRecord {
  id: string;
  /** 試算番号 EST-YYYYMM-NNNNN（採番は server-action で）. */
  estimateNumber: string;
  name: string;
  status: EstimateStatus;
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
  /** 価格表登録日時（REGISTERED のみ）. */
  registeredAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const MOCK_TRIAL_ESTIMATES: TrialEstimateRecord[] = [
  {
    id: "te-0001",
    estimateNumber: "EST-202605-00031",
    name: "精密軸 φ3×38 BAL ｱﾙｸﾛｰﾅ",
    status: "REGISTERED",
    customerId: "bp-001",
    customerName: "株式会社ABC製作所",
    materialId: "A01A0001-A001-001",
    materialLabel: "A01A0001-A001-001 — SUS303 φ20×3000（研磨）",
    referenceDate: "2026-05-27",
    isCustomPrice: false,
    registeredAt: "2026-05-29 09:40",
    input: {
      toolType: "ROUND_BAR",
      maxDiameter: 3,
      totalLength: 38,
      materialBarPrice: 5660,
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
      lotQuantities: [100, 0, 0], // 基準数量（形状出し按分のみ）
      lotMarkups: [1], // 掛け率は使わない（数量スケールは価格表の倍率で管理）
    },
    createdBy: "鈴木 一郎",
    createdAt: "2026-05-28 10:15",
    updatedAt: "2026-05-28 10:15",
  },
  {
    id: "te-0002",
    estimateNumber: "EST-202604-00018",
    name: "ロッド φ7×80 円筒 通常",
    status: "CONFIRMED",
    customerId: "bp-002",
    customerName: "合同会社XYZ工業",
    materialId: "B01A0007-A002-001",
    materialLabel: "B01A0007-A002-001 — S45C φ16×4000（研磨）",
    referenceDate: "2026-04-21",
    isCustomPrice: true,
    registeredAt: null,
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
      lotQuantities: [5, 0, 0], // 基準数量（形状出し按分のみ）
      lotMarkups: [1],
    },
    createdBy: "田中 太郎",
    createdAt: "2026-04-22 14:30",
    updatedAt: "2026-04-22 14:30",
  },
  {
    id: "te-0003",
    estimateNumber: "EST-202606-00007",
    name: "特殊加工品 φ5×60 BAL 再見積",
    status: "DRAFT",
    customerId: "bp-003",
    customerName: "株式会社DEFエンジニアリング",
    materialId: "A01A0001-A001-001",
    materialLabel: "A01A0001-A001-001 — SUS303 φ20×3000（研磨）",
    referenceDate: "2026-06-02",
    isCustomPrice: false,
    registeredAt: null,
    input: {
      toolType: "ROUND_BAR",
      maxDiameter: 5,
      totalLength: 60,
      materialBarPrice: 5660,
      isBlackSkin: false,
      stepLength: 12,
      stepType: "FINISH",
      neckLength: 0,
      neckType: "NONE",
      coating: "無",
      lapType: "NONE",
      inspection: "NONE",
      ldEnabled: false,
      ldLocation: "TIP",
      ldOuterDiameter: 3,
      ldBladeLength: 10,
      machiningMinutes: 12,
      machiningRatePer10min: 2500,
      spareShapeCount: 2,
      lotQuantities: [10, 0, 0], // 基準数量（形状出し按分のみ）
      lotMarkups: [1],
    },
    createdBy: "中村 花子",
    createdAt: "2026-06-03 11:05",
    updatedAt: "2026-06-03 11:05",
  },
];

export function getTrialEstimate(
  id: string,
  records = MOCK_TRIAL_ESTIMATES,
): TrialEstimateRecord | undefined {
  return records.find((r) => r.id === id);
}
