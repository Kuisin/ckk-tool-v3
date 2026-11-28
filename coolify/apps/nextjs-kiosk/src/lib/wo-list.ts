/**
 * wo-list.ts — 指示書一覧（/wo-list）の読み取り。server-only.
 *
 * 紙の指示書（QR）が手元に無いとき、動いている指示書を一覧から選んで
 * /wo-scan/[woNumber] の工程一覧へ入る口。出すのは承認済み / 進行中だけ —
 * 下書きや完了済みは現場のタブレットで触る仕事ではない。
 *
 * 拠点の絞り込みは**端末の拠点**（kiosk_devices.plant_id）で、工程の実施拠点
 * （work_order_steps.plant_id）にその拠点を 1 つでも含む指示書を出す。指示書
 * そのものは拠点を持たない（工程ごとに社内の拠点が付く）ので、ほかに基準が
 * 無い。端末に拠点が無ければ絞らない。
 *
 * 一覧を開いても操作の許可にはならない — 工程の操作可否は従来どおり
 * canOperateStep（/wo-scan と同じ）が決める。
 */

import { prisma } from "./db";
import { docNumberOf } from "./doc-number";
import { type LocalizedText, localized } from "./format";
import type { Locale } from "./i18n";
import { filterWoList, type WoListItem } from "./wo-list-core";

export { filterWoList, type WoListItem };

/** 1 画面に出す上限。超えた分は検索で絞る前提（件数は画面に出す）。 */
const LIMIT = 300;

export interface WoListResult {
  items: WoListItem[];
  /** 端末の拠点名（絞り込みの説明用）。null = 絞っていない。 */
  plantName: string | null;
  /** 上限で切った（= 検索で絞ってほしい）。 */
  truncated: boolean;
}

export async function listActiveWorkOrders(
  deviceId: string,
  locale: Locale,
): Promise<WoListResult> {
  const device = await prisma.kioskDevice.findUnique({
    where: { id: deviceId },
    select: { plantId: true, plant: { select: { name: true } } },
  });
  const plantId = device?.plantId ?? null;

  const rows = await prisma.workOrder.findMany({
    where: {
      status: { in: ["APPROVED", "IN_PROGRESS"] },
      ...(plantId != null ? { steps: { some: { plantId } } } : {}),
    },
    select: {
      workOrderNumber: true,
      docRef: true,
      legacyNumber: true,
      status: true,
      plannedQuantity: true,
      productItem: { select: { code: true, name: true } },
      steps: { select: { status: true } },
    },
    orderBy: { workOrderNumber: "desc" },
    take: LIMIT + 1,
  });

  const items: WoListItem[] = rows.slice(0, LIMIT).map((r) => {
    const live = r.steps.filter((s) => s.status !== "CANCELLED");
    return {
      workOrderNumber: r.workOrderNumber,
      docNumber: docNumberOf(r),
      legacyNumber: r.legacyNumber,
      status: r.status,
      plannedQuantity: r.plannedQuantity,
      productCode: r.productItem.code,
      productName: localized(
        (r.productItem.name ?? null) as LocalizedText | null,
        locale,
      ),
      doneSteps: live.filter((s) => s.status === "COMPLETED").length,
      totalSteps: live.length,
    };
  });

  return {
    items,
    plantName: device?.plant
      ? localized((device.plant.name ?? null) as LocalizedText | null, locale)
      : null,
    truncated: rows.length > LIMIT,
  };
}
