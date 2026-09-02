/**
 * POST /api/master/inspection-templates/import  （multipart: file）
 *   → JSON か Excel(.xlsx) を読んで検査表テンプレートを取り込む。
 *
 * Server Action ではなく Route Handler なのは、Server Action のボディが
 * 既定 1MB 上限で、Excel は自分のコードに届く前に 413 で落ちるため
 * （/api/avatars・/api/floor-maps/[mapId]/image と同じ方式）。
 *
 * **読めない行があっても、読めたものは取り込む。** 結果（作成・見送り・行の誤り）を
 * そのまま返して、画面が一覧で見せる。全部巻き戻すと直す対象が分からない。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  portableFileSchema,
  rowsToPortable,
} from "@/lib/inspection-template-io";
import { importTemplates } from "@/lib/inspection-template-port";
import { readXlsx } from "@/lib/xlsx-read";

export const dynamic = "force-dynamic";

/** 取込ファイルの上限（10MB）。検査表は文字だけなので十分に大きい。 */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const tr = await getTranslations();
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
      { ok: false, error: tr("master.inspectionTemplateIoModal.selectAFile") },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: tr("master.inspectionTemplateIoModal.fileSizeMax10Mb"),
      },
      { status: 413 },
    );
  }

  const isExcel = /\.xlsx$/i.test(file.name);
  const buf = Buffer.from(await file.arrayBuffer());

  if (isExcel) {
    let rows: string[][];
    try {
      rows = readXlsx(buf, tr);
    } catch (e) {
      // 読めないものを推測で詰めない。何が起きたかをそのまま伝える。
      return NextResponse.json(
        {
          ok: false,
          error: tr("master.inspectionTemplateIoModal.couldNotReadExcel", {
            reason:
              e instanceof Error
                ? e.message
                : tr("master.inspectionTemplateIoModal.unknownFormat"),
          }),
        },
        { status: 400 },
      );
    }
    const { templates, errors } = rowsToPortable(rows);
    if (templates.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: tr("master.inspectionTemplateIoModal.noImportableTemplates"),
          data: { created: [], skipped: [], rowErrors: errors },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(await importTemplates(templates, errors, tr));
  }

  // JSON
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(buf.toString("utf8"));
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: tr("master.inspectionTemplateIoModal.couldNotReadAsJson"),
      },
      { status: 400 },
    );
  }
  const parsed = portableFileSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: tr("master.inspectionTemplateIoModal.unsupportedFormat", {
          reason:
            parsed.error.issues[0]?.message ??
            tr("master.inspectionTemplateIoModal.formatMismatch"),
        }),
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    await importTemplates(parsed.data.templates, [], tr),
  );
}
