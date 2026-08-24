/**
 * import-bp-kana.ts — 取引先のフリガナ（name_kana）を CSV から取り込み、
 * 自動生成の照合名（match_names_auto）を作り直す。**一度きり**。
 *
 * 入力 CSV: `BPコード,フリガナ,確信度`（確信度 = high / medium / low）
 * フリガナは全角カタカナのみ。形式が違う行は取り込まずに報告する。
 *
 * あわせて、以前 match_names に混ぜてしまったフリガナ由来の表記
 * （ひらがな・ローマ字）を取り除く — その 2 つは画面に出さない
 * match_names_auto の担当になったため。
 *
 *   pnpm exec tsx scripts/import-bp-kana.ts <csv...>           # 差分を出すだけ
 *   pnpm exec tsx scripts/import-bp-kana.ts <csv...> --apply   # 実際に更新する
 */

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client.js";
import { autoMatchNames } from "../src/lib/company-aliases";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) throw new Error("CSV ファイルを指定してください");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** 全角カタカナ + 長音 + 中黒 のみ。 */
const KATAKANA_ONLY = /^[ァ-ヺー・]+$/;

interface Reading {
  kana: string;
  confidence: string;
}

/** CSV を読む（社名にカンマがあるので引用符に対応した最小パーサ）。 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

async function main() {
  const readings = new Map<string, Reading>();
  const rejected: string[] = [];
  for (const file of files) {
    for (const cols of parseCsv(readFileSync(file, "utf8"))) {
      const [code, kana, confidence] = cols.map((c) => c.trim());
      if (!code || !kana) continue;
      if (!KATAKANA_ONLY.test(kana)) {
        rejected.push(`${code} 「${kana}」（全角カタカナ以外を含む）`);
        continue;
      }
      readings.set(code, { kana, confidence: confidence || "unknown" });
    }
  }
  console.log(
    `読み込み ${readings.size} 件 / 形式不正で除外 ${rejected.length} 件`,
  );
  for (const r of rejected.slice(0, 10)) console.log(`  除外: ${r}`);

  const rows = await prisma.businessPartner.findMany({
    select: {
      id: true,
      bpCode: true,
      name: true,
      nameKana: true,
      matchNames: true,
      matchNamesAuto: true,
    },
  });

  let kanaSet = 0;
  let autoBuilt = 0;
  let strippedTotal = 0;
  const byConfidence: Record<string, number> = {};

  for (const r of rows) {
    if (!r.bpCode) continue;
    const incoming = readings.get(r.bpCode);
    // 既にフリガナが入っている行は **上書きしない**（人が入れた値を尊重）。
    const nameKana = r.nameKana?.trim() || incoming?.kana || null;
    if (!r.nameKana?.trim() && incoming) {
      kanaSet += 1;
      byConfidence[incoming.confidence] =
        (byConfidence[incoming.confidence] ?? 0) + 1;
    }

    const nameJa = ((r.name ?? {}) as { ja?: string }).ja ?? "";
    const auto = autoMatchNames({ nameJa, nameKana });
    // 以前 match_names に混ぜたフリガナ由来（ひらがな・ローマ字）を外す。
    const strip = new Set(auto.filter((v) => !/[ァ-ヺ]/.test(v)));
    const cleaned = r.matchNames.filter((v) => !strip.has(v));
    strippedTotal += r.matchNames.length - cleaned.length;
    if (auto.length > 0) autoBuilt += 1;

    if (!APPLY) continue;
    await prisma.businessPartner.update({
      where: { id: r.id },
      data: { nameKana, matchNames: cleaned, matchNamesAuto: auto },
    });
  }

  console.log(`\nフリガナを入れる          : ${kanaSet} 件`);
  for (const [k, v] of Object.entries(byConfidence).sort()) {
    console.log(`    確信度 ${k}: ${v} 件`);
  }
  console.log(`自動照合名を作れる取引先  : ${autoBuilt} 件`);
  console.log(`AI照合名から外すかな/ローマ字: ${strippedTotal} 語`);
  console.log(
    APPLY ? "\n→ 更新しました" : "\n→ 変更していません（--apply で実行）",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
