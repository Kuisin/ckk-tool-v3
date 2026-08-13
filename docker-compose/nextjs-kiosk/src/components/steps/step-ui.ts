/**
 * step-ui.ts — 工程実行 UI の共通ヘルパー（クライアント側）。
 */

import type { KioskMessages } from "@/lib/i18n";
import type { StepErrorCode } from "@/lib/step-execution";
import type { StepSessionState } from "@/lib/steps-core";

export type StepAction =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "INSPECTION"
  | "DEFECTS";

export interface StepActionRequest {
  action: StepAction;
  inputQuantity?: number | null;
  quantities?: {
    inputQuantity: number;
    outputSuccessQuantity: number;
    outputDefectSemiFinished: number;
    outputDefectScrap: number;
    outputDefectRework: number;
  } | null;
  /** COMPLETE のみ: 不良理由の内訳（{理由, 数}）の補助記録。 */
  defectReasons?: { reason: string; count: number }[];
  /** INSPECTION のみ */
  templateId?: number;
  items?: { templateItemId: number; measuredValue: string; isPass: boolean }[];
  /** DEFECTS のみ */
  defects?: { defectTypeId: number; description: string }[];
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
      return m.steps.state.othersWorking(lockedByName ?? "");
    case "COMPLETED":
      return m.steps.state.completed;
    case "CANCELLED":
      return m.steps.state.cancelled;
  }
}
