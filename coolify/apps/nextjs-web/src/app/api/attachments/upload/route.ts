/**
 * POST /api/attachments/upload — 証憑アップロード（multipart/form-data）。
 *
 * フィールド: ownerType（許可テーブルのみ）/ ownerId（業務キー）/
 * label（任意）/ file。検証・保存・監査は lib/attachments.saveAttachment。
 * 応答: { ok: true, id } | { ok: false, error }（400）。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { MAX_ATTACHMENT_BYTES, saveAttachment } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";

export const dynamic = "force-dynamic";

/** 添付を受け付ける owner テーブル → 要求する permission_code。 */
const OWNER_TYPE_PERMISSION: Record<string, string> = {
  material_purchase_orders: "purchase_order",
  material_receipts: "material_receipt",
  order_acceptances: "order_acceptance",
  design_requests: "design_request",
  form_responses: "form",
};

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ownerId が実在レコードを指すか（業務キーは各詳細画面と同じ形式）。 */
async function ownerExists(
  ownerType: string,
  ownerId: string,
): Promise<boolean> {
  switch (ownerType) {
    case "material_purchase_orders":
      return !!(await prisma.materialPurchaseOrder.findUnique({
        where: { poNumber: ownerId },
        select: { id: true },
      }));
    case "material_receipts":
      if (!UUID_RE.test(ownerId)) return false;
      return !!(await prisma.materialReceipt.findUnique({
        where: { id: ownerId },
        select: { id: true },
      }));
    case "order_acceptances": {
      const key = parseDocKey(ownerId, "ORD");
      if (!key) return false;
      return !!(await prisma.orderAcceptance.findUnique({
        where: { yearMonth_seq: key },
        select: { yearMonth: true },
      }));
    }
    case "form_responses":
      return !!(await prisma.formResponse.findUnique({
        where: { responseNumber: ownerId },
        select: { id: true },
      }));
    case "design_requests": {
      // 設計依頼は「実在するか」だけでは足りない — 承認前（下書き・承認依頼中・
      // 差し戻し）と終わったあと（完了・キャンセル）に図面を足せてしまうと、
      // 承認した中身と完了時に版登録される中身がずれる。画面側の canAttachFiles
      // と同じ条件をここでも見る（UI のガードは飾りにしない）。
      const row = await prisma.designRequest.findUnique({
        where: { requestNumber: ownerId },
        select: { status: true },
      });
      return row?.status === "PENDING" || row?.status === "IN_PROGRESS";
    }
    default:
      return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const tr = await getTranslations();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(tr("attachmentsUpload.sendAsMultipartFormData"));
  }

  const ownerType = String(form.get("ownerType") ?? "").trim();
  const ownerId = String(form.get("ownerId") ?? "").trim();
  const labelRaw = form.get("label");
  const file = form.get("file");

  const permissionCode = OWNER_TYPE_PERMISSION[ownerType];
  if (!permissionCode) {
    return badRequest(tr("attachmentsUpload.recordTypeCannotHaveAttachments"));
  }
  // 対象ドメインの UPDATE 権限が無ければ拒否（401/403）。
  const deny = await requirePermissionResponse(permissionCode, "UPDATE");
  if (deny) return deny as NextResponse;
  if (!ownerId) return badRequest(tr("common.attachmentTargetNotSpecified"));
  // ownerId が実在レコードを指すことを検証（孤児添付・なりすまし防止）。
  if (!(await ownerExists(ownerType, ownerId))) {
    return badRequest(tr("attachmentsUpload.attachmentTargetRecordNotFound"));
  }
  if (!(file instanceof File)) {
    return badRequest(tr("attachmentsUpload.noFileSpecified"));
  }
  // 巨大ファイルはバッファリング前に弾く。
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return badRequest(tr("common.fileSizeMax20Mb"));
  }

  const result = await saveAttachment({
    ownerType,
    ownerId,
    label: typeof labelRaw === "string" ? labelRaw : null,
    file: {
      name: file.name,
      type: file.type,
      bytes: await file.arrayBuffer(),
    },
  });
  if (!result.ok) return badRequest(result.error);
  return NextResponse.json({ ok: true, id: result.data.id });
}
