/**
 * i18n-text.ts — manifest.ts の Playwright ステップから使う、ロケール別 UI 文言の
 * 逆引きヘルパー。
 *
 * アプリの文言は `messages/{ja,en,zh}.json`（next-intl, `t("ns.key")`）にほぼ
 * 全部入っている（`tools/i18n/baseline.json` の未翻訳残数は 0 — ja は原文
 * whose kti key 集合は 3 言語で完全一致する）。manifest.ts の `steps` は元々
 * 撮影時の UI 言語（ja）で書かれた `getByText("保存")` のような**日本語の直書き**で
 * ボタン・ラベルを探していたため、そのままではロケールを en/zh に切り替えた撮影で
 * 対象が見つからず失敗する。
 *
 * このモジュールは「日本語の文字列」ではなく「その文字列が実際に束縛されている
 * next-intl のキー」を manifest 側に書かせ、撮影時のロケールに応じた文言へ解決する
 * ための 1 関数だけを提供する:
 *
 *   text(locale, "common.save")   // ja→"保存" / en→"Save" / zh→"保存"
 *
 * キーは `messages/ja.json` を正として、実際にそのボタン・ラベルが束縛している
 * `t("...")` 呼び出しをアプリのソースで確認してから manifest.ts に書くこと —
 * 同じ日本語の文字列が複数のキーの下にあることがある
 * （例: "印刷" = common.print と common.print2 の両方）ため、文字列からの
 * 自動逆引きは一意に定まらない。実装が呼び出しているキーそのものを指すのが
 * 唯一の正しい対応付け。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_LOCALES = ["ja", "en", "zh"] as const;
export type ManifestLocale = (typeof MANIFEST_LOCALES)[number];

const HERE = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(HERE, "../../coolify/apps/nextjs-web/messages");

type MessageTree = { [key: string]: string | MessageTree };

const cache = new Map<ManifestLocale, MessageTree>();

function loadMessages(locale: ManifestLocale): MessageTree {
  const cached = cache.get(locale);
  if (cached) return cached;
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8");
  const parsed = JSON.parse(raw) as MessageTree;
  cache.set(locale, parsed);
  return parsed;
}

/**
 * `messages/<locale>.json` のドットキー（next-intl と同じ書式、例
 * "common.save" / "sales.quote.title"）を解決してロケール別の文言を返す。
 *
 * キーが無い・値が文字列でないときは投げる（黙って ja へフォールバックすると、
 * en/zh 撮影のつもりで撮った画像が実は ja のままになり、原因が pixelmatch の
 * 差分にしか出ない静かな壊れ方をするため）。
 */
export function text(locale: ManifestLocale, key: string): string {
  const parts = key.split(".");
  let cur: string | MessageTree = loadMessages(locale);
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) {
      throw new Error(
        `i18n-text: key "${key}" not found in messages/${locale}.json (stopped at "${part}")`,
      );
    }
    cur = cur[part];
  }
  if (typeof cur !== "string") {
    throw new Error(
      `i18n-text: key "${key}" resolved to a non-string value in messages/${locale}.json`,
    );
  }
  return cur;
}

/**
 * 撮影の実行ロケール。orchestrate.ts が `--locale` を受けて子プロセスの env
 * `SHOT_LOCALE` に渡す（既定 "ja" — 未指定なら従来どおり全撮影が ja のまま
 * 動く）。manifest.ts はこれを読んで `text(LOCALE, key)` を呼ぶ。
 */
export function currentLocale(): ManifestLocale {
  const v = process.env.SHOT_LOCALE;
  if (v === "en" || v === "zh") return v;
  return "ja";
}
