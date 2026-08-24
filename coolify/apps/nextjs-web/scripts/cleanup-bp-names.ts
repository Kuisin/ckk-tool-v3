/**
 * cleanup-bp-names.ts — 取引先の社名の表記を整える（一度きり）。
 *
 * 旧システムからの取込で、社名に **半角カナ**（ﾂｰﾘﾝｸﾞ / ﾃﾞｼﾞﾀﾙ）や
 * **全角スペース・前後空白・連続空白** が混ざっている。表示が揃わないだけでなく、
 * 突合は完全一致なので「同じ会社なのに書き方違いで当たらない」原因にもなる。
 *
 * 直すのは **明らかに入力の副産物だけ**:
 *   - 半角カナ → 全角カナ（濁点も合成する）
 *   - 全角スペース → 半角、前後の空白除去、連続空白を 1 つに
 *   - 末尾の孤立した「.」「、」
 *
 * **触らないもの**（人の判断が要る／意図的な表記のため）:
 *   - ㈱ と (株)、全角括弧と半角括弧 … どちらで書かれた注文書も来るので、
 *     表記を統一せず **両方を照合名に持つ**のが正解（backfill 済み）
 *   - 重複疑い・支店/工場の派生行の統合、行の削除
 *
 * 直す前の綴りは **照合名に残す**（古い綴りで書かれた書類が当たらなくなるのを防ぐ）。
 *
 *   pnpm exec tsx scripts/cleanup-bp-names.ts          # 差分を出すだけ
 *   pnpm exec tsx scripts/cleanup-bp-names.ts --apply  # 実際に更新する
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client.js";

const APPLY = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** 半角カナの範囲（濁点・半濁点を含む）。 */
const HALF_KANA_RUN = /[｡-ﾟ]+/g;

/**
 * 表記を整える。**半角カナの連なりだけ** に NFKC をかけるので、
 * ㈱ や全角括弧はそのまま残る（NFKC を全体にかけると ㈱ → (株) まで変わる）。
 */
export function tidyName(raw: string): string {
  let s = raw.replace(HALF_KANA_RUN, (run) => run.normalize("NFKC"));
  s = s.replace(/　/g, " "); // 全角スペース
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[.、]+$/, ""); // 末尾の孤立した句読点
  return s;
}

interface NameJson {
  ja?: string;
  en?: string;
}

async function main() {
  const rows = await prisma.businessPartner.findMany({
    select: { id: true, bpCode: true, name: true, matchNames: true },
    orderBy: { bpCode: "asc" },
  });

  let changed = 0;
  for (const r of rows) {
    const name = (r.name ?? {}) as NameJson;
    const ja = name.ja ?? "";
    const en = name.en ?? "";
    const tidyJa = tidyName(ja);
    const tidyEn = tidyName(en);
    if (tidyJa === ja && tidyEn === en) continue;

    changed += 1;
    console.log(`${r.bpCode}`);
    if (tidyJa !== ja) console.log(`    ja: 「${ja}」 → 「${tidyJa}」`);
    if (tidyEn !== en) console.log(`    en: 「${en}」 → 「${tidyEn}」`);

    if (!APPLY) continue;
    // 元の綴りは照合名に残す（その書き方の注文書が来ても当たるように）。
    const keep = [...new Set([...r.matchNames, ja, en].filter(Boolean))];
    await prisma.businessPartner.update({
      where: { id: r.id },
      data: {
        name: { ...name, ja: tidyJa, ...(en ? { en: tidyEn } : {}) },
        matchNames: keep,
      },
    });
  }

  console.log(`\n対象 ${rows.length} 件 / 表記を直す ${changed} 件`);
  console.log(
    APPLY ? "→ 更新しました" : "→ 変更していません（--apply で実行）",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
