/**
 * /api/forms/[code]/export — フォーム定義を .txt で書き出す。
 *
 * ダウンロードなので Server Action ではなく Route Handler
 * （Content-Disposition を付けたいのと、将来大きくなっても 1MB 上限に当たらない）。
 *
 * 出すのは**定義だけ**。回答と共有設定は含めない（lib/form-transfer.ts 参照）。
 */

import { NextResponse } from "next/server";
import { currentAppEnv } from "@/lib/app-flags";
import { getCurrentActorId } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  buildFormExport,
  exportFileName,
  serializeFormExport,
} from "@/lib/form-transfer";
import { fetchForm, formAccess } from "@/lib/forms";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const authz = await checkPermission("form", "READ");
  if (!authz.ok) {
    return new NextResponse(authz.error, { status: 403 });
  }

  const { code } = await params;
  const form = await fetchForm(code);
  if (!form) return new NextResponse("Not found", { status: 404 });

  // 定義を持ち出せるのは、そのフォームを読める人だけ。
  const access = await formAccess(form);
  if (!access.canRead) return new NextResponse("Not found", { status: 404 });

  if (form.currentVersion === 0 || form.fields.length === 0) {
    return new NextResponse("このフォームはまだ項目が公開されていません", {
      status: 409,
    });
  }

  const actorId = await getCurrentActorId();
  const actor = actorId
    ? await prisma.user.findUnique({
        where: { id: actorId },
        select: { displayName: true, username: true },
      })
    : null;

  const text = serializeFormExport(
    buildFormExport({
      sourceEnv: currentAppEnv(),
      sourceCode: form.code,
      sourceVersion: form.currentVersion,
      exportedAt: new Date().toISOString(),
      exportedBy: actor ? actor.displayName || actor.username : null,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      form: {
        title: form.title,
        description: form.description,
        kind: form.kind,
        respondentVisibility: form.respondentVisibility,
        approvalEnabled: form.approvalEnabled,
        allowMultiple: form.allowMultiple,
        responseEditMode: form.responseEditMode,
        fields: form.fields,
      },
    }),
  );

  const filename = exportFileName(form.title, currentAppEnv(), form.code);
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // 日本語ファイル名は filename* (RFC 5987) で渡す。
      "Content-Disposition": `attachment; filename="form-${form.code}.txt"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
