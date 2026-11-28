import "server-only";

/**
 * doc-ids.ts — 書類の鍵（参照 doc_ref）→ 行の uuid。server-only.
 *
 * 番号設計 PR-B で、年月 + 連番を主キーにしていた 7 表（価格試算・
 * 価格表・見積書・注文請書・出荷書・納品書・請求書）は uuid の id を主キーに
 * 持ち、子の表はその id を FK で指すようになった。画面・URL は書類を
 * 「法人コード + 番号」（lib/doc-number.ts DocKey = doc_ref）で指すので、
 * 子の行を作るときはここで id を引く。
 *
 * 見つからなければ例外 — 子の行を作る直前に親が消えている（または番号が
 * 間違っている）ので、黙って作らずにトランザクションごと落とす。
 */

import { type Prisma, prisma } from "@/lib/db";
import type { DocKey } from "@/lib/doc-number";

type Db = Prisma.TransactionClient | typeof prisma;

const byKey = (key: DocKey) => ({
  where: { docRef: key.docRef },
  select: { id: true },
});

export async function estimateIdOf(key: DocKey, db: Db = prisma) {
  return (await db.estimate.findUniqueOrThrow(byKey(key))).id;
}
export async function priceListEntryIdOf(key: DocKey, db: Db = prisma) {
  return (await db.priceListEntry.findUniqueOrThrow(byKey(key))).id;
}
export async function quoteIdOf(key: DocKey, db: Db = prisma) {
  return (await db.quote.findUniqueOrThrow(byKey(key))).id;
}
export async function orderAcceptanceIdOf(key: DocKey, db: Db = prisma) {
  return (await db.orderAcceptance.findUniqueOrThrow(byKey(key))).id;
}
export async function deliveryOrderIdOf(key: DocKey, db: Db = prisma) {
  return (await db.deliveryOrder.findUniqueOrThrow(byKey(key))).id;
}
export async function deliveryNoteIdOf(key: DocKey, db: Db = prisma) {
  return (await db.deliveryNote.findUniqueOrThrow(byKey(key))).id;
}
export async function invoiceIdOf(key: DocKey, db: Db = prisma) {
  return (await db.invoice.findUniqueOrThrow(byKey(key))).id;
}

/** 出荷書の id と発行元（納品書は出荷書の法人を継ぐ — lib/doc-company-core.ts）。 */
export async function deliveryOrderRefOf(key: DocKey, db: Db = prisma) {
  return db.deliveryOrder.findUniqueOrThrow({
    where: { docRef: key.docRef },
    select: { id: true, ownCompanyId: true },
  });
}
