/**
 * enum-labels-complete.test.ts — Prisma の enum に値を足したら、その enum の
 * ラベル表（messages/*.json の `enum.<ENUM>_LABEL`）にも 3 言語ぶん足されて
 * いることを見張る。
 *
 * `resolveLabel`（lib/enum-labels.ts）は鍵が無いと**生の enum 値で黙って
 * フォールバックする**ので、足し忘れは型でも lint でも止まらず、画面に
 * "MANUAL" のような英大文字がそのまま出るまで誰も気づかない
 * （2026-09 の ST06 手動入出庫がまさにそれだった — 事由 MANUAL を足したのに
 * INVENTORY_MOVEMENT_CAUSE_LABEL に鍵が無く、伝票一覧・詳細が全部 "MANUAL"）。
 *
 * 対応は名前で取る: ラベル表 `FOO_BAR_LABEL` ↔ Prisma enum `FooBar`。
 * 名前の合う enum が無い表（アプリ側だけの区分）はここでは見ない。
 */

import { describe, expect, it } from "vitest";
import * as PrismaEnums from "../../generated/client/enums";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";

type Tree = Record<string, unknown>;

function enumNameOf(mapName: string): string {
  return mapName
    .replace(/_LABEL$/, "")
    .toLowerCase()
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

const catalogs: Record<string, Tree> = { ja, en, zh };

describe("Prisma enum の全値にラベルがある", () => {
  const maps = Object.keys((ja as Tree).enum as Tree).filter((k) =>
    k.endsWith("_LABEL"),
  );
  const paired = maps
    .map((map) => [map, enumNameOf(map)] as const)
    .filter(([, name]) => name in PrismaEnums);

  it("名前で対応づく enum が 1 つ以上ある（対応規則が壊れていない）", () => {
    expect(paired.length).toBeGreaterThan(10);
  });

  for (const [map, name] of paired) {
    it(`${map} ↔ ${name}`, () => {
      const values = Object.values(
        (PrismaEnums as unknown as Record<string, Record<string, string>>)[
          name
        ],
      );
      const missing: string[] = [];
      for (const [locale, tree] of Object.entries(catalogs)) {
        const labels = ((tree.enum as Tree)[map] ?? {}) as Record<
          string,
          string
        >;
        for (const v of values) {
          if (!labels[v]?.trim()) missing.push(`${locale}: ${v}`);
        }
      }
      expect(missing).toEqual([]);
    });
  }
});
