/**
 * design-series-memo.ts — 工程実行画面の「系列メモ」（読むだけ）。
 *
 * 系列メモは (製品 × 受注元) の図面系列に 1 つ、全版で共通のメモ
 * （document_memos.owner_type = "design_series"、owner id は
 * `<品目 id>:<受注元 id | generic>` — Web の lib/design-files-core
 * designSeriesOwnerId と同じ形）。客先の癖・加工上の注意が書かれるので、
 * 機械の前で作業する人に見えなければ意味が無い。
 *
 * どの系列かは加工プログラムと**同じ規則**（twin の design-programs-core
 * pickWorkOrderDesignVersion — ピン留めの版 → 顧客の系列の確定済み最新 →
 * 汎用。他の顧客の系列へは落ちない）で選んだ版の系列。
 *
 * 共有端末は DB を直接読む（Web の内部 API は叩かない）。本文は
 * ProseMirror の JSON ではなく、保存時に作られた平文射影（plain_text）を
 * 改行つきで出す — 共有端末にリッチテキストの描画部品を持ち込まないため。
 * 平文射影は段落・改行を "\n" で保つ。
 */

import { prisma } from "@/lib/db";
import {
  pickWorkOrderDesignVersion,
  workOrderDesignCustomer,
} from "@/lib/design-programs-core";
import { type LocalizedText, localized } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

export interface KioskSeriesMemo {
  /** 受注元の名前。null = 汎用の系列。 */
  customerName: string | null;
  /** メモの平文（改行つき）。 */
  text: string;
}

/** Web の designSeriesOwnerId と同じ形（`<品目 id>:<受注元 id | generic>`）。 */
function seriesOwnerId(itemId: number, customerBpId: string | null): string {
  return `${itemId}:${customerBpId ?? "generic"}`;
}

/** その工程の指示書が使う図面系列のメモ（無ければ null）。失敗時も null。 */
export async function getStepSeriesMemo(
  stepId: string,
  locale: Locale,
): Promise<KioskSeriesMemo | null> {
  try {
    const step = await prisma.workOrderStep.findUnique({
      where: { id: stepId },
      select: {
        workOrder: {
          select: {
            productItemId: true,
            designFile: { select: { designVersionId: true } },
            orderLineLinks: {
              select: {
                orderLine: {
                  select: { acceptance: { select: { customerBpId: true } } },
                },
              },
            },
          },
        },
      },
    });
    const wo = step?.workOrder;
    if (!wo?.productItemId) return null;
    const versions = await prisma.designVersion.findMany({
      where: { itemId: wo.productItemId },
      select: { id: true, customerBpId: true, version: true, status: true },
    });
    const picked = pickWorkOrderDesignVersion(versions, {
      pinnedVersionId: wo.designFile?.designVersionId ?? null,
      customerBpId: workOrderDesignCustomer(
        wo.orderLineLinks.map((l) => l.orderLine.acceptance.customerBpId),
      ),
    });
    if (!picked) return null;
    const customerBpId = picked.customerBpId ?? null;
    const [memo, customer] = await Promise.all([
      prisma.documentMemo.findFirst({
        where: {
          ownerType: "design_series",
          ownerId: seriesOwnerId(wo.productItemId, customerBpId),
          kind: "MEMO",
          archivedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { plainText: true },
      }),
      customerBpId
        ? prisma.businessPartner.findUnique({
            where: { id: customerBpId },
            select: { name: true },
          })
        : null,
    ]);
    const text = memo?.plainText.trim() ?? "";
    if (!text) return null;
    return {
      customerName: customer
        ? localized(customer.name as LocalizedText | null, locale)
        : null,
      text,
    };
  } catch (e) {
    console.error("getStepSeriesMemo failed", e);
    return null;
  }
}
