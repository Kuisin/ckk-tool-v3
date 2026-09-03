"use server";

/**
 * Server Actions — 納品書 (app.delivery_notes, SH02).
 *
 * **作成はここには無い。** 出荷書の確定 (DRAFT → CONFIRMED) 時に
 * shipping/delivery-orders/actions.ts の confirmDeliveryOrder が自動で作る
 * （通常配送は 1 通、ユーザー直送は 2 通 — 価格記載なしを最終需要家へ・
 * 価格記載ありを顧客へ。lib 側の計画は
 * components/shipping/delivery-orders/model.ts の planAutoDeliveryNotes）。
 * ここは下書きの編集（明細は全置換）とライフサイクル操作だけを持つ。
 *
 * ステータス遷移: DRAFT →(発行)→ ISSUED →(納品)→ DELIVERED。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission, requireAnyRead } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatProductNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/shipping/delivery-notes";

/**
 * 対象納品書がスコープ内か（PLANT = 出荷書の出荷元拠点 ∪ OWN = 作成者）。
 * ALL は素通し。不存在は true — 既存の not-found 系エラー処理に委ねる。
 */
async function deliveryNoteInScope(
  access: Access,
  userId: string,
  key: DocKey,
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.deliveryNote.findUnique({
    where: { yearMonth_seq: key },
    select: {
      createdBy: true,
      deliveryOrder: { select: { fromPlantId: true } },
    },
  });
  if (!row) return true;
  return rowInScope(
    access,
    { plantIds: [row.deliveryOrder.fromPlantId], createdBy: row.createdBy },
    userId,
  );
}

function itemInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    productId: z.string().min(1, tr("common.selectAProduct")),
    quantity: z
      .number()
      .int()
      .min(1, tr("shipping.deliveryNoteActions.quantityMustBeAtLeastOne")),
    unitPrice: z.number().min(0).nullable(),
    notes: z.string().nullable(),
  });
}

function baseInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    /**
     * 営業担当。未指定なら出荷書の担当を引き継ぎ、それも無ければ納品先の
     * 主担当が入る（lib/sales-rep）。納品先は作成後不変。
     */
    salesRepId: z.string().nullable().optional(),
    deliveryMethod: z.enum(["NORMAL", "DIRECT_TO_USER"]),
    endUserBpId: z.string().nullable(),
    includePrice: z.boolean(),
    notes: z.string().nullable(),
    items: z
      .array(itemInputSchema(tr))
      .min(1, tr("common.addAtLeastOneLineItem")),
  });
}

export type DeliveryNoteUpdateInput = z.infer<
  ReturnType<typeof baseInputSchema>
>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

interface ItemInputValue {
  productId: string;
  quantity: number;
  unitPrice: number | null;
  notes: string | null;
}

/** 明細行 → DB 値。価格記載なしのときは単価・金額を保存しない。 */
function toItemData(it: ItemInputValue, i: number, includePrice: boolean) {
  const unitPrice = includePrice ? (it.unitPrice ?? 0) : null;
  return {
    productId: Number(it.productId),
    quantity: it.quantity,
    unitPrice,
    // 金額はサーバー側で計算（クライアント表示値は信用しない）。
    amount: unitPrice != null ? unitPrice * it.quantity : null,
    notes: trimOrNull(it.notes),
    sortOrder: i,
  };
}

/** 最終需要家（END_USER ロールの有効 BP）検索 — ユーザー直送の届け先 Select。 */
export async function searchEndUserOptions(
  query: string,
): Promise<{ value: string; label: string }[]> {
  if (!(await requireAnyRead(["delivery_note", "order_acceptance"])).ok) {
    return [];
  }
  const q = query.trim();
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      roleAssignments: { some: { role: "END_USER", isActive: true } },
      ...(q
        ? {
            OR: [
              { bpCode: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
              { matchNames: { has: q } },
            ],
          }
        : {}),
    },
    orderBy: { bpCode: "asc" },
    take: 20,
  });
  return rows.map((r) => ({
    value: r.id,
    label: localized(r.name as LocalizedText | null),
  }));
}

/**
 * 納品書明細の出荷書整合検証（監査 P2-7）: 出荷書に存在する製品のみ・
 * 製品別 Σ数量 ≦ 出荷数量。違反行は製品名入りのエラー文字列を返す。
 */
