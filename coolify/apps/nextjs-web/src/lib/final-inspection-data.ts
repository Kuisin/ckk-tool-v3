import "server-only";

/**
 * final-inspection-data.ts — work_order_final_inspections の PDF 用読み取り。
 *
 * 検査表 PDF（空欄シート・記入済みシートの両方）が末尾に付ける最終検査・
 * 出荷前確認セクションのデータ源。uuid → 表示名・日時の整形はここで済ませ、
 * lib/inspection-sheet-pdf.ts（DB に触れない）へは完成した文字列だけを渡す。
 */

import { prisma } from "@/lib/db";
import { documentFormatters } from "@/lib/format";
import type { FinalInspectionPdfData } from "@/lib/inspection-sheet-pdf";

/** 指示書に紐づく最終検査データ（無ければ null = マスタ印刷 or 未操作）。 */
export async function fetchFinalInspectionPdfData(
  workOrderNumber: number,
): Promise<FinalInspectionPdfData | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: { finalInspection: true },
  });
  const fi = wo?.finalInspection;
  if (!fi) return null;
  const userIds = [
    fi.drawingLabelCheckedBy,
    fi.protectiveCapCheckedBy,
    fi.finishedQuantityCheckedBy,
    fi.shelvedBy,
    fi.deliveryNoteIssuedBy,
    fi.shipmentAuthorizedBy,
    fi.shipDefectReviewedBy,
  ].filter((v): v is string => v != null);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null) =>
    id ? (users.find((u) => u.id === id)?.displayName ?? "システム") : null;
  const stamp = (by: string | null, at: Date | null) =>
    at
      ? `${nameOf(by) ?? ""}（${documentFormatters.dateTime(at.toISOString())}）`
      : null;
  return {
    drawingLabelOk: fi.drawingLabelOk,
    drawingLabelChecked: stamp(
      fi.drawingLabelCheckedBy,
      fi.drawingLabelCheckedAt,
    ),
    protectiveCapOk: fi.protectiveCapOk,
    protectiveCapChecked: stamp(
      fi.protectiveCapCheckedBy,
      fi.protectiveCapCheckedAt,
    ),
    finishedQuantityOk: fi.finishedQuantityOk,
    finishedQuantityChecked: stamp(
      fi.finishedQuantityCheckedBy,
      fi.finishedQuantityCheckedAt,
    ),
    spareStockUsed: fi.spareStockUsed,
    spareStockReceived: fi.spareStockReceived,
    shelved: stamp(fi.shelvedBy, fi.shelvedAt),
    deliveryNoteIssued: stamp(fi.deliveryNoteIssuedBy, fi.deliveryNoteIssuedAt),
    shipmentAuthorized: stamp(fi.shipmentAuthorizedBy, fi.shipmentAuthorizedAt),
    shipDefectReviewed: stamp(fi.shipDefectReviewedBy, fi.shipDefectReviewedAt),
    shipDefectNotes: fi.shipDefectNotes,
  };
}
