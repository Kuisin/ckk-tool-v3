/**
 * enum-labels-coverage.test.ts — **DB の enum の値が、必ず画面の文言を持つ**。
 *
 * 画面に出る区分（事由・向き・状態…）は `messages/*.json` の
 * `enum.<ENUM>_LABEL` から引く。引けなかったとき `resolveLabel` は
 * **値そのもの**を返すので、`MANUAL` や `OUTSOURCE_ISSUE` という英大文字が
 * そのまま画面に出る。マニュアルの絶対ルール（英語の状態名を出さない）に
 * 反するのに、落ちも警告もしないので気づけない。
 *
 * 実際に、手動入出庫 (ST06) を足したとき `MANUAL` の行が 3 言語とも無く、
 * 入出庫伝票の一覧と絞り込みに `MANUAL` と出ていた。
 *
 * 検査するのは「ラベル表がある enum」だけ — 表を持たない enum（内部区分）まで
 * 要求すると、画面に出ない値の翻訳を増やすだけになる。
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";

const DICTS: Record<string, Record<string, Record<string, string>>> = {
  ja: ja.enum as Record<string, Record<string, string>>,
  en: en.enum as Record<string, Record<string, string>>,
  zh: zh.enum as Record<string, Record<string, string>>,
};

/**
 * 値を持たなくてよい組み合わせ。**理由を書く**（書けないなら足すべき）。
 */
const EXEMPT: Record<string, { values: string[]; reason: string }> = {
  INSPECTION_STATUS_LABEL: {
    values: ["APPROVED"],
    reason:
      "検査記録の PDF だけが使う値で、文言は pdf.inspectionRecord.approvedStatus が持つ（「合格（承認済）」）",
  },
};

/** Prisma の enum 名 → 文言表の名前（UpperCamel → UPPER_SNAKE + _LABEL）。 */
function labelMapName(enumName: string): string {
  return `${enumName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_LABEL`;
}

function schemaEnums(): Record<string, string[]> {
  const dir = path.resolve(__dirname, "../../prisma/schema");
  const out: Record<string, string[]> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".prisma"))) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    const re = /enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let m: RegExpExecArray | null = re.exec(source);
    while (m !== null) {
      out[m[1]] = [...m[2].matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\b/gm)].map(
        (v) => v[1],
      );
      m = re.exec(source);
    }
  }
  return out;
}

describe("区分の文言", () => {
  const enums = schemaEnums();

  it("スキーマから enum を読めている", () => {
    expect(Object.keys(enums).length).toBeGreaterThan(20);
  });

  it("ラベル表がある enum の値は 3 言語すべてに文言がある", () => {
    const missing: string[] = [];
    for (const [name, values] of Object.entries(enums)) {
      const map = labelMapName(name);
      if (!DICTS.ja[map]) continue; // 画面に出さない enum
      const exempt = new Set(EXEMPT[map]?.values ?? []);
      for (const [locale, dict] of Object.entries(DICTS)) {
        for (const value of values) {
          if (exempt.has(value)) continue;
          if (dict[map]?.[value] === undefined)
            missing.push(`${locale}: ${map}.${value}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
