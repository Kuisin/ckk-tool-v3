/**
 * POST /api/attachments/upload — 証憑アップロード（multipart/form-data）。
 *
 * フィールド: ownerType（許可テーブルのみ）/ ownerId（業務キー）/
 * label（任意）/ file。検証・保存・監査は lib/attachments.saveAttachment。
 * 応答: { ok: true, id } | { ok: false, error }（400）。
 */

import { NextResponse } from "next/server";
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
    case "design_requests":
      return !!(await prisma.designRequest.findUnique({
        where: { requestNumber: ownerId },
        select: { id: true },
      }));
    default:
      return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("multipart/form-data で送信してください");
  }

  const ownerType = String(form.get("ownerType") ?? "").trim();
  const ownerId = String(form.get("ownerId") ?? "").trim();
  const labelRaw = form.get("label");
  const file = form.get("file");

  const permissionCode = OWNER_TYPE_PERMISSION[ownerType];
  if (!permissionCode) {
    return badRequest("この種類のレコードには添付できません");
  }
  // 対象ドメインの UPDATE 権限が無ければ拒否（401/403）。
  const deny = await requirePermissionResponse(permissionCode, "UPDATE");
  if (deny) return deny as NextResponse;
  if (!ownerId) return badRequest("添付対象が指定されていません");
  // ownerId が実在レコードを指すことを検証（孤児添付・なりすまし防止）。
  if (!(await ownerExists(ownerType, ownerId))) {
    return badRequest("添付対象のレコードが見つかりません");
  }
  if (!(file instanceof File)) {
    return badRequest("ファイルが指定されていません");
  }
  // 巨大ファイルはバッファリング前に弾く。
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return badRequest("ファイルサイズは 20MB 以下にしてください");
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
