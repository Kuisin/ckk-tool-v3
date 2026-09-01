/**
 * operation-codes.i18n.test.ts — 操作コードの表示名が全件、全言語で解決するか。
 *
 * `OPERATION_CODES[].label` は ja の完成形（「見積書 新規」）で、対訳は
 * **`app-list.ts` の 1 箇所だけ**にある。ja の名前で引き当てる作りなので、
 * アプリ名を片方だけ直すと（例: app-list の label は変えたが操作コード側は
 * 据え置き）引き当てが外れ、en/zh で日本語のまま出る — 型では捕まらない。
 * それをここで落とす。
 *
 * app-list.test.ts と同じ理由で、このファイルは未翻訳の走査
 * （tools/i18n/i18n-scan.mjs）から除外してある。除外して良い根拠がこのテスト。
 */

import { describe, expect, it } from "vitest";
import { LOCALES } from "./i18n";
import { OPERATION_CODES, operationCodeLabel } from "./operation-codes";

describe("操作コードの表示名", () => {
  it("ja はレジストリの label をそのまま返す", () => {
    for (const entry of OPERATION_CODES) {
      expect(operationCodeLabel(entry, "ja")).toBe(entry.label);
    }
  });

  /**
   * 「訳が無い」は `operationCodeLabel` が ja の label をそのまま返すことで
   * 表面化する（フォールバック）。en/zh でそれが起きた = 引き当てが外れている。
   */
  it("en / zh で日本語のまま返るコードが無い", () => {
    const unresolved: string[] = [];
    for (const entry of OPERATION_CODES) {
      for (const locale of LOCALES) {
        if (locale === "ja") continue;
        if (operationCodeLabel(entry, locale) === entry.label) {
          unresolved.push(`${entry.code} ${entry.label} (${locale})`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("どの言語でも空文字を返さない", () => {
    for (const entry of OPERATION_CODES) {
      for (const locale of LOCALES) {
        expect(operationCodeLabel(entry, locale), entry.code).not.toBe("");
      }
    }
  });

  it("新規 / 詳細 は基底名に接尾辞が付く（一覧は付かない）", () => {
    const byCode = (code: string) => {
      const entry = OPERATION_CODES.find((e) => e.code === code);
      if (!entry) throw new Error(`操作コードが見つかりません: ${code}`);
      return entry;
    };
    expect(operationCodeLabel(byCode("SA03"), "en")).toBe("Quote");
    expect(operationCodeLabel(byCode("SA13"), "en")).toBe("Quote – new");
  });
});
