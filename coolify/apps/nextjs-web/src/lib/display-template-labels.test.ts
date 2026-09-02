/**
 * display-template-labels.test.ts — display-templates.ts（twin file）が持つ鍵が
 * 実際に messages/<locale>.json で解決されること。
 *
 * ここが守るもの: 鍵の綴りが 1 文字でもずれると `label()` は ja フォールバック
 * すら見つけられず、渡した鍵の文字列がそのまま画面に出る。それを機械的に検知する。
 */

import { describe, expect, it } from "vitest";
import {
  findLocalizedDisplayTemplate,
  localizedDisplayTemplates,
} from "./display-template-labels";
import { DISPLAY_TEMPLATES } from "./display-templates";
import type { Locale } from "./i18n";
import { LOCALES } from "./i18n";

/** `label()` が鍵を解決できなかったときにだけ現れる形（鍵そのものが返る）。 */
function looksLikeUnresolvedKey(value: string): boolean {
  return value.startsWith("displayTemplates.");
}

describe("localizedDisplayTemplates", () => {
  it.each(LOCALES)(
    "%s — すべてのテンプレート文言が解決される",
    (locale: Locale) => {
      for (const t of localizedDisplayTemplates(locale)) {
        expect(looksLikeUnresolvedKey(t.label)).toBe(false);
        expect(looksLikeUnresolvedKey(t.description)).toBe(false);
        for (const spec of t.options) {
          expect(looksLikeUnresolvedKey(spec.label)).toBe(false);
          if (spec.help) expect(looksLikeUnresolvedKey(spec.help)).toBe(false);
          if (spec.kind === "number" && spec.suffix) {
            expect(looksLikeUnresolvedKey(spec.suffix)).toBe(false);
          }
          if (spec.kind === "text" && spec.placeholder) {
            expect(looksLikeUnresolvedKey(spec.placeholder)).toBe(false);
          }
          if (spec.kind === "select") {
            for (const c of spec.choices) {
              expect(looksLikeUnresolvedKey(c.label)).toBe(false);
            }
          }
        }
      }
    },
  );

  it("元の登録簿と同じ順序・同じキー構成を保つ（構造は変えない）", () => {
    const localized = localizedDisplayTemplates("ja");
    expect(localized.map((t) => t.key)).toEqual(
      DISPLAY_TEMPLATES.map((t) => t.key),
    );
    for (const [i, t] of localized.entries()) {
      expect(t.options.map((o) => o.key)).toEqual(
        DISPLAY_TEMPLATES[i]?.options.map((o) => o.key),
      );
    }
  });
});

describe("findLocalizedDisplayTemplate", () => {
  it("既知のキーを ja の文言で引ける", () => {
    expect(findLocalizedDisplayTemplate("production", "ja")?.label).toBe(
      "生産状況",
    );
  });

  it("未知・null・undefined は undefined", () => {
    expect(findLocalizedDisplayTemplate("nope", "ja")).toBeUndefined();
    expect(findLocalizedDisplayTemplate(null, "ja")).toBeUndefined();
    expect(findLocalizedDisplayTemplate(undefined, "ja")).toBeUndefined();
  });
});
