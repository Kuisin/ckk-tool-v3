/**
 * POST /api/design-files/versions/[id]/programs — 加工プログラムの変更を
 * 申請する（multipart/form-data）。1 回 = 1 件（追加 / 直す / 新しい版 /
 * 削除 / 廃止）。
 *
 * フィールド:
 *   change … JSON { kind, programId?, content?, note? }
 *            （content は lib/design-program-changes-core programContentSchema）
 *   file   … content.file = "new" のときのプログラム本体
 *
 * 承認設定（MS0B）の「加工プログラムの変更」に段があれば保留して承認依頼、
 * 無ければその場で当てる（lib/design-programs requestProgramChange）。
 * 図面の版の確定とは独立 — 確定した版でも申請できる。
 * ファイルを含むので Server Action にしない（本文 1MB の上限 — app CLAUDE.md）。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { requirePermissionResponse } from "@/lib/authz";
import type { UploadedFile } from "@/lib/design-files";
import {
  PROGRAM_CHANGE_KINDS,
  programContentSchema,
} from "@/lib/design-program-changes-core";
import { requestProgramChange } from "@/lib/design-programs";

const changeSchema = z.object({
  kind: z.enum(PROGRAM_CHANGE_KINDS),
  programId: z.string().uuid().nullish(),
  content: programContentSchema.nullish(),
  note: z.string().trim().max(2000).nullish(),
});

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
    raw = JSON.parse(String(form.get("change") ?? "null"));
  } catch {
    return badRequest(tr("production.designPrograms.invalidPayload"));
  }
  const parsed = changeSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(tr("production.designPrograms.invalidPayload"));
  }

  let upload: UploadedFile | null = null;
  const f = form.get("file");
  if (f instanceof File && f.size > 0) {
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return badRequest(
        tr("production.designFilesUpload.isTooLargeMax20mb", { name: f.name }),
      );
    }
    upload = { name: f.name, type: f.type, bytes: await f.arrayBuffer() };
  }

  const result = await requestProgramChange({
    versionId: id,
    kind: parsed.data.kind,
    programId: parsed.data.programId ?? null,
    content: parsed.data.content ?? null,
    note: parsed.data.note ?? null,
    upload,
  });
  if (!result.ok) {
    return badRequest(
      result.error ?? tr("production.designPrograms.applyFailed"),
    );
  }
  return NextResponse.json({
    ok: true,
    pending: result.pending === true,
    applied: result.applied === true,
  });
}
