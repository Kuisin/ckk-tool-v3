/**
 * login-history-filter-core.ts — ログイン履歴（SY0D）の URL クエリ → 絞り込み値。
 *
 * クエリ文字列は誰でも書き換えられる。許可した値以外を Prisma の enum 条件に
 * そのまま流すと PrismaClientValidationError で画面ごと 500 になるので、
 * ここで許可リストと突き合わせて**外れた値は null（絞り込みなし）**に倒す —
 * `days` が既に「範囲外は既定 7 日」としているのに揃える。
 *
 * 純関数（DB・セッションに触れない）。値の集合は lib/login-attempts.ts の
 * LoginAttemptFilter と、Prisma enum（LOGIN_OUTCOME / DEVICE_OWNERSHIP）が正。
 */

import type { DeviceOwnership } from "@/lib/device-ownership-core";

export const LOGIN_OUTCOMES = ["SUCCESS", "FAILURE"] as const;
export type LoginOutcome = (typeof LOGIN_OUTCOMES)[number];

/** 画面の「アプリ」絞り込み（面）。app 列そのものではない（PORTAL は method 接頭辞）。 */
export const LOGIN_SURFACES = ["WEB", "KIOSK", "PORTAL"] as const;
export type LoginSurface = (typeof LOGIN_SURFACES)[number];

export const DEVICE_OWNERSHIPS = [
  "COMPANY_MANAGED",
  "COMPANY_NETWORK",
  "UNMANAGED",
  "UNKNOWN",
] as const satisfies readonly DeviceOwnership[];

/** 何日ぶんを見るか。範囲外・非数は既定 7 日。 */
export const DEFAULT_LOGIN_HISTORY_DAYS = 7;
export const MAX_LOGIN_HISTORY_DAYS = 400;

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
): T | null {
  return value != null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export function parseLoginOutcome(
  value: string | null | undefined,
): LoginOutcome | null {
  return oneOf(LOGIN_OUTCOMES, value);
}

export function parseLoginSurface(
  value: string | null | undefined,
): LoginSurface | null {
  return oneOf(LOGIN_SURFACES, value);
}

export function parseDeviceOwnership(
  value: string | null | undefined,
): DeviceOwnership | null {
  return oneOf(DEVICE_OWNERSHIPS, value);
}

export function parseLoginHistoryDays(
  value: string | null | undefined,
): number {
  const days = Number(value ?? DEFAULT_LOGIN_HISTORY_DAYS);
  return Number.isFinite(days) && days > 0 && days <= MAX_LOGIN_HISTORY_DAYS
    ? days
    : DEFAULT_LOGIN_HISTORY_DAYS;
}
