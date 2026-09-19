"use server";

/**
 * Server Actions — 顧客専用の製品コード（製品 × 顧客の別名、MS04 の「顧客品番」タブ）。
 *
 * 画面は 1 製品ぶんの表を丸ごと編集して 1 回保存する（行ごとの追加/削除
 * アクションを別々に持たない）。渡された行が「保存後の全部」— 画面から消えた
 * 顧客の行は落ちる。共有設定（ShareGrantsPanel）と同じ作り。
 *
 * 一意制約は 2 本とも DB が持っている:
 *   (customer_bp_id, product_id) … 1 顧客 1 製品 1 行
 *   (customer_bp_id, code)       … 1 顧客の中で品番は一意
 * ただし**同じ保存の中の重複**は DB へ行く前にここで弾く（P2002 のメッセージは
 * どの行が悪いのか言えないため）。他の製品にすでにある品番との衝突だけは
 * DB に任せ、prismaErrorMessage が文言に落とす。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { legacyProductIdForItem } from "@/lib/item-legacy-product";
import { normalizeKeywords } from "@/lib/master-keywords";
import { productMatchKey } from "@/lib/product-match";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/products";

function rowsSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    /** 対象製品の品目 id（items.id — 品目統合 第 3 段）。 */
    itemId: z.number().int().positive(),
    rows: z
      .array(
        z.object({
          customerBpId: z
            .string()
            .uuid(tr("master.customerProductCodes.selectACustomer")),
          code: z
            .string()
            .trim()
            .min(1, tr("master.customerProductCodes.enterACustomerCode")),
          name: z.string().trim().optional().default(""),
          aliases: z.array(z.string()).default([]),
          isActive: z.boolean().default(true),
          notes: z.string().trim().optional().default(""),
        }),
      )
      .max(500),
  });
}

export type CustomerProductCodeInput = z.infer<
  ReturnType<typeof rowsSchema>
>["rows"][number];

/**
 * 1 製品ぶんの顧客品番を保存。渡された行が保存後の全部になる。
 *
 * ★ 突合は正規化して当てる（`productMatchKey`）ので、**正規化すると同じになる
 *   品番**を同じ顧客に 2 つ登録させない — DB の unique は生の文字列しか見ない
 *   ので、`X-100` と `X 100` は両方入ってしまい、そのあと注文書の `X100` が
 *   どちらにも当たって自動確定できなくなる（= 登録した意味が消える）。
 */
export async function saveCustomerProductCodes(input: {
  itemId: number;
  rows: CustomerProductCodeInput[];
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = rowsSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const { itemId, rows } = parsed.data;

  const item = await prisma.item.findFirst({
    where: { id: itemId, itemType: "PRODUCT" },
    select: { id: true },
  });
  if (!item) return actionError(tr("common.targetProductNotFound"));
  // 旧 customer_product_codes.product_id はまだ NOT NULL（落とすのは最後の段）
  // なので、書き込みのときだけ品目 → products.id を橋渡しする。一意制約
  // (customer_bp_id, product_id) もこの値で効いている。
  const productId = await legacyProductIdForItem(itemId);
  if (productId == null) return actionError(tr("common.targetProductNotFound"));

  // 同じ保存の中の重複を先に弾く（DB の P2002 はどの行かを言えない）。
  const seenCustomer = new Set<string>();
  const seenCode = new Set<string>();
  const cleaned = rows.map((r) => ({
    ...r,
    aliases: normalizeKeywords(r.aliases),
  }));
  for (const r of cleaned) {
    if (seenCustomer.has(r.customerBpId)) {
      return actionError(
        tr("master.customerProductCodes.duplicateCustomerRow"),
      );
    }
    seenCustomer.add(r.customerBpId);
    const key = `${r.customerBpId}:${productMatchKey(r.code)}`;
    if (seenCode.has(key)) {
      return actionError(
        tr("master.customerProductCodes.duplicateCodeForCustomer", {
          code: r.code,
        }),
      );
    }
    seenCode.add(key);
  }

  const before = await prisma.customerProductCode.findMany({
    where: { itemId },
    select: { customerBpId: true, code: true, name: true, aliases: true },
    orderBy: { id: "asc" },
  });
  const actor = await getCurrentActorId();

  // 履歴に出すための取引先名（before / after 両方に出てくる顧客ぶん）。
  // id のままだと「何が変わったのか」を読む人が UUID を引く作業になる。
  const bpNames = new Map(
    (
      await prisma.businessPartner.findMany({
        where: {
          id: {
            in: [
              ...new Set([
                ...before.map((r) => r.customerBpId),
                ...cleaned.map((r) => r.customerBpId),
              ]),
            ],
          },
        },
        select: { id: true, name: true },
      })
    ).map((b) => [b.id, localized(b.name as LocalizedText | null)]),
  );
  const auditLine = (r: {
    customerBpId: string;
    code: string;
    name: string | null;
  }) =>
    `${bpNames.get(r.customerBpId) ?? r.customerBpId}: ${r.code}${
      r.name ? `（${r.name}）` : ""
    }`;

  try {
    await prisma.$transaction(async (tx) => {
      // 消えた顧客の行だけ落とし、残った行は upsert する。全削除 → 全作成に
      // しないのは、保存のたびに id が振り直されて「いつ登録した対応か」が
      // 消えるため（差分同期の順序キーもそこを見ている）。
      await tx.customerProductCode.deleteMany({
        where: {
          itemId,
          customerBpId: { notIn: cleaned.map((r) => r.customerBpId) },
        },
      });
      for (const r of cleaned) {
        await tx.customerProductCode.upsert({
          where: {
            customerBpId_productId: {
              customerBpId: r.customerBpId,
              productId,
            },
          },
          create: {
            productId,
            itemId,
            customerBpId: r.customerBpId,
            code: r.code,
            name: r.name || null,
            aliases: r.aliases,
            isActive: r.isActive,
            notes: r.notes || null,
            createdBy: actor,
          },
          update: {
            // 既存行にも品目参照を埋め直す（移行前に作られた行が残っていても
            // 1 度保存すれば揃う）。
            itemId,
            code: r.code,
            name: r.name || null,
            aliases: r.aliases,
            isActive: r.isActive,
            notes: r.notes || null,
          },
        });
      }
    });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.customerProductCodes.couldNotSave"), tr),
    );
  }

  // **製品の履歴として残す**（別テーブル名にしない）— 顧客品番はその製品に
  // ついての設定なので、製品の 履歴 タブで読めないと誰も見に行かない。
  // 鍵は製品マスタ本体と同じ `("products", 旧 products.id)`（actions.ts の
  // 監査の節）— 画面の id が品目へ移っても、履歴の鍵は動かさない。
  await recordAudit({
    action: "UPDATE",
    tableName: "products",
    recordId: String(productId),
    before: { customerProductCodes: before.map(auditLine) },
    after: { customerProductCodes: cleaned.map(auditLine) },
  });
  revalidatePath(`${BASE_PATH}/${itemId}`);
  return actionOk();
}
