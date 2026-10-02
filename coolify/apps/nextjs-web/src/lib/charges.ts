/**
 * charges.ts — 追加料金の行を書く side（server-only）。
 *
 * 指示書（予定）と出荷書（確定）で保存の形が同じなので、検証と行の組み立てを
 * ここ 1 本に寄せる。判断そのものは lib/charge-core.ts（純ロジック・試験あり）で、
 * ここがやるのは「マスタを引いてきて core に渡し、結果を書く形にする」だけ。
 */

import "server-only";

import { z } from "zod";
import {
  type ChargeItemRef,
  chargeInputError,
  type ResolvedChargeLine,
  resolveChargeLine,
} from "./charge-core";
import { prisma } from "./db";

export const chargeRowsSchema = z
  .array(
    z.object({
      chargeItemId: z.number().int().positive(),
      description: z.string().trim().max(200).optional().default(""),
      quantity: z.number().int().min(1),
      unitPrice: z.number().nullable().optional(),
    }),
  )
  .max(50);

export type ChargeRowsInput = z.infer<typeof chargeRowsSchema>;

/** 保存できる形に直した 1 行（description / sortOrder 込み）。 */
export interface PreparedChargeRow extends ResolvedChargeLine {
  description: string | null;
  sortOrder: number;
}

export type PrepareChargesResult =
  | { ok: true; rows: PreparedChargeRow[] }
  | { ok: false; errorKey: string };

/**
 * 入力 → 保存する行。**固定料金の単価はマスタが勝つ**（画面が何を送ってきても
 * 入力欄を読み取り専用にした約束をここで守る）。
 *
 * 失敗は**文言ではなく鍵**で返す — サーバーと画面が同じ鍵を引けるようにする
 * ため（呼び出し側が `tr(errorKey)` に通す）。
 */
export async function prepareChargeRows(
  input: ChargeRowsInput,
): Promise<PrepareChargesResult> {
  if (input.length === 0) return { ok: true, rows: [] };
  const items = await prisma.chargeItem.findMany({
    where: { id: { in: [...new Set(input.map((r) => r.chargeItemId))] } },
    select: { id: true, amountMode: true, defaultAmount: true },
  });
  const byId = new Map<number, ChargeItemRef>(
    items.map((i) => [
      i.id,
      {
        id: i.id,
        amountMode: i.amountMode,
        defaultAmount: i.defaultAmount != null ? Number(i.defaultAmount) : null,
      },
    ]),
  );

  const rows: PreparedChargeRow[] = [];
  for (const [i, line] of input.entries()) {
    const item = byId.get(line.chargeItemId);
    const error = chargeInputError(line, item);
    if (error) return { ok: false, errorKey: error };
    // chargeInputError が item の不在を先に弾いている。
    const resolved = resolveChargeLine(line, item as ChargeItemRef);
    rows.push({
      ...resolved,
      description: line.description.trim() || null,
      sortOrder: i,
    });
  }
  return { ok: true, rows };
}

/** 監査に残す形（金額まで含めて「何が何円になったか」が読めるように）。 */
export function chargeAuditShape(
  rows: ReadonlyArray<{
    chargeItemId: number;
    description: string | null;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>,
) {
  return rows.map((r) => ({
    chargeItemId: r.chargeItemId,
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    amount: r.amount,
  }));
}
