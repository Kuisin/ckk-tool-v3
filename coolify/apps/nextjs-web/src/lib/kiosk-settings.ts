import "server-only";

/**
 * kiosk-settings.ts — キオスク設定（SY0A）の型付きアダプタ。
 *
 * app.system_settings の名前空間 `kiosk` に保存する（app-config.ts 経由・
 * スキーマ変更なし）。キオスク側 nextjs-kiosk は同じキーを**読み取り専用**で
 * 参照する（`nextjs-kiosk/src/lib/kiosk-settings.ts`）。
 *
 * v1 の設定:
 *   - `kiosk.apps` … Record<appKey, boolean>（キオスクランチャーの表示 on/off）
 *
 * 認証ポリシー（セッション/PIN/端末トークンの各種時間）は現状 kiosk 側の
 * 定数（kiosk-auth-core.ts）で固定。ここでは参考として既定値を公開し、
 * 編集可能化は認証ホットパスの安全な改修とあわせて後続で行う。
 */

import { z } from "zod";
import { readConfigNamespace, writeConfigValues } from "./app-config";

const NAMESPACE = "kiosk";
const APPS_KEY = "kiosk.apps";

/** キオスクランチャーに載るアプリのカタログ（nextjs-kiosk app-list.ts と対応）。 */
export interface KioskAppCatalogEntry {
  key: string;
  /** 管理画面の表示名（日本語）。 */
  label: string;
  /** 必要な permission_code（参考表示）。 */
  permission: string;
}

/**
 * キオスクアプリのカタログ。nextjs-kiosk の KIOSK_APPS と手動で対応させる
 * （別アプリ・別 DB クライアントのため import はできない）。アプリ追加時は両方更新。
 */
export const KIOSK_APP_CATALOG: KioskAppCatalogEntry[] = [
  { key: "step-execution", label: "工程実行", permission: "work_order" },
  { key: "wo-scan", label: "指示書スキャン", permission: "work_order" },
];

const appFlagsSchema = z.record(z.string(), z.boolean());

/** アプリ表示フラグ（未設定は既定で有効）。 */
export async function getKioskAppFlags(): Promise<Record<string, boolean>> {
  const raw = (await readConfigNamespace(NAMESPACE)).get(APPS_KEY);
  const parsed = appFlagsSchema.safeParse(raw);
  const stored = parsed.success ? parsed.data : {};
  // カタログの全アプリを網羅（未設定 = 有効）
  const result: Record<string, boolean> = {};
  for (const app of KIOSK_APP_CATALOG) {
    result[app.key] = stored[app.key] ?? true;
  }
  return result;
}

/** アプリ表示フラグを保存（カタログにあるキーだけ・boolean のみ）。 */
export async function setKioskAppFlags(
  flags: Record<string, boolean>,
): Promise<void> {
  const clean: Record<string, boolean> = {};
  for (const app of KIOSK_APP_CATALOG) {
    if (typeof flags[app.key] === "boolean") clean[app.key] = flags[app.key];
  }
  await writeConfigValues({ [APPS_KEY]: clean });
}

/**
 * 認証ポリシーの既定値（参考表示用）。実効値は kiosk 側 kiosk-auth-core.ts。
 * 編集は後続 PR（認証ホットパスの安全な設定化とあわせて）。
 */
export const KIOSK_POLICY_DEFAULTS = {
  sessionTtlHours: 8,
  idleTimeoutMinutes: 5,
  pinReverifyDeviceIdleHours: 48,
  pinReverifyMaxDays: 14,
  pinMaxAttempts: 5,
  pinLockMinutes: 15,
  deviceTokenTtlDays: 30,
} as const;
