/**
 * /api/attachments/[id] — 証憑の配信と削除。
 *
 * GET    — SeaweedFS から本体をストリーム返却。PDF / 画像は inline
 *          （ブラウザ内表示）、それ以外（XLSX / CSV 等）は attachment。
 *          行・オブジェクトのどちらかが無ければ 404。
 * DELETE — lib/attachments.deleteAttachment（行削除 + オブジェクト
 *          best-effort 削除 + 監査）。応答は { ok } JSON。
 */

import { NextResponse } from "next/server";
import { deleteAttachment, fetchAttachmentFile } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { contentTypeForKey, getObject } from "@/lib/storage";

// 証憑の所属テーブル → 権限コード（未知の ownerType は system:ADMIN のみ）
const OWNER_PERMISSION: Record<string, string> = {
  material_purchase_orders: "purchase_order",
  purchase_requests: "purchase_order",
  material_receipts: "material_receipt",
  order_acceptances: "order_acceptance",
  work_orders: "work_order",
  design_requests: "design_request",
};

async function gate(
  id: string,
  action: "READ" | "UPDATE",
): Promise<Response | null> {
  try {
    const row = await prisma.documentAttachment.findUnique({
      where: { id },
      select: { ownerType: true },
    });
    if (!row) return new Response("Not found", { status: 404 });
    const code = OWNER_PERMISSION[row.ownerType];
    return await requirePermissionResponse(
      code ?? "system",
      code ? action : "ADMIN",
    );
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { id } = await params;
  const attachmentId = decodeURIComponent(id);
  const denied = await gate(attachmentId, "READ");
  if (denied) return denied;
  const file = await fetchAttachmentFile(attachmentId);
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = await getObject(file.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  const contentType = file.mimeType || contentTypeForKey(file.storageKey);
  const inline =
    contentType === "application/pdf" || contentType.startsWith("image/");
  const encodedName = encodeURIComponent(file.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const { id } = await params;
  const attachmentId = decodeURIComponent(id);
  const denied = await gate(attachmentId, "UPDATE");
  if (denied)
    return denied instanceof NextResponse
      ? denied
      : new NextResponse(denied.body, denied);
  const result = await deleteAttachment(attachmentId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
