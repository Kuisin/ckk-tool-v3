/**
 * /portal/api/file/[fileId] — ポータルからの PDF 配信。
 *
 * ■ lib/file-access.ts を通さない
 * あれは checkPermission 前提で、APP_PREFIX_PERMISSIONS も社員向けのモデル。
 * ポータルには社員の権限が無いので評価しても意味が無い（そして噛み合わない）。
 *
 * ■ file id は**書類の行から引く**
 * 呼び出し側が渡すストレージキーを信じない。「アクセスを証明した書類が
 * 指している file id と一致するか」だけを見る。これで、他人の書類の
 * file id を推測しても取り出せない。
 *
 * `?no=` は書類の id（`CKK~INV-2026-00001`）。番号だけ・旧番号で来たときは
 * その番号の書類を候補にして、**このアカウントに見える書類のうち file id が
 * 一致するもの**だけを通す（番号は法人ごとの連番で、単独では決まらない）。
 *
 * ルートハンドラは (portal)/layout.tsx を通らないので、機能フラグを
 * ここで自分で見る（check-page-gates.sh が貼り忘れを検出する）。
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { recordPortalAccess } from "@/lib/portal-access-log";
import { getPortalSession } from "@/lib/portal-auth";
import {
  getPortalDocument,
  isPortalDocumentType,
} from "@/lib/portal-documents";
import { PORTAL_DOCUMENT_PREFIX } from "@/lib/portal-documents-core";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";
import { getObject } from "@/lib/storage";
import { portalDocCandidates } from "../../../doc-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ fileId: string }> },
) {
  if (!isDevFeatureEnabled("portal")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const session = await getPortalSession();
  if (!session) return new NextResponse("Not found", { status: 404 });

  const { fileId } = await ctx.params;
  const url = new URL(req.url);
  const type = url.searchParams.get("doc") ?? "";
  const number = url.searchParams.get("no") ?? "";

  // どの書類の PDF として要求されたのかを必ず言わせる。
  if (!isPortalDocumentType(type)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { keys } = await portalDocCandidates(
    type,
    PORTAL_DOCUMENT_PREFIX[type],
    number,
  );

  // ここで認可が効く（見えない書類なら null）。
  // **書類が指している file id と一致しなければ渡さない。**
  let doc: Awaited<ReturnType<typeof getPortalDocument>> = null;
  for (const key of keys) {
    const candidate = await getPortalDocument(session, type, key);
    if (candidate?.pdfFileId && candidate.pdfFileId === fileId) {
      doc = candidate;
      break;
    }
  }
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { storageKey: true, filename: true, mimeType: true },
  });
  if (!file) return new NextResponse("Not found", { status: 404 });

  await recordPortalAccess({
    session,
    resourceType: type,
    resourceId: doc.id,
    action: "DOWNLOAD",
    ipAddress: clientIpOf(req),
    userAgent: userAgentOf(req),
  });

  const body = await getObject(file.storageKey);
  if (!body) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // 社外向けなので中間キャッシュに置かせない。
      "Cache-Control": "private, no-store",
    },
  });
}
