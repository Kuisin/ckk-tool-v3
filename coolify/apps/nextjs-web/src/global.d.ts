/**
 * global.d.ts — next-intl の型付け。
 *
 * **鍵の型検査は付けない。** 以前は `Messages: typeof messages` で ja.json を
 * 正として鍵をコンパイル時に検査させていたが、鍵が 5,700 件を超えた時点で
 * next-intl の `NamespacedMessageKeys`（全ての妥当な「.」区切りパスを
 * リテラル型の合併として列挙する）が TypeScript の型の複雑さの上限に触れ、
 * `TS2590: union type too complex` で**型検査そのものが壊れた**
 * （実在する鍵まで「存在しない」と誤診断される）。
 *
 * 代わりに `tools/i18n-unify/verify-keys.mjs` が**実行時に**同じことを確かめる
 * ——全ファイルの `tr("...")` 呼び出しを走査し、鍵が messages/ja.json に
 * 実在するかを見る。小さな名前空間（`common` / `shell` など、元から
 * next-intl で書いていた場所）なら型検査は問題なく効くが、全体を 1 つの
 * 巨大な合併型にする以上、大小どちらかに合わせるしかない——大きい方が
 * 壊れるので、検査の場所を実行時へ移した。
 */

import type { LOCALES } from "@/lib/i18n";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof LOCALES)[number];
  }
}
