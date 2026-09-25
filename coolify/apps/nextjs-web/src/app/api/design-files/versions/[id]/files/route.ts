/**
 * POST /api/design-files/versions/[id]/files — 確定前の版にファイルを足す
 * （multipart/form-data。フィールドは ../../../_uploads.ts）。
 *
 * 確定した版・承認依頼中の版には足せない（lib/design-files.ts
 * addDesignVersionFiles が状態を見る）。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requirePermissionResponse } from "@/lib/authz";
import { addDesignVersionFiles } from "@/lib/design-files";
import { readUploads, UUID_RE } from "../../../_uploads";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const tr = await getTranslations();
  const deny = await requirePermissionResponse("design_file", "UPDATE");
  if (deny) return deny as NextResponse;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return badRequest(tr("production.designFileActions.notFound"));
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(
      tr("production.designFilesUpload.sendAsMultipartFormData"),
    );
  }
  const read = await readUploads(form);
  if (!read.ok) {
    return badRequest(
      tr("production.designFilesUpload.isTooLargeMax20mb", {
        name: read.tooLarge,
      }),
    );
  }
  const result = await addDesignVersionFiles(id, read.uploads);
  if (!result.ok) return badRequest(result.error);
  return NextResponse.json({ ok: true });
}
