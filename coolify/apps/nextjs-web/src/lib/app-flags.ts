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

import { APP_ENVS, type AppEnv, currentAppEnv } from "./app-env";
import { type AppCategory, appList } from "./app-list";
import { prisma } from "./db";
import { hiddenDevFeatureAppKeys } from "./dev-features";

// 環境の識別は app-env.ts が持つ（proxy / クライアントからも読めるように切り出した）。
// 既存の呼び出し口を壊さないためここから再輸出する。
export { type AppEnv, APP_ENVS, currentAppEnv };

/** feature_flags のキー。 */
export function appFlagKey(appKey: string, env: AppEnv): string {
  return `app:${appKey}:${env}`;
}

/**
 * 現在の環境で「非表示」にすべきアプリの key 一覧。
 *   - dev  : is_enabled=false の行があるアプリ。
 *   - main : 明示的に is_enabled=true の行が無いアプリ（＝未公開はすべて非表示）。
 * 失敗時は DB 由来の判断だけを諦める（fail-open — 障害時は全アプリ表示）。
 *
 * **開発中機能（dev-features.json）の分は必ず合流する** — DB の行がコード側の
 * ゲートを覆せないようにするため、fail-open の catch でも落とさない。
 */
export async function getDisabledAppKeys(
  env: AppEnv = currentAppEnv(),
): Promise<string[]> {
  const hiddenByFeature = hiddenDevFeatureAppKeys(env);
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
    const disabled =
      env === "main"
        ? // 本番: 明示的に有効化されたアプリのみ表示（それ以外は非表示）。
          allKeys.filter((k) => state.get(k) !== true)
        : // dev: 既定表示（明示的に無効のもののみ非表示）。
          allKeys.filter((k) => state.get(k) === false);
    return [...new Set([...disabled, ...hiddenByFeature])];
  } catch (e) {
    console.error("getDisabledAppKeys failed", e);
    return hiddenByFeature;
  }
}

export interface AppFlagRow {
  key: string;
  label: string;
  operationCode: string;
  category: AppCategory;
  /** 環境ごとの有効状態（行が無ければ true）。 */
  enabled: Record<AppEnv, boolean>;
  /**
   * 環境ごとの「コード側で固定されているか」（dev-features.json）。
   * true の環境は DB の行に関わらず非表示なので、画面は切り替えを無効にする —
   * さもないと有効に見えるのに出ない、という嘘の表示になる。
   */
  lockedByFeature: Record<AppEnv, boolean>;
}

/** 管理画面用: 全アプリ × 全環境の有効状態。 */
export async function listAppFlags(): Promise<AppFlagRow[]> {
  const rows = await prisma.featureFlag.findMany({
    where: { key: { startsWith: "app:" } },
    select: { key: true, isEnabled: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.isEnabled]));
  const hiddenByEnv = Object.fromEntries(
    APP_ENVS.map((env) => [env, new Set(hiddenDevFeatureAppKeys(env))]),
  ) as Record<AppEnv, Set<string>>;
  return appList.map((app) => ({
    key: app.key,
    label: app.label,
    operationCode: app.operationCode,
    category: app.category,
    enabled: Object.fromEntries(
      // dev は行が無ければ有効。main は行が無ければ無効（明示公開のみ表示）。
      // 開発中機能に属するアプリはコード側の判断が勝つ。
      APP_ENVS.map((env) => [
        env,
        hiddenByEnv[env].has(app.key)
          ? false
          : (byKey.get(appFlagKey(app.key, env)) ?? env === "dev"),
      ]),
    ) as Record<AppEnv, boolean>,
    lockedByFeature: Object.fromEntries(
      APP_ENVS.map((env) => [env, hiddenByEnv[env].has(app.key)]),
    ) as Record<AppEnv, boolean>,
  }));
}
