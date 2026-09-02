/**
 * POST /api/intake/inbound — 外部システムからの注文書投入（multipart: file）。
 *
 * SY0C の「フォルダへ投入」(/api/intake/folder) と**同じことをする**が、
 * 認証がセッションではなく**共有シークレット**である点だけが違う。ログインを
 * 持たない相手 — FAX 事業者の webhook、複合機、社内スクリプト、cron —— が
 * 注文書を 1 通ずつ投げ込むための口。
 *
 * 認証: ヘッダ `X-Intake-Token`（env INTAKE_INBOUND_TOKEN）。
 * **未設定なら 503 で機能ごと無効** — 開けっ放しにしない（/api/preview/resolve と
 * mailrelay の mail-api が同じ姿勢）。`src/proxy.ts` の matcher から
 * `api/intake/inbound` を除外していないと、未認証 POST が /login へ 307 されて
 * **無言で死ぬ**（device-signals と同じ罠）。
 *
 * やることは**ファイルを置くだけ** — 採番も抽出もしない。次のフォルダスキャン
 * （instrumentation.ts のポーラー）が拾い、共有フォルダに直接置いたときと
 * まったく同じ経路で取り込まれる。だから応答に ORD- 番号は含めない
 * （まだ採番されていないので、返せば嘘になる）。
 *
 * ⚠️ メール取込はこの口を**使わない**。サイドカー intake-gateway が
 * INTAKE_DIR へ直接書き込む（隔離のため — アプリのトークンを渡さない）。
 * 詳細は coolify/apps/intake-gateway/README.md。
 *
 * 任意の来歴フィールド（form field。無ければ無視）:
 *   channel   MAIL | FAX | UPLOAD（既定 UPLOAD）
 *   from      送信元（メールアドレス・FAX 番号など）
 *   subject   件名
 *   reference 相手側の識別子（Message-ID・ジョブ ID など）
 * いずれもファイルパスには影響させず、監査行にだけ残す。
 *
 * 応答: { ok: true, name }（name = 実際に置かれたファイル名）/
 *       { ok: false, error }（400 / 401 / 413 / 500 / 503）。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { recordAudit } from "@/lib/audit";
import {
  INTAKE_MAX_BYTES,
  isIntakeFile,
  saveToIntakeFolder,
} from "@/lib/intake-folder";
import { tokenMatches } from "@/lib/shared-token";

export const dynamic = "force-dynamic";
// saveToIntakeFolder は fs を触る。Edge では動かない。
export const runtime = "nodejs";
export const maxDuration = 60;

/** multipart の枠（境界・ヘッダ）ぶんの余裕。本体の上限は INTAKE_MAX_BYTES。 */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/** 来歴の channel として受ける値。想定外は UPLOAD に丸める。 */
const CHANNELS = new Set(["MAIL", "FAX", "UPLOAD"]);

function fail(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

/** form field を安全な長さの文字列にする（監査行にしか入らないが青天井にしない）。 */
function field(form: FormData, key: string, max = 500): string | undefined {
  const raw = form.get(key);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export async function POST(request: Request): Promise<Response> {
  const tr = await getTranslations();
  const secret = process.env.INTAKE_INBOUND_TOKEN;
  if (!secret) {
    return fail("inbound intake is not configured (INTAKE_INBOUND_TOKEN)", 503);
  }
  if (!tokenMatches(request.headers.get("x-intake-token"), secret)) {
    return fail("invalid token", 401);
  }

  // 本文を読む前に content-length で弾く（敵対的な巨大ボディをバッファしない）。
  const length = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(length) &&
    length > INTAKE_MAX_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return fail(tr("common.fileSizeMax20Mb"), 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(tr("common.sendAsMultipartFormData"), 400);
  }

  // 以下のメッセージは /api/intake/folder と同一にしておく（2 つの口で 1 契約）。
  const file = form.get("file");
  if (!(file instanceof File))
    return fail(tr("settings.orderIntake.noFileWasSpecified"), 400);
  if (file.size <= 0) return fail(tr("common.fileIsEmpty"), 400);
  if (file.size > INTAKE_MAX_BYTES) {
    return fail(tr("common.fileSizeMax20Mb"), 400);
  }
  if (!isIntakeFile(file.name)) {
    return fail(tr("settings.orderIntake.unsupportedFileFormatPdfPngJpg"), 400);
  }

  const rawChannel = field(form, "channel", 16)?.toUpperCase();
  const channel =
    rawChannel && CHANNELS.has(rawChannel) ? rawChannel : "UPLOAD";

  try {
    const name = await saveToIntakeFolder({
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    // この行が、この経路で来た注文書の唯一の来歴記録になる（SY07 で読める）。
    // トークンは絶対に載せない。
    await recordAudit({
      action: "CREATE",
      tableName: "intake_folder",
      recordId: name,
      after: {
        action: "INBOUND",
        channel,
        from: field(form, "from"),
        subject: field(form, "subject"),
        reference: field(form, "reference"),
        original: file.name,
        bytes: file.size,
      },
    });
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    console.error("[intake/inbound]", e);
    // INTAKE_DIR 未設定は運用の問題なので、そのまま見せる（folder 側と同じ扱い）。
    const message =
      e instanceof Error && e.message.includes("INTAKE_DIR")
        ? e.message
        : tr("settings.orderIntake.failedToSaveToTheIntake");
    return fail(message, 500);
  }
}
