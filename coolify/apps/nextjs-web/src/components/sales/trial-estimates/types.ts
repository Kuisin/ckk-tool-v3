/**
 * types.ts — 価格試算 (価格試算) view-model shared by the SA01 screens.
 *
 * Rows come from sales.estimates via Prisma (combined key year_month+seq);
 * `id` is the DERIVED document number (EST-YYYYMM-NNNNN) and doubles as the
 * URL id. `input` snapshots the full calc input so the detail page recomputes
 * deterministically via `calcTrialPricing`.
 */

import type { TrialInput, TrialResult } from "@/lib/trial-pricing";

/** 保存/確定時に記録した価格スナップショット（estimate.result）。 */
export type TrialPriceSnapshot = TrialResult & {
  pricedAt?: string;
  correctionFactor?: number;
};

/**
 * 価格試算 lifecycle — DRAFT: 編集可 / CONFIRMED: 計算確定・価格表登録可 /
 * REGISTERED: 価格表登録済（ロック — 複製して再価格試算）.
 */
export type EstimateStatus = "DRAFT" | "CONFIRMED" | "REGISTERED";

export interface TrialEstimateRecord {
  /** Derived document number EST-YYYYMM-NNNNN — also the URL id. */
  id: string;
  estimateNumber: string;
  name: string;
  status: EstimateStatus;
  customerId: string | null;
  customerName: string | null;
  /** 対象製品（任意リンク — 価格表作成時の基準単価ソース候補）. */
  productId: string | null;
  productName: string | null;
  /** 材種 × 直径 × 黒皮/研磨（参照価格の解決キー）. */
  materialTypeId: string;
  diameterCode: string;
  surfaceFinishCode: string;
  materialLabel: string;
  /** Full calc input snapshot (materialBarPrice = chosen reference price). */
  input: TrialInput;
  /**
   * 保存/確定時に記録した価格（estimate.result）。存在すればこの値を表示し、
   * 計算基準を後から変更しても過去の価格試算の価格は不変（「その時点の価格」）。
   */
  resultSnapshot: TrialPriceSnapshot | null;
  /** Date of the purchase point used as the reference price. */
  referenceDate: string;
  /** True when the material price was set manually (not from the policy). */
  isCustomPrice: boolean;
  /** 価格表登録日時（REGISTERED のみ）. */
  registeredAt: string | null;
  /** 営業担当（作成時に顧客の主担当を複写したスナップショット）。 */
  salesRepId: string | null;
  salesRepName: string | null;
  /** 作成者の表示名（未設定・システム作成は "—"）。 */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 価格表バリアント linked to a 価格試算 (関連 tab). */
export interface LinkedPriceEntry {
  entryId: string;
  customerName: string;
  productName: string;
  orderType: string;
  tierCount: number;
}
