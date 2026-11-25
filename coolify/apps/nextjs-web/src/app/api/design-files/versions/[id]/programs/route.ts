/**
 * POST /api/design-files/versions/[id]/programs — 版の加工プログラムを丸ごと
 * 置き換える（multipart/form-data）。
 *
 * フィールド:
 *   programs   … JSON 配列（lib/design-programs programsPayloadSchema）
 *   <fileField> … 各行の fileField に書いた名前でプログラム本体を 1 枚ずつ
 *
 * ファイルを含むので Server Action にしない（本文 1MB の上限 — app CLAUDE.md）。
 * 版が編集できない状態（確定・承認依頼中）なら lib 側が拒否する。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import type { UploadedFile } from "@/lib/design-files";
import {
  programsPayloadSchema,
  saveDesignPrograms,
} from "@/lib/design-programs";
import { UUID_RE } from "../../../_uploads";

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

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("programs") ?? "[]"));
  } catch {
    return badRequest(tr("production.designPrograms.invalidPayload"));
  }
  const parsed = programsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(tr("production.designPrograms.invalidPayload"));
  }

  const uploads: Record<string, UploadedFile> = {};
  for (const row of parsed.data) {
    if (!row.fileField) continue;
    const f = form.get(row.fileField);
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return badRequest(
        tr("production.designFilesUpload.isTooLargeMax20mb", { name: f.name }),
      );
    }
    uploads[row.fileField] = {
      name: f.name,
      type: f.type,
      bytes: await f.arrayBuffer(),
    };
  }

  const result = await saveDesignPrograms(id, parsed.data, uploads);
  if (!result.ok) return badRequest(result.error);
  return NextResponse.json({ ok: true });
}
