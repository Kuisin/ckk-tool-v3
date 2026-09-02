/**
 * POST /api/intake/folder — 注文書取込フォルダ（INTAKE_DIR）へファイルを置く。
 *
 * SY0C「注文書取込」の投入口。**ファイルを置くだけ**で、採番も抽出もしない —
 * 次のフォルダスキャン（instrumentation.ts のポーラー）が拾い、共有フォルダに
 * 直接置いたときとまったく同じ経路で取り込まれる。だから画面側は投入後、
 * 「取込待ち」に並んだことだけを見せればよい。
 *
 * Server Action ではなく Route Handler なのは、アップロードだから
 * （Server Action のボディ上限 1MB。app CLAUDE.md 参照）。クライアントは
 * 1 ファイルずつ POST する — まとめて送ると proxy の 24MB に当たる。
 *
 * 応答: { ok: true, name }（name = 実際に置かれたファイル名）/
 *       { ok: false, error }（400）。
 */

import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePermissionResponse } from "@/lib/authz";
import type { Locale } from "@/lib/i18n";
import {
  INTAKE_MAX_BYTES,
  isIntakeFile,
  saveToIntakeFolder,
} from "@/lib/intake-folder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  const tr = await getTranslations();
  const locale = (await getLocale()) as Locale;
  // 取込フォルダはサーバーの実ファイル — システム管理者のみ触れる。
  const denied = await requirePermissionResponse("system", "UPDATE");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(tr("common.sendAsMultipartFormData"));
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return badRequest(tr("settings.orderIntake.noFileWasSpecified"));
  if (file.size <= 0) return badRequest(tr("common.fileIsEmpty"));
  if (file.size > INTAKE_MAX_BYTES) {
    return badRequest(tr("common.fileSizeMax20Mb"));
  }
  if (!isIntakeFile(file.name)) {
    return badRequest(
      tr("settings.orderIntake.unsupportedFileFormatPdfPngJpg"),
    );
  }

  try {
    const name = await saveToIntakeFolder(
      {
        filename: file.name,
        bytes: Buffer.from(await file.arrayBuffer()),
      },
      locale,
    );
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    console.error("[intake/folder]", e);
    const message =
      e instanceof Error && e.message.includes("INTAKE_DIR")
        ? e.message
        : tr("settings.orderIntake.failedToSaveToTheIntake");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
