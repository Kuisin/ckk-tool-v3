/**
 * GET /api/export/accounting?invoice=<INV-…> — 会計連携（仕訳CSV）エクスポート.
 *
 * 請求書 1 件 → 会計文書（`accounting_documents`）を**転記した瞬間に固定**し、
 * 以後は何回叩いても**再計算せず**同じ CSV を返す（`lib/accounting-documents.ts`）。
 * 仕訳日付は発行日。**下書き（DRAFT）は出さない**（金額が確定していない仕訳を
 * 会計へ渡さない — 409）。
 *
 * `force=1` は廃止した — 転記済みの文書はマスタ・設定を直しても中身が変わらない
 * ので、上書き用の脱出口を持つ必要が無くなった（旧実装はここで毎回計算し直して
 * いたため、`force=1` が「同じ請求書番号のまま中身が変わった CSV」を作れてしまう
 * 穴だった）。ミスの訂正は請求書詳細の「反対仕訳を作成」から行う。
 *
 * 列の並び・文字コード・既定の科目コードは SY0J 会計連携（/settings/accounting）
 * が持つ。旧 /api/export/yayoi は next.config.ts のリダイレクトでここへ来る。
 */

import { fetchInvoice } from "@/app/(dashboard)/billing/invoices/data";
import {
  fetchActiveAccountingDocument,
  postAccountingDocument,
} from "@/lib/accounting-documents";
import { encodeAccountingCsv } from "@/lib/accounting-encode";
import { renderJournalCsv } from "@/lib/accounting-export-core";
import { getAccountingSettings } from "@/lib/accounting-settings";
import { getCurrentActorId } from "@/lib/audit";
import { requirePermissionResponse } from "@/lib/authz";
import { parseDocKey } from "@/lib/doc-number";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("billing_closing", "EXPORT");
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("invoice");
  if (!id) {
    return new Response('Missing "invoice" query parameter', { status: 400 });
  }

  const key = parseDocKey(id, "INV");
  const invoice = key ? await fetchInvoice(key) : null;
  if (!key || !invoice) {
    return new Response(`Invoice not found: ${id}`, { status: 404 });
  }

  if (invoice.status === "DRAFT" || !invoice.issuedAt) {
    return new Response(`Invoice ${id} is a draft; issue it before export`, {
      status: 409,
    });
  }

  const settings = await getAccountingSettings();

  // 有効な転記（POSTED・反対仕訳ではない）があれば、それをそのまま描き直す —
  // 新しい行は一切計算しない。何度叩いても同じバイト列になる。
  let doc = await fetchActiveAccountingDocument(key);
  if (!doc) {
    const actorId = await getCurrentActorId();
    const posted = await postAccountingDocument(key, actorId);
    if (!posted.ok) {
      return new Response(posted.error, { status: 409 });
    }
    doc = posted.data;
  }

  const text = renderJournalCsv(doc.rows, settings);
  const { bytes, contentType, unmappable } = encodeAccountingCsv(
    text,
    settings.encoding,
  );
  if (unmappable.length > 0) {
    console.warn(
      // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
      `[export/accounting] ${invoice.invoiceNumber}: ${settings.encoding} に変換できない文字を代替しました:`,
      unmappable.join(""),
    );
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${invoice.invoiceNumber}_${settings.filenameSuffix}.csv"`,
    },
  });
}
