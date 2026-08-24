/**
 * backfill-bp-aliases.ts — 取引先の AI 照合名（match_names）を一括で埋める。
 *
 * **一度きりの処理**。既存の取引先には社名そのものしか入っておらず、
 * 「(株)」「㈱」「全角英字」「かな」「ローマ字」といった書き方の揺れに当たらない。
 * lib/company-aliases の機械的な変換だけを足す（漢字の読みは作らない）。
 *
 * 使い方（shared-db への接続が要る — トンネル経由なら DATABASE_URL を差し替え）:
 *   pnpm exec tsx scripts/backfill-bp-aliases.ts            # 何が増えるか出すだけ
 *   pnpm exec tsx scripts/backfill-bp-aliases.ts --apply    # 実際に更新する
 *
 * 既存の値は消さない（和集合を書き戻す）ので、途中で止めても再実行して構わない。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client.js";
import {
  generateAliases,
  missingKeywordFormats,
} from "../src/lib/company-aliases";

const APPLY = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
// アプリと同じ driver adapter 構成（lib/db.ts と合わせる）。
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

interface NameJson {
  ja?: string;
  en?: string;
}

async function main() {
  const rows = await prisma.businessPartner.findMany({
    where: { isActive: true },
    select: {
      id: true,
      bpCode: true,
      name: true,
      nameKana: true,
      shortName: true,
      matchNames: true,
    },
    orderBy: { bpCode: "asc" },
  });

  let updated = 0;
  let addedTotal = 0;
  let needReading = 0;
  const samples: string[] = [];

  for (const r of rows) {
    const name = (r.name ?? {}) as NameJson;
    const nameJa = (name.ja ?? "").trim();
    if (!nameJa) continue;

    const existing = r.matchNames ?? [];
    const additions = generateAliases({
      nameJa,
      nameEn: name.en ?? null,
      nameKana: r.nameKana,
      shortName: r.shortName,
      existing,
    });
    const missing = missingKeywordFormats({
      nameJa,
      nameKana: r.nameKana,
      existing: [...existing, ...additions],
    });
    if (missing.needsReading) needReading += 1;

    if (additions.length === 0) continue;
    updated += 1;
    addedTotal += additions.length;
    if (samples.length < 10) {
      samples.push(`${r.bpCode} ${nameJa}\n    + ${additions.join(" / ")}`);
    }

    if (APPLY) {
      await prisma.businessPartner.update({
        where: { id: r.id },
        // 和集合（既存は消さない）
        data: { matchNames: [...new Set([...existing, ...additions])] },
      });
    }
  }

  console.log(`対象 ${rows.length} 件`);
  console.log(`  照合名が増える取引先: ${updated} 件（追加 ${addedTotal} 語）`);
  console.log(
    `  フリガナが無く かな/ローマ字 を作れない取引先: ${needReading} 件` +
      "（画面の「推奨」からフリガナを入れると生成できる）",
  );
  console.log("\n例:");
  for (const s of samples) console.log(`  ${s}`);
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
