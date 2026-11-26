import "server-only";

/**
 * 自社法人の画像 API（MS0I）の本体 — 社印・ロゴの 2 本のルートが共有する。
 *
 *   GET    /api/master/own-companies/{id}/{seal|logo}  → 画像（詳細画面のプレビュー）
 *   POST   /api/master/own-companies/{id}/{seal|logo}  → 差し替え（multipart: file）
 *   DELETE /api/master/own-companies/{id}/{seal|logo}  → 外す
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
  MAX_OWN_COMPANY_IMAGE_BYTES,
  OWN_COMPANY_IMAGE,
  type OwnCompanyImageKind,
  removeOwnCompanyImage,
  saveOwnCompanyImage,
} from "@/lib/own-company-seal";
import { getObject } from "@/lib/storage";

export type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function revalidate(id: number) {
  revalidatePath("/master/own-companies");
  revalidatePath(`/master/own-companies/${id}`);
}

export async function getOwnCompanyImage(
  kind: OwnCompanyImageKind,
  { params }: RouteContext,
): Promise<Response> {
  const denied = await requirePermissionResponse("master", "READ");
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return new Response("Not found", { status: 404 });
  const ref = { select: { storageKey: true, mimeType: true } } as const;
  const company = await prisma.ownCompany.findUnique({
    where: { id },
    select: { sealFile: ref, logoFile: ref },
  });
  const file = kind === "seal" ? company?.sealFile : company?.logoFile;
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

export async function postOwnCompanyImage(
  kind: OwnCompanyImageKind,
  request: Request,
  { params }: RouteContext,
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
  if (file.size > MAX_OWN_COMPANY_IMAGE_BYTES) {
    return NextResponse.json(
      { ok: false, error: tr(OWN_COMPANY_IMAGE[kind].tooLarge) },
      { status: 413 },
    );
  }
  const result = await saveOwnCompanyImage(kind, id, file);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  revalidate(id);
  return NextResponse.json(result);
}

export async function deleteOwnCompanyImage(
  kind: OwnCompanyImageKind,
  { params }: RouteContext,
): Promise<NextResponse> {
  const tr = await getTranslations();
  const id = parseId((await params).id);
  if (id == null) {
    return NextResponse.json(
      { ok: false, error: tr("master.ownCompanies.notFound") },
      { status: 404 },
    );
  }
  const result = await removeOwnCompanyImage(kind, id);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  revalidate(id);
  return NextResponse.json(result);
}
