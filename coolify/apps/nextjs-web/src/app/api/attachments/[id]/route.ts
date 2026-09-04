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
import { isApproverOf } from "@/lib/approvals";
import {
  deleteAttachment,
  fetchAttachmentFile,
  isInlineSafe,
} from "@/lib/attachments";
import { requirePermissionResponse, sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { fetchResponse, formAccess } from "@/lib/forms";
import { responseInScope } from "@/lib/share-grants-core";
import { contentTypeForKey, getObject } from "@/lib/storage";

// 証憑の所属テーブル → 権限コード（未知の ownerType は system:ADMIN のみ）
const OWNER_PERMISSION: Record<string, string> = {
  material_purchase_orders: "purchase_order",
  purchase_requests: "purchase_order",
  form_responses: "form",
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
      select: { ownerType: true, ownerId: true },
    });
    if (!row) return new Response("Not found", { status: 404 });
    const code = OWNER_PERMISSION[row.ownerType];
    const denied = await requirePermissionResponse(
      code ?? "system",
      code ? action : "ADMIN",
    );
    if (denied) return denied;
    // フォーム回答の証憑は、回答本体と同じ門（本人 / 共有スコープ / 承認者）。
    // form:READ は全業務ロールが持つので、権限コードだけでは他人の申請の
    // 添付が UUID を知っていれば誰でも取れてしまう。
    if (row.ownerType === "form_responses") {
      return await formResponseGate(row.ownerId);
    }
    return null;
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/** 回答詳細 / PDF（api/pdf/form-response）と同じ判定。読めなければ 404。 */
async function formResponseGate(responseId: string): Promise<Response | null> {
  const viewerId = await sessionUserId();
  const response = await fetchResponse(responseId);
  if (!response) return new Response("Not found", { status: 404 });
  const access = await formAccess(response.form);
  const isOwner = !!viewerId && response.submittedBy === viewerId;
  const inScope =
    access.canRead && responseInScope(access.responseScope, response.answers);
  const isApprover = await isApproverOf("form_responses", responseId, viewerId);
  if (!inScope && !isOwner && !isApprover)
    return new Response("Not found", { status: 404 });
  return null;
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
  // インライン表示は PDF / 画像 / 3D だけ。それ以外は必ずダウンロードにする
  // （SVG・HTML を inline で返すと保存 XSS になる。判定は lib/attachments の
  //  isInlineSafe が唯一の持ち主）。
  const inline = isInlineSafe(contentType);
  const encodedName = encodeURIComponent(file.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      // 申告 MIME を勝手に読み替えさせない（sniffing 経由の HTML 実行を塞ぐ）。
      "x-content-type-options": "nosniff",
      // 万一 inline で開かれても、スクリプト・同一オリジンを与えない。
      "content-security-policy":
        "sandbox; default-src 'none'; img-src 'self' data:; object-src 'self'",
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
