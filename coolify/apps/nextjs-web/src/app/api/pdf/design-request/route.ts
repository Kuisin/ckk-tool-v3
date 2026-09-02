/**
 * GET /api/pdf/design-request?id=<DSG-YYYYMM-NNNNN>[&download=1][&force=1]
 * — 設計依頼書 PDF（製造へ紙で渡すための帳票）。
 *
 * 見積書・請求書と同じ流れ（SeaweedFS の保管分があればそれを返し、無ければ
 * Gotenberg で組んで保管してから返す）だが、2 点だけ意図的に違う:
 *
 * 1. **発行済み判定に document-pdf の isIssued を使わない。** あちらは
 *    「DRAFT でなければ発行済み」だが、設計依頼書は状態が承認軸と作業軸に
 *    分かれていて REQUESTED / REJECTED / CANCELLED も「まだ発行前」。
 *    判定は model.ts の isIssuedDesign（承認済み以降のみ）。
 * 2. **完了前はキャッシュを読まない。** 承認済〜進行中は依頼内容・担当者・
 *    添付が動くので、保管分をそのまま返すと古い依頼内容を刷ってしまう。
 *    COMPLETED（もう動かない）のときだけ保管分を使う。書き込みは常に行う
 *    ので、ファイル管理 (SY06) からはいつでも参照できる。
 */

import { fetchDesignRequest } from "@/app/(dashboard)/sales/design-requests/data";
import {
  hasSourceDocument,
  isIssuedDesign,
} from "@/components/sales/design-requests/model";
import { requirePermissionResponse } from "@/lib/authz";
import { pdfStorageKey } from "@/lib/document-pdf";
import {
  designHistoryActionLabel,
  designKindLabel,
  designPriorityLabel,
  designTriggerLabel,
} from "@/lib/enum-labels";
import { documentFormatters } from "@/lib/format";
import { renderPdf } from "@/lib/pdf";
import { documentQrSvg } from "@/lib/pdf-qr";
import { QR_KINDS } from "@/lib/qr-payload";
import { getObject, putObject } from "@/lib/storage";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

// 発行元（CKK 本社）— 見積書テンプレートの issuer ブロックに対応。
const ISSUER = {
  name: "シー・ケィ・ケー株式会社", // i18n-ignore
  address: "〒475-0823 愛知県半田市港町2丁目27番2", // i18n-ignore
  tel: "TEL: 0569-21-6187　FAX: 0569-23-6427",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き", // i18n-ignore
  REQUESTED: "承認依頼中", // i18n-ignore
  PENDING: "未着手", // i18n-ignore
  IN_PROGRESS: "進行中", // i18n-ignore
  COMPLETED: "完了", // i18n-ignore
  REJECTED: "差し戻し", // i18n-ignore
  CANCELLED: "キャンセル", // i18n-ignore
};

function pdfHeaders(requestNumber: string, download: boolean): HeadersInit {
  const disp = download ? "attachment" : "inline";
  return {
    "content-type": "application/pdf",
    "content-disposition": `${disp}; filename="${requestNumber}.pdf"`,
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("design_request", "READ");
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const download = url.searchParams.get("download") === "1";
  const force = url.searchParams.get("force") === "1";
  if (!id) {
    return new Response('Missing "id" query parameter', { status: 400 });
  }

  const req = await fetchDesignRequest(id);
  if (!req) {
    return new Response(`Design request not found: ${id}`, { status: 404 });
  }
  // 承認前・キャンセル済みの依頼は刷らせない（承認された中身だけが紙になる）。
  if (!isIssuedDesign(req.status)) {
    return new Response("承認前の設計依頼書は PDF を閲覧できません", {
      // i18n-ignore
      status: 403,
    });
  }

  const storageKey = pdfStorageKey.designRequest(req.requestNumber);

  // 完了して以降は内容が動かないので保管分を返してよい。それ以前は毎回組む。
  if (!force && req.status === "COMPLETED") {
    const cached = await getObject(storageKey);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: pdfHeaders(req.requestNumber, download),
      });
    }
  }

  // 単独起票は紐づく書類が無い。紙でも「—」ではなく理由が読めるようにする。
  const reference = !hasSourceDocument(req.trigger)
    ? "なし（単独起票）" // i18n-ignore
    : req.trigger === "QUOTE"
      ? (req.quoteNumber ?? "—")
      : (req.orderLineNumber ?? "—");

  const data = {
    issuer: ISSUER,
    assignee: { name: req.assigneeName ?? "（担当者未設定）" }, // i18n-ignore
    product: { name: req.productName ?? "（製品未指定）" }, // i18n-ignore
    // 書類 QR（CKK:DSG:<番号>）。URL は入れない。
    doc_qr: documentQrSvg(QR_KINDS.DESIGN_REQUEST, req.requestNumber),
    doc: {
      number: req.requestNumber,
      status: STATUS_LABEL[req.status] ?? req.status,
      kind: designKindLabel(req.kind, "ja"),
      priority: designPriorityLabel(req.priority, "ja"),
      desired_date: documentFormatters.date(req.desiredAt),
      base_design_file: req.baseDesignFileLabel ?? "—",
      change_reason: req.changeReason ?? "—",
      trigger: designTriggerLabel(req.trigger, "ja"),
      reference,
      requested_by: req.createdByName ?? "システム", // i18n-ignore
      requested_date: documentFormatters.date(req.requestedAt),
      approved_date: documentFormatters.date(req.approvedAt),
      completed_date: documentFormatters.date(req.completedAt),
      approved_by: req.history.find((h) => h.action === "APPROVE")?.user ?? "—",
      // 依頼内容がこの帳票の本体。改行はテンプレート側で pre-wrap するので
      // そのまま渡す（HTML は組み立てない）。
      description: req.description ?? "",
      printed_at: documentFormatters.dateTime(new Date().toISOString()),
    },
    files: req.files.map((f) => ({
      version: `v${f.version}${f.isLatest ? "（最新）" : ""}`,
      filename: f.filename,
      notes: f.notes ?? "",
      created_at: documentFormatters.dateTime(f.createdAt),
    })),
    history: req.history.map((h) => ({
      action: designHistoryActionLabel(h.action, "ja"),
      user: h.user ?? "システム", // i18n-ignore
      at: documentFormatters.dateTime(h.at),
      notes: h.notes ?? "",
    })),
  };

  let pdf: ArrayBuffer;
  try {
    pdf = await renderPdf("design-request.html", data);
  } catch (err) {
    console.error("[pdf/design-request]", err);
    return new Response("PDF generation failed", { status: 502 });
  }

  // SeaweedFS へ保管（best-effort — 失敗しても配信は続ける）。
  if (!(await putObject(storageKey, pdf, "application/pdf"))) {
    console.warn(`[pdf/design-request] storage write failed for ${storageKey}`);
  }

  return new Response(pdf, {
    status: 200,
    headers: pdfHeaders(req.requestNumber, download),
  });
}
