/**
 * app-flags.ts — アプリの環境別 ON/OFF（feature_flags）。server-only.
 *
 * dev / main は同一 DB を共有するため、フラグは環境をキーに含める:
 *   key = `app:<appKey>:<env>`（env = "dev" | "main"）
 * 実行環境は APP_ENV（Coolify で dev / main を設定。未設定＝ローカルは dev）。
 *
 * 表示ポリシー（環境で非対称）:
 *   - dev  : 既定表示（行が無ければ ON）。明示的に is_enabled=false のみ非表示。
 *   - main : **明示的に is_enabled=true の行がある場合のみ表示**（行が無ければ非表示）。
 *            本番ランチャーを「公開済みアプリのみ」のクリーンな見た目に保つ。
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
 * 現在の環境で「非表示」にすべきアプリの key 一覧。
 *   - dev  : is_enabled=false の行があるアプリ。
 *   - main : 明示的に is_enabled=true の行が無いアプリ（＝未公開はすべて非表示）。
 * 失敗時は空（fail-open — 障害時は全アプリ表示）。
 */
export async function getDisabledAppKeys(
  env: AppEnv = currentAppEnv(),
): Promise<string[]> {
  try {
    const suffix = `:${env}`;
    const rows = await prisma.featureFlag.findMany({
      where: { key: { startsWith: "app:", endsWith: suffix } },
      select: { key: true, isEnabled: true },
    });
    const state = new Map(
      rows
        .map((r) => [r.key.slice("app:".length, -suffix.length), r.isEnabled])
        .filter(([k]) => (k as string).length > 0) as [string, boolean][],
    );
    const allKeys = appList.map((a) => a.key);
    if (env === "main") {
      // 本番: 明示的に有効化されたアプリのみ表示（それ以外は非表示）。
      return allKeys.filter((k) => state.get(k) !== true);
    }
    // dev: 既定表示（明示的に無効のもののみ非表示）。
    return allKeys.filter((k) => state.get(k) === false);
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
      // dev は行が無ければ有効。main は行が無ければ無効（明示公開のみ表示）。
      APP_ENVS.map((env) => [
        env,
        byKey.get(appFlagKey(app.key, env)) ?? env === "dev",
      ]),
    ) as Record<AppEnv, boolean>,
  }));
}