async function validateItemsAgainstShipment(
  shpKey: { yearMonth: string; seq: number },
  items: { productId: string | number; quantity: number }[],
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string | null> {
  const shipItems = await prisma.deliveryOrderItem.findMany({
    where: {
      deliveryOrderYearMonth: shpKey.yearMonth,
      deliveryOrderSeq: shpKey.seq,
    },
    select: { productId: true, quantity: true },
  });
  const shippedByProduct = new Map<number, number>();
  for (const it of shipItems) {
    shippedByProduct.set(
      it.productId,
      (shippedByProduct.get(it.productId) ?? 0) + it.quantity,
    );
  }
  const requested = new Map<number, number>();
  for (const it of items) {
    const pid = Number(it.productId);
    requested.set(pid, (requested.get(pid) ?? 0) + it.quantity);
  }
  // エラー文には内部 ID ではなく画面と同じ表記（製品名 + 製品コード）を出す。
  const products = await prisma.product.findMany({
    where: { id: { in: [...requested.keys()] } },
    select: { id: true, name: true, yearMonth: true, seq: true },
  });
  const labelById = new Map(
    products.map((p) => {
      const code = formatProductNumber(p.yearMonth, p.seq);
      const name = localized(p.name as LocalizedText);
      return [p.id, code ? `${name}（${code}）` : name];
    }),
  );
  const labelOf = (id: number) =>
    labelById.get(id) ??
    tr("shipping.deliveryNoteActions.productFallbackLabel", { id });

  for (const [productId, qty] of requested) {
    const shipped = shippedByProduct.get(productId);
    if (shipped == null) {
      return tr("shipping.deliveryNoteActions.productNotInShipment", {
        label: labelOf(productId),
      });
    }
    if (qty > shipped) {
      return tr("shipping.deliveryNoteActions.exceedsShippedQuantity", {
        label: labelOf(productId),
        quantity: qty,
        shipped,
      });
    }
  }
  return null;
}

/** 更新 — 下書きのみ（明細は全置換）。出荷書・納品先は作成後変更不可。 */
export async function updateDeliveryNote(
  number: string,
  payload: DeliveryNoteUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_note", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DRN");
  if (!key)
    return actionError(
      tr("shipping.deliveryNoteActions.invalidDeliveryNoteNumber"),
    );
  const parsed = baseInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  if (v.deliveryMethod === "DIRECT_TO_USER" && !v.endUserBpId) {
    return actionError(
      tr("shipping.deliveryNoteActions.selectEndUserForDirectToUser"),
    );
  }
  if (!(await deliveryNoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.deliveryNote.findUnique({
      where: { yearMonth_seq: key },
      select: {
        deliveryMethod: true,
        salesRepId: true,
        endUserBpId: true,
        includePrice: true,
        notes: true,
        deliveryOrderYearMonth: true,
        deliveryOrderSeq: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: { productId: true, quantity: true, notes: true },
        },
      },
    });
    if (prior?.deliveryOrderYearMonth && prior.deliveryOrderSeq != null) {
      const itemsError = await validateItemsAgainstShipment(
        {
          yearMonth: prior.deliveryOrderYearMonth,
          seq: prior.deliveryOrderSeq,
        },
        v.items,
        tr,
      );
      if (itemsError) return actionError(itemsError);
    }
    await prisma.$transaction(async (tx) => {
      // status を where に含めた updateMany で原子的にガードする。
      const updated = await tx.deliveryNote.updateMany({
        where: { ...key, status: "DRAFT" },
        data: {
          deliveryMethod: v.deliveryMethod,
          salesRepId: v.salesRepId?.trim() || null,
          endUserBpId:
            v.deliveryMethod === "DIRECT_TO_USER" ? v.endUserBpId : null,
          includePrice: v.includePrice,
          notes: trimOrNull(v.notes),
        },
      });
      if (updated.count === 0) {
        throw new Error(
          `GUARD:${tr("shipping.deliveryNoteActions.draftOnlyCanEdit")}`,
        );
      }
      // 明細は全置換（DRAFT のみのため参照はまだ無い）。
      await tx.deliveryNoteItem.deleteMany({
        where: {
          deliveryNoteYearMonth: key.yearMonth,
          deliveryNoteSeq: key.seq,
        },
      });
      await tx.deliveryNoteItem.createMany({
        data: v.items.map((it, i) => ({
          deliveryNoteYearMonth: key.yearMonth,
          deliveryNoteSeq: key.seq,
          ...toItemData(it, i, v.includePrice),
        })),
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_notes",
      recordId: number,
      before: prior ?? undefined,
      after: {
        deliveryMethod: v.deliveryMethod,
        salesRepId: v.salesRepId?.trim() || null,
        endUserBpId:
          v.deliveryMethod === "DIRECT_TO_USER" ? v.endUserBpId : null,
        includePrice: v.includePrice,
        notes: trimOrNull(v.notes),
        items: v.items,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryNoteActions.updateFailed"),
        tr,
      ),
    );
  }
}

/** 発行 (DRAFT → ISSUED)。 */
export async function issueDeliveryNote(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_note", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DRN");
  if (!key)
    return actionError(
      tr("shipping.deliveryNoteActions.invalidDeliveryNoteNumber"),
    );
  if (!(await deliveryNoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const updated = await prisma.deliveryNote.updateMany({
      where: { ...key, status: "DRAFT" },
      data: { status: "ISSUED" },
    });
    if (updated.count === 0) {
      return actionError(tr("shipping.deliveryNoteActions.draftOnlyCanIssue"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_notes",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "ISSUED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("shipping.deliveryNoteActions.issueFailed"), tr),
    );
  }
}

/** 納品済み (ISSUED → DELIVERED + deliveredAt=now)。 */
export async function markDelivered(number: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("delivery_note", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "DRN");
  if (!key)
    return actionError(
      tr("shipping.deliveryNoteActions.invalidDeliveryNoteNumber"),
    );
  if (!(await deliveryNoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const updated = await prisma.deliveryNote.updateMany({
      where: { ...key, status: "ISSUED" },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError(
        tr("shipping.deliveryNoteActions.issuedOnlyCanDeliver"),
      );
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_notes",
      recordId: number,
      before: { status: "ISSUED" },
      after: { status: "DELIVERED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("shipping.deliveryNoteActions.deliverFailed"),
        tr,
      ),
    );
  }
}
