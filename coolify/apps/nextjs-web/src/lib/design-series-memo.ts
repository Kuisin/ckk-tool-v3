/**
 * design-series-memo.ts — 系列メモ（版共通メモ）を、版の画面・工程実行画面へ
 * 出すための読み出し。server-only.
 *
 * 系列メモは (製品 × 受注元) の図面系列に 1 つ（document_memos.owner_type =
 * "design_series"、owner id は lib/design-files-core designSeriesOwnerId）。
 * 以前は製品の設計図画面にしか出ず、指示書の「設計図」リンクから版へ来た人や
 * 工程実行画面で作業する人には見えなかった。
 *
 * 指示書がどの系列を見るかは、工程実行画面が加工プログラムの版を選ぶのと
 * **同じ規則**（lib/design-programs-core pickWorkOrderDesignVersion）で決める —
 * ピン留めの版 → 顧客の系列の確定済み最新 → 汎用。他の顧客の系列へは落ちない。
 * 選ばれた版の系列のメモを出す（プログラムとメモで別の系列を見ることがない）。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { designSeriesOwnerId } from "@/lib/design-files-core";
import {
  pickWorkOrderDesignVersion,
  workOrderDesignCustomer,
} from "@/lib/design-programs-core";
import { listMemos, type MemoView } from "@/lib/document-memos";
import { type LocalizedText, localized } from "@/lib/format";

/** 系列メモ 1 系列ぶん（画面へ渡す形）。 */
export interface SeriesMemoView {
  itemId: number;
  /** null = 汎用の系列。 */
  customerBpId: string | null;
  /** 系列の呼び名（受注元の名前 / 「汎用」）。 */
  seriesLabel: string;
  memos: MemoView[];
}

/** 系列 1 本のメモ（版の画面用 — 版が属する系列はそのまま分かる）。 */
export async function fetchSeriesMemo(
  itemId: number,
  customerBpId: string | null,
): Promise<MemoView[]> {
  return listMemos("design_series", designSeriesOwnerId(itemId, customerBpId));
}

/**
 * 工程（work_order_steps.id）の指示書が使う図面系列のメモ。
 * 図面の版が 1 つも選べない（図面の無い製品・確定版の無い系列）なら null。
 */
export async function fetchStepSeriesMemo(
  stepId: string,
): Promise<SeriesMemoView | null> {
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
    const [memos, customer, tr] = await Promise.all([
      fetchSeriesMemo(wo.productItemId, customerBpId),
      customerBpId
        ? prisma.businessPartner.findUnique({
            where: { id: customerBpId },
            select: { name: true },
          })
        : null,
      getTranslations(),
    ]);
    return {
      itemId: wo.productItemId,
      customerBpId,
      seriesLabel: customer
        ? localized(customer.name as LocalizedText | null)
        : tr("common.generic"),
      memos,
    };
  } catch (e) {
    console.error("fetchStepSeriesMemo failed", e);
    return null;
  }
}
