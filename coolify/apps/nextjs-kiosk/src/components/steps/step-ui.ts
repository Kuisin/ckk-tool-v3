/**
 * step-ui.ts — 工程実行 UI の共通ヘルパー（クライアント側）。
 */

import { fillMessage, type KioskMessages } from "@/lib/i18n";
import type { StepErrorCode } from "@/lib/step-execution";
import type { StepSessionState } from "@/lib/steps-core";

export type StepAction =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "INSPECTION"
  | "INSPECTION_CONFIRM"
  | "DEFECTS"
  | "SET_LOCATION"
  // 最終検査・出荷前確認（最終検査工程のみ — final-inspection.ts）
  | "FINAL_CHECK"
  | "FINAL_SPARE_STOCK"
  | "FINAL_SHIPMENT_STAGE"
  | "FINAL_SHIP_DEFECT";

export interface StepActionRequest {
  action: StepAction;
  inputQuantity?: number | null;
  /** START のみ: ロット/伝票コード（工程のロット入力モードが NONE 以外）。 */
  lotText?: string | null;
  /**
   * START / SET_LOCATION: 作業場所 QR（CKK:LOC:<code>）の code。
   * START では端末の既定作業場所より優先される。
   */
  workLocationCode?: string;
  quantities?: {
    inputQuantity: number;
    outputSuccessQuantity: number;
    outputDefectSemiFinished: number;
    outputDefectScrap: number;
    outputDefectRework: number;
  } | null;
  /** COMPLETE のみ: 不良の内訳（{種別, 種類, 詳細, 数} のリスト）。 */
  defectReasons?: {
    type: "SEMI" | "SCRAP" | "REWORK";
    defectTypeId: number | null;
    reason: string;
    count: number;
  }[];
  /** INSPECTION のみ — サンプル値: SELECT_MULTI は value[]、他は文字列 */
  templateId?: number;
  items?: {
    templateItemId: number;
    values: (string | string[])[];
    /** 記録方式 COUNTS: 検査数・合格数（VALUES は null）。 */
    inspectedCount: number | null;
    passedCount: number | null;
    isPass: boolean;
  }[];
  /** DEFECTS のみ */
  defects?: { defectTypeId: number; description: string }[];
  /** FINAL_CHECK のみ: ■最終検査の 3 項目（○ / ×）。 */
  checkField?: "drawingLabel" | "protectiveCap" | "finishedQuantity";
  checkOk?: boolean;
  /** FINAL_SPARE_STOCK のみ: 予備在庫の使用 / 入庫。 */
  spareStockField?: "spareStockUsed" | "spareStockReceived";
  spareStockValue?: boolean;
  /** FINAL_SHIPMENT_STAGE のみ: 出荷前チェーンのどの段を押したか。 */
  shipmentStage?: "shelved" | "deliveryNoteIssued" | "shipmentAuthorized";
  /** FINAL_SHIP_DEFECT のみ: 出荷時不良内容（任意メモ）。 */
  shipDefectNotes?: string;
  /** INSPECTION_CONFIRM のみ: 検査表確認を押す対象の記録。 */
  recordId?: string;
}

export interface StepActionResponse {
  ok: boolean;
  codes?: (StepErrorCode | "NO_PERMISSION" | "OFFLINE")[];
  errors?: string[];
}

/** 工程操作 API 呼び出し。通信失敗は OFFLINE コードに正規化する。 */
export async function callStepAction(
  stepId: string,
  body: StepActionRequest,
): Promise<StepActionResponse> {
  try {
    const res = await fetch(`/api/kiosk/steps/${encodeURIComponent(stepId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      // セッション切れ — ログインへ戻す
      window.location.href = "/login";
      return { ok: false, codes: ["OFFLINE"] };
    }
    const json = (await res.json().catch(() => null)) as
      | StepActionResponse
      | { error: string }
      | null;
    if (json && "ok" in json) return json;
    return { ok: false, codes: ["UNKNOWN" as never] };
  } catch {
    return { ok: false, codes: ["OFFLINE"] };
  }
}

/** エラーコード → 翻訳文言（未知コードはサーバーの日本語詳細にフォールバック）。 */
export function translateError(
  m: KioskMessages,
  res: StepActionResponse,
): string {
  const code = res.codes?.[0];
  const table = m.steps.errors as Record<string, string | undefined>;
  if (code && table[code]) return table[code] as string;
  if (res.errors && res.errors.length > 0) return res.errors.join(" / ");
  return m.steps.errors.UNKNOWN;
}

/** 状態バッジの色。 */
export function stateColor(state: StepSessionState): string {
  switch (state) {
    case "WORKING":
      return "green";
    case "PAUSED":
      return "orange";
    case "STARTABLE":
      return "blue";
    case "COMPLETED":
      return "teal";
    case "CANCELLED":
      return "red";
    default:
      return "gray";
  }
}

/** 状態バッジの文言。 */
export function stateLabel(
  m: KioskMessages,
  state: StepSessionState,
  lockedByName: string | null,
): string {
  switch (state) {
    case "WORKING":
      return m.steps.state.working;
    case "PAUSED":
      return m.steps.state.paused;
    case "STARTABLE":
      return m.steps.state.startable;
    case "BLOCKED":
      return m.steps.state.blocked;
    case "OTHER":
      return fillMessage(m.steps.state.othersWorking, {
        name: lockedByName ?? "",
      });
    case "COMPLETED":
      return m.steps.state.completed;
    case "CANCELLED":
      return m.steps.state.cancelled;
  }
}
