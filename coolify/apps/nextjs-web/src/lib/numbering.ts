/**
 * numbering.ts — document numbering on app.numbering_sequences
 * (_specs/tables.md §採番管理). Server-only.
 *
 * Formats: PRD-YYYYMM-NNNN (製品) / RGD-YYYYMM-NNNN (再研磨品目) / FRM- (フォーム回答) /
 * DOC- (社内文書) with monthly reset, plus the global serials below.
 *
 * **業務書類の番号（EST / QOT / PRC / ORD / DOR / DRN / INV / PO / PRQ / DSG / WOR /
 * MOV / STK / ACC / OUT）はここでは払い出さない** — 番号設計 PR-C 以降は DB が
 * 作成時に採番する（BEFORE INSERT トリガー app.assign_document_number。自社法人 ×
 * 会計年度の連番、`PREFIX-FFFF-NNNNN`）。アプリは行を作って、返ってきた
 * `docRef` / `docNumber` を読むだけ（lib/doc-number.ts）。Web と共有端末のどちらが
 * 作っても同じ採番を通る。
 * The increment is a single atomic INSERT ... ON CONFLICT statement, so
 * concurrent callers never receive the same number.
 *
 * ⚠️ **nextjs-kiosk との twin file**（`pnpm twin:sync` / twin-files.test.ts）。
 * 共有端末も工程完了で在庫を動かし、そのたびに入出庫伝票を起こす = 採番が要る。
 * 採番の upsert を 2 か所に書くと必ずずれるので、この 1 本を逐語コピーで持つ。
 * 依存は `./db` の prisma だけ（両アプリに同じ形である）。
 */

import { prisma } from "./db";

const SEQUENCES = {
  PRODUCT: { prefix: "PRD", digits: 4 },
  // 再研磨品目 (MS0H)。製品と同じ items 表に載るが、売る**役務**なので
  // 番号を分ける — 一覧・注文請書・請求書で「これは研ぎ直しだ」と
  // コードだけで読めるようにするため。
  REGRIND_ITEM: { prefix: "RGD", digits: 4 },
  // フォーム回答 (CM02)。承認依頼・監査・添付はこの番号で紐づく。
  FORM_RESPONSE: { prefix: "FRM", digits: 5 },
  // 社内文書 (CM03)。DC02「管理マニュアル」とは無関係（あちらはファイル）。
  INTERNAL_PAGE: { prefix: "DOC", digits: 5 },
} as const;

export type NumberingKey = keyof typeof SEQUENCES;

/**
 * Allocate the next (yearMonth, seq) pair for `key`（品目コード・フォーム回答・
 * 社内文書）。`nextDocumentNumber` は整形済みの文字列を返す。
 */
/**
 * JST の YYYYMM（監査 P1-5: コンテナ TZ=UTC だと JST 0:00〜8:59 の伝票が
 * 前月番号になるため、明示的に Asia/Tokyo で導出する）。
 */
export function currentYearMonthJst(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}${month}`;
}

export async function allocateDocumentKey(
  key: NumberingKey,
): Promise<{ yearMonth: string; seq: number }> {
  const { prefix } = SEQUENCES[key];
  const yearMonth = currentYearMonthJst();

  const rows = await prisma.$queryRaw<{ last_sequence: number }[]>`
    INSERT INTO "app"."numbering_sequences"
      ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
    VALUES (${key}, ${prefix}, ${yearMonth}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "last_sequence" = CASE
        WHEN "numbering_sequences"."last_year_month" = ${yearMonth}
          THEN "numbering_sequences"."last_sequence" + 1
        ELSE 1
      END,
      "last_year_month" = ${yearMonth},
      "updated_at" = now()
    RETURNING "last_sequence"
  `;
  const seq = rows[0]?.last_sequence;
  if (!seq) throw new Error(`numbering failed for ${key}`);
  return { yearMonth, seq };
}

/** Next single-column document id, e.g. `PRD-202607-0012`. Resets monthly. */
export async function nextDocumentNumber(key: NumberingKey): Promise<string> {
  const { prefix, digits } = SEQUENCES[key];
  const { yearMonth, seq } = await allocateDocumentKey(key);
  return `${prefix}-${yearMonth}-${String(seq).padStart(digits, "0")}`;
}

// ── Global serials (no monthly reset) ────────────────────────────────────────

const SERIALS = {
  BP: { prefix: "BP", digits: 5 },
  WORK_ORDER: { prefix: "WO", digits: 5 }, // 指示書番号 = ロット番号（生 int で使用）
} as const;

export type SerialKey = keyof typeof SERIALS;

/** Next raw global serial (no reset). 指示書番号・ロット番号はこの生 int。 */
export async function nextSerialNumber(key: SerialKey): Promise<number> {
  const { prefix } = SERIALS[key];
  const rows = await prisma.$queryRaw<{ last_sequence: number }[]>`
    INSERT INTO "app"."numbering_sequences"
      ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
    VALUES (${key}, ${prefix}, NULL, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "last_sequence" = "numbering_sequences"."last_sequence" + 1,
      "updated_at" = now()
    RETURNING "last_sequence"
  `;
  const seq = rows[0]?.last_sequence;
  if (!seq) throw new Error(`numbering failed for ${key}`);
  return seq;
}

/** Next global serial code, e.g. `BP-00012`. Never resets. */
export async function nextSerialCode(key: SerialKey): Promise<string> {
  const { prefix, digits } = SERIALS[key];
  const seq = await nextSerialNumber(key);
  return `${prefix}-${String(seq).padStart(digits, "0")}`;
}
