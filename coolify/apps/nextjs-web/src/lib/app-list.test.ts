/**
 * app-list.test.ts — アプリ名・カテゴリ名の対訳が全部揃っているかを見る。
 *
 * `app-list.ts` の `label` / `category` は **ja の原文であると同時に内部キー**
 * （`APP_LABEL_I18N` の引き当て先・`CATEGORY_COLORS` のキー）なので、日本語が
 * ベタ書きされているのが正しい。そのぶん未翻訳の走査
 * （tools/i18n/i18n-scan.mjs）では区別が付かず、あのファイルは丸ごと除外して
 * ある — 除外して良いことを担保するのがこのテスト。
 *
 * つまり「新しいアプリを足したが en/zh を書き忘れた」は、走査ではなく
 * **ここ**で落ちる。permission-labels.test.ts が seed のコードとラベルを
 * 突き合わせているのと同じ役割。
 */

import { describe, expect, it } from "vitest";
import {
  APP_LABEL_I18N,
  CATEGORY_COLORS,
  CATEGORY_LABEL_I18N,
  type AppCategory,
  appLabel,
  appList,
  categoryLabel,
} from "./app-list";
import { LOCALES } from "./i18n";

describe("app-list の対訳", () => {
  it("全アプリに en / zh がある", () => {
    const missing = appList
      .filter((app) => {
        const t = APP_LABEL_I18N[app.key];
        return !t?.en?.trim() || !t?.zh?.trim();
      })
      .map((app) => `${app.operationCode} ${app.key}`);
    expect(missing).toEqual([]);
  });

  it("全カテゴリに en / zh がある", () => {
    const missing = Object.keys(CATEGORY_COLORS).filter((c) => {
      const t = CATEGORY_LABEL_I18N[c as AppCategory];
      return !t?.en?.trim() || !t?.zh?.trim();
    });
    expect(missing).toEqual([]);
  });

  it("対訳表に、存在しないアプリのキーが残っていない", () => {
    const keys = new Set(appList.map((a) => a.key));
    const orphans = Object.keys(APP_LABEL_I18N).filter((k) => !keys.has(k));
    expect(orphans).toEqual([]);
  });

  it("どの言語でも空文字を返さない", () => {
    for (const locale of LOCALES) {
      for (const app of appList) {
        expect(appLabel(app, locale), `${app.key}/${locale}`).not.toBe("");
      }
      for (const category of Object.keys(CATEGORY_COLORS) as AppCategory[]) {
        expect(
          categoryLabel(category, locale),
          `${category}/${locale}`,
        ).not.toBe("");
      }
    }
  });

  it("ja は原文（label / category）をそのまま返す", () => {
    const app = appList[0];
    expect(appLabel(app, "ja")).toBe(app.label);
    expect(categoryLabel("販売", "ja")).toBe("販売");
  });
});
