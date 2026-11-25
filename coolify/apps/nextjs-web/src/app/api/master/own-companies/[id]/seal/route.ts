/**
 * 自社法人の社印（電子印影）画像 API（MS0I）。
 *
 *   GET    /api/master/own-companies/{id}/seal  → 画像（詳細画面のプレビュー）
 *   POST   /api/master/own-companies/{id}/seal  → 差し替え（multipart: file）
 *   DELETE /api/master/own-companies/{id}/seal  → 外す
 *
 * Server Action ではなく Route Handler なのは、Server Action のボディ上限
 * （既定 1MB）に画像が掛かり得るため — フロアマップ画像と同じ方式。
 * RBAC・検証・保存・監査は lib/own-company-seal.ts。
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  MAX_SEAL_BYTES,
  removeOwnCompanySeal,
  saveOwnCompanySeal,
} from "@/lib/own-company-seal";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function revalidate(id: number) {
  revalidatePath("/master/own-companies");
  revalidatePath(`/master/own-companies/${id}`);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requirePermissionResponse("master", "READ");
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return new Response("Not found", { status: 404 });
  const company = await prisma.ownCompany.findUnique({
    where: { id },
    select: { sealFile: { select: { storageKey: true, mimeType: true } } },
  });
  const file = company?.sealFile;
  const bytes = file ? await getObject(file.storageKey) : null;
  if (!file || !bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": file.mimeType,
      "cache-control": "private, no-cache",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const tr = await getTranslations();
  const id = parseId((await params).id);
  if (id == null) {
    return NextResponse.json(
      { ok: false, error: tr("master.ownCompanies.notFound") },
      { status: 404 },
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: tr("common.sendAsMultipartFormData") },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: tr("common.selectAnImageFile") },
      { status: 400 },
    );
  }
  if (file.size > MAX_SEAL_BYTES) {
    return NextResponse.json(
      { ok: false, error: tr("master.ownCompanies.sealTooLarge") },
      { status: 413 },
    );
  }
  const result = await saveOwnCompanySeal(id, file);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  revalidate(id);
  return NextResponse.json(result);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const tr = await getTranslations();
  const id = parseId((await params).id);
  if (id == null) {
    return NextResponse.json(
      { ok: false, error: tr("master.ownCompanies.notFound") },
      { status: 404 },
    );
  }
  const result = await removeOwnCompanySeal(id);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  revalidate(id);
  return NextResponse.json(result);
}
