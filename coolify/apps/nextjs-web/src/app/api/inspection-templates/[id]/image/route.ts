/**
 * GET    /api/inspection-templates/[id]/image — 参考画像の配信（inline）
 * POST   /api/inspection-templates/[id]/image — 参考画像の設定・差し替え（multipart: file）
 * DELETE /api/inspection-templates/[id]/image — 参考画像の削除
 *
 * MS09 検査表テンプレートの参考画像（測定位置の図解・現物写真）。設定すると
 * PDF（空欄シート・記入済みシート）にも印刷される。権限確認・保存・監査は
 * lib/inspection-template-image.ts。
 *
 * Server Action ではなく Route Handler なのは、Server Action のボディが
 * 1MB で頭打ちになるため（/api/avatars と同じ理由）。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { isInlineSafe } from "@/lib/attachments";
import { getCurrentActorId } from "@/lib/audit";
import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  MAX_TEMPLATE_IMAGE_BYTES,
  removeInspectionTemplateImage,
  saveInspectionTemplateImage,
} from "@/lib/inspection-template-image";
import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const denied = await requirePermissionResponse("master", "READ");
  if (denied) return denied;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });

  const template = await prisma.inspectionTemplate.findUnique({
    where: { id },
    select: {
      imageFile: {
        select: { storageKey: true, filename: true, mimeType: true },
      },
    },
  });
  if (!template?.imageFile) return new Response("Not found", { status: 404 });

  const bytes = await getObject(template.imageFile.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  const contentType =
    template.imageFile.mimeType ||
    contentTypeForKey(template.imageFile.storageKey);
  const inline = isInlineSafe(contentType);
  const encodedName = encodeURIComponent(template.imageFile.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "sandbox; default-src 'none'; img-src 'self' data:; object-src 'self'",
    },
  });
}

export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const tr = await getTranslations();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return badRequest(tr("master.inspectionTemplateImage.invalidTemplateId"));
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(tr("common.sendAsMultipartFormData"));
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest(tr("common.selectAnImageFile"));
  }
  if (file.size > MAX_TEMPLATE_IMAGE_BYTES) {
    return badRequest(tr("common.imageSizeMax5Mb"));
  }

  const uploadedBy = await getCurrentActorId();
  const result = await saveInspectionTemplateImage(id, file, uploadedBy);
  if (!result.ok) return badRequest(result.error);

  revalidatePath(`/master/inspection-templates/${id}`);
  return NextResponse.json({ ok: true, fileId: result.data.fileId });
}

export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const tr = await getTranslations();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return badRequest(tr("master.inspectionTemplateImage.invalidTemplateId"));
  }

  const result = await removeInspectionTemplateImage(id);
  if (!result.ok) return badRequest(result.error);

  revalidatePath(`/master/inspection-templates/${id}`);
  return NextResponse.json({ ok: true });
}
