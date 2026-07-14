/**
 * app-flags.ts — アプリの環境別 ON/OFF（feature_flags）。server-only.
 *
 * dev / main は同一 DB を共有するため、フラグは環境をキーに含める:
 *   key = `app:<appKey>:<env>`（env = "dev" | "main"）
 * 行が無ければ有効（デフォルト ON — フラグを立てるまで既存挙動を変えない）。
 * 実行環境は APP_ENV（Coolify で dev / main を設定。未設定＝ローカルは dev）。
 *
 * 読み取りはシェル描画に使うため fail-open（DB 障害時は全アプリ表示）。
 */

import { appList } from "./app-list";
import { prisma } from "./db";

export type AppEnv = "dev" | "main";

export const APP_ENVS: AppEnv[] = ["dev", "main"];

/** この実行環境の識別子（APP_ENV。未設定はローカル＝dev 扱い）。 */
export function currentAppEnv(): AppEnv {
  return process.env.APP_ENV === "main" ? "main" : "dev";
}

/** feature_flags のキー。 */
export function appFlagKey(appKey: string, env: AppEnv): string {
  return `app:${appKey}:${env}`;
}

/**
 * 現在の環境で無効化されているアプリの key 一覧。
 * 行が無い／is_enabled=true のアプリは有効（返さない）。失敗時は空（fail-open）。
 */
export async function getDisabledAppKeys(
  env: AppEnv = currentAppEnv(),
): Promise<string[]> {
  try {
    const suffix = `:${env}`;
    const rows = await prisma.featureFlag.findMany({
      where: {
        key: { startsWith: "app:", endsWith: suffix },
        isEnabled: false,
      },
      select: { key: true },
    });
    return rows
      .map((r) => r.key.slice("app:".length, -suffix.length))
      .filter((k) => k.length > 0);
  } catch (e) {
    console.error("getDisabledAppKeys failed", e);
    return [];
  }
}

export interface AppFlagRow {
  key: string;
  label: string;
  operationCode: string;
  category: string;
  /** 環境ごとの有効状態（行が無ければ true）。 */
  enabled: Record<AppEnv, boolean>;
}

/** 管理画面用: 全アプリ × 全環境の有効状態。 */
export async function listAppFlags(): Promise<AppFlagRow[]> {
  const rows = await prisma.featureFlag.findMany({
    where: { key: { startsWith: "app:" } },
    select: { key: true, isEnabled: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.isEnabled]));
  return appList.map((app) => ({
    key: app.key,
    label: app.label,
    operationCode: app.operationCode,
    category: app.category,
    enabled: Object.fromEntries(
      APP_ENVS.map((env) => [env, byKey.get(appFlagKey(app.key, env)) ?? true]),
    ) as Record<AppEnv, boolean>,
  }));
}
