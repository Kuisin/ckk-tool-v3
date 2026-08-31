/**
 * dev-features.ts — 開発中の機能を環境で閉じるゲート（fail-closed）。
 *
 * ■ なぜ feature_flags（lib/app-flags.ts）ではないのか
 *
 * 1. **dev と main は同じ DB を共有する。** feature_flags の行は SY05 の画面から
 *    切り替えられるので、main の行を 1 つ足すだけで未完成の機能が本番で開く。
 *    ここに置けば、main で有効化するには PR とデプロイが要る。
 * 2. `getDisabledAppKeys()` は**ランチャー描画用で fail-open**（DB 障害時は全アプリ
 *    表示）。未認証の外部向け面のゲートに fail-open は使えない。
 * 3. feature_flags はアプリ 1 つの ON/OFF しか表現できない。「機能」はページ・API・
 *    メール送信・管理アプリにまたがるので粒度が合わない。
 *
 * ■ 判断の正は src/config/dev-features.json の 1 本
 *
 * `environments` に現在の APP_ENV が入っていなければ、その機能に属する面は
 * **すべて 404 になる**（ページ・ルートハンドラ・ランチャー）。未知のキー、
 * 壊れた JSON、環境不一致 — どれも false に倒す。
 *
 * DB も env 以外の I/O も持たない純粋なモジュール。proxy（Edge）・サーバー・
 * クライアントのどこからでも読めるよう `server-only` は付けない。
 */

import devFeaturesJson from "../config/dev-features.json";
import { APP_ENVS, type AppEnv, currentAppEnv } from "./app-env";

/**
 * 機能キー。**src/config/dev-features.json のキーと一致していること** —
 * dev-features.test.ts が両者の集合の一致を固定するので、JSON だけ直して
 * ここを直し忘れると CI が落ちる。
 */
export type DevFeatureKey = "portal" | "display";

export interface DevFeature {
  /** 何の機能か（人間向け。判定には使わない）。 */
  description: string;
  /** この機能を出してよい環境。空配列 = どこにも出ない。 */
  environments: AppEnv[];
  /** この機能が持つ app-list のキー（ランチャーから消すため）。 */
  appKeys: string[];
}

function isAppEnv(v: unknown): v is AppEnv {
  return typeof v === "string" && (APP_ENVS as readonly string[]).includes(v);
}

/**
 * JSON を検証して取り込む。**1 件でも形が違えばその機能ごと捨てる**（fail-closed）
 * — 「壊れているが有効」という状態を作らない。
 */
function parse(raw: unknown): Map<string, DevFeature> {
  const out = new Map<string, DevFeature>();
  if (typeof raw !== "object" || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    if (typeof v.description !== "string") continue;
    if (!Array.isArray(v.environments) || !v.environments.every(isAppEnv))
      continue;
    if (
      !Array.isArray(v.appKeys) ||
      !v.appKeys.every((k) => typeof k === "string")
    )
      continue;
    out.set(key, {
      description: v.description,
      environments: [...new Set(v.environments)] as AppEnv[],
      appKeys: [...new Set(v.appKeys as string[])],
    });
  }
  return out;
}

const FEATURES = parse(devFeaturesJson);

/** 登録されている機能キー（テスト・管理表示用）。 */
export function devFeatureKeys(): string[] {
  return [...FEATURES.keys()].sort();
}

export function devFeature(key: string): DevFeature | null {
  return FEATURES.get(key) ?? null;
}

/**
 * その機能をこの環境で出してよいか。
 *
 * **これが唯一の判定口。** ページ・ルートハンドラ・ランチャー・メール送信の
 * すべてがここを通る（どれか 1 つでも通し忘れると公開面が残る）。
 */
export function isDevFeatureEnabled(
  key: DevFeatureKey,
  env: AppEnv = currentAppEnv(),
): boolean {
  return FEATURES.get(key)?.environments.includes(env) ?? false;
}

/**
 * この環境で**隠すべき** app-list のキー。
 *
 * lib/app-flags.ts の `getDisabledAppKeys()` がこれを合流させるので、
 * DB に `app:<key>:main = true` の行があってもコード側のゲートが勝つ。
 */
export function hiddenDevFeatureAppKeys(
  env: AppEnv = currentAppEnv(),
): string[] {
  const hidden = new Set<string>();
  for (const feature of FEATURES.values()) {
    if (feature.environments.includes(env)) continue;
    for (const key of feature.appKeys) hidden.add(key);
  }
  return [...hidden];
}
