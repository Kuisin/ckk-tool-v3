/**
 * GET /api/kiosk/steps/[stepId]/programs/[programId] — 加工プログラムの
 * ダウンロード（共有端末）。
 *
 * 門（すべて fail-closed）:
 *   1. セッション
 *   2. RBAC: work_order:READ
 *   3. 行レベル: その工程を開けること（getMyStep — 工程実行画面と同じ門）
 *   4. そのプログラムが**この工程の一覧に出るもの**であること
 *      （programId を差し替えて別製品のプログラムを取り出させない）
 *
 * 本体は SeaweedFS の Filer から中継する（S3 SDK は足さない — 表示用画像の
 * /api/display/image と同じ判断）。機械へ持っていくファイルなので常に
 * attachment で返す。
 */

import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getStepPrograms } from "@/lib/design-programs";
import { getSession } from "@/lib/kiosk-auth";
import { getMyStep } from "@/lib/steps";

export const dynamic = "force-dynamic";

const FILER_URL = (
  process.env.SEAWEED_FILER_URL ?? "http://localhost:8888"
).replace(/\/$/, "");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ stepId: string; programId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(session.userId, "work_order", "READ"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { stepId, programId } = await params;
  if (!UUID_RE.test(stepId) || !UUID_RE.test(programId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const step = await getMyStep(session.userId, stepId, session.locale);
  if (!step) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const programs = await getStepPrograms(
    stepId,
    session.deviceId,
    session.locale,
  );
  if (!programs.some((p) => p.id === programId && p.hasFile)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = await prisma.designProgram.findUnique({
    where: { id: programId },
    select: { file: { select: { storageKey: true, filename: true } } },
  });
  if (!row?.file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const upstream = await fetch(
      `${FILER_URL}/${row.file.storageKey.replace(/^\/+/, "")}`,
    );
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const encodedName = encodeURIComponent(row.file.filename);
    return new Response(upstream.body, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });
  }
}
