/**
 * settings-gate.ts — 端末設定コード（6桁）の試行回数制限（メモリ保持）。
 *
 * PIN ログインと同じポリシー（PIN_MAX_ATTEMPTS=5 回失敗 → PIN_LOCK_MS=15分
 * ロック、kiosk-auth-core.ts の nextPinFailureState/isPinLocked を再利用）。
 * 単一インスタンス前提のインメモリ（tickets.ts と同じ割り切り） — アプリ
 * 再起動でリセットされるが、再起動はタブレット UI から誘発できないため許容。
 * 多重インスタンス化する場合は kiosk_devices に試行回数/ロック列を移すこと。
 */

import { isPinLocked, nextPinFailureState } from "./kiosk-auth-core";

type GateState = { failedAttempts: number; lockedUntil: Date | null };

const globalGate = globalThis as unknown as {
  __kioskSettingsGate?: Map<string, GateState>;
};
if (!globalGate.__kioskSettingsGate) {
  globalGate.__kioskSettingsGate = new Map<string, GateState>();
}
const store = globalGate.__kioskSettingsGate;

/** ロック中ならロック解除時刻、そうでなければ null。 */
export function gateLockedUntil(deviceId: string): Date | null {
  const state = store.get(deviceId);
  if (!state) return null;
  return isPinLocked(new Date(), state.lockedUntil) ? state.lockedUntil : null;
}

/** 失敗を記録。上限到達でロックした場合はその解除時刻を返す。 */
export function recordGateFailure(deviceId: string): Date | null {
  const prev = store.get(deviceId);
  const next = nextPinFailureState(new Date(), prev?.failedAttempts ?? 0);
  store.set(deviceId, next);
  return next.lockedUntil;
}

/** 成功時: カウンタをリセット。 */
export function clearGate(deviceId: string): void {
  store.delete(deviceId);
}
