/**
 * GET /api/pdf/form-response — フォーム回答の PDF。
 *
 *   ?id=<回答番号>                        1 件だけ
 *   ?code=<フォームコード>&status=&from=&to=&fields=   絞り込んだ分をまとめて
 *   &download=1                           添付として落とす（既定は画面で開く）
 *
 * `/api/pdf/**` に置いてあるのは **next.config.ts の outputFileTracingIncludes が
 * このパスにしかテンプレートを含めない**ため。ここから動かすと standalone
 * ビルドで `src/pdf-templates/` が消え、本番だけ 502 になる。
 *
 * 生成した PDF は保存しない。他の帳票（見積書・請求書）は「発行したら中身が
 * 固定される書類」なので SeaweedFS に置いているが、回答は編集も差し戻しも
 * あるので、古い PDF を返すほうが害が大きい。
 */

import { fetchApprovalTrail, isApproverOf } from "@/lib/approvals";
import { recordAudit } from "@/lib/audit";
import { requirePermissionResponse, sessionUserId } from "@/lib/authz";
import { exportDownloadName, loadFormExport } from "@/lib/form-export";
import { parseExportFilter } from "@/lib/form-export-core";
import { responsePageHtml, responsePagesHtml } from "@/lib/form-response-pdf";
import { fetchResponse, formAccess } from "@/lib/forms";
import { renderPdf } from "@/lib/pdf";
import { responseInScope } from "@/lib/share-grants-core";
import { getServerFormatters } from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

/** まとめ印刷の上限。1 回答 = 1 ページなので、これでも 200 ページ。 */
const MAX_BULK_PAGES = 200;

function pdfHeaders(filename: string, download: boolean): HeadersInit {
  return {
    "content-type": "application/pdf",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="form-response.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "no-store",
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const code = url.searchParams.get("code");
  const download = url.searchParams.get("download") === "1";

  if (!id && !code)
    return new Response('Missing "id" or "code" query parameter', {
      status: 400,
    });

  const fmt = await getServerFormatters();
  const viewerId = await sessionUserId();

  // ── 1 件だけ ──────────────────────────────────────────────────────────────
  if (id) {
    // 単票は「読めれば刷れる」— EXPORT を要求すると、自分の申請すら
    // 手元に残せない人が出る。持ち出しの門はまとめ印刷の側に置く。
    const denied = await requirePermissionResponse("form", "READ");
    if (denied) return denied;

    const response = await fetchResponse(id);
    if (!response) return new Response("Not found", { status: 404 });

    const access = await formAccess(response.form);
    const isOwner = !!viewerId && response.submittedBy === viewerId;
    const inScope =
      access.canRead && responseInScope(access.responseScope, response.answers);
    // 承認者は共有が「回答のみ」でも刷れる必要がある（回答詳細と同じ門）。
    const isApprover = await isApproverOf("form_responses", id, viewerId);
    if (!inScope && !isOwner && !isApprover)
      return new Response("Not found", { status: 404 });

    const trail = response.form.approvalEnabled
      ? await fetchApprovalTrail("form_responses", id)
      : [];

    const page = responsePageHtml({
      formTitle: response.form.title,
      formCode: response.form.code,
      // 匿名フォームの名前は fetchResponse が既に null にしている。
      respondent: response.respondent,
      response: {
        responseNumber: response.responseNumber,
        recordNo: response.recordNo,
        status: response.status,
        respondent: response.respondent,
        submittedAt: response.submittedAt,
        createdAt: response.createdAt,
        answers: response.answers,
      },
      fields: response.fields,
      trail,
      fmt,
    });

    return renderResponse(
      [page],
      exportDownloadName(response.form.title, response.responseNumber, "pdf"),
      download,
    );
  }

  // ── 絞り込んだ分をまとめて ────────────────────────────────────────────────
  // こちらは何十件も持ち出す操作なので EXPORT を要求する。
  const denied = await requirePermissionResponse("form", "EXPORT");
  if (denied) return denied;

  const filter = parseExportFilter(url.searchParams);
  const data = await loadFormExport(code as string, filter, viewerId);
  if (!data) return new Response("Not found", { status: 404 });

  const { form, fields, responses } = data;
  if (responses.length === 0)
    return new Response("印刷できる回答がありません", { status: 409 });

  const capped = responses.slice(0, MAX_BULK_PAGES);
  const showRespondent = form.respondentVisibility === "SHOWN";

  // 承認の記録は 1 件ずつ引くことになるので、まとめ印刷では載せない
  // （200 件 × 数クエリはこの導線に見合わない）。単票では出る。
  const pages = capped.map((response) =>
    responsePageHtml({
      formTitle: form.title,
      formCode: form.code,
      respondent: showRespondent ? response.respondent : null,
      response,
      fields,
      trail: [],
      fmt,
    }),
  );

  await recordAudit({
    action: "EXPORT",
    tableName: "forms",
    recordId: form.code,
    after: {
      note: `回答を PDF でまとめて印刷（${capped.length} 件${
        responses.length > capped.length
          ? `・上限 ${MAX_BULK_PAGES} 件で打ち切り`
          : ""
      }）`,
    },
  }).catch(() => {});

  return renderResponse(
    pages,
    exportDownloadName(
      form.title,
      capped.length < responses.length ? `${form.code}_一部` : form.code,
      "pdf",
    ),
    download,
  );
}

async function renderResponse(
  pages: string[],
  filename: string,
  download: boolean,
): Promise<Response> {
  let pdf: ArrayBuffer;
  try {
    pdf = await renderPdf("form-response.html", {
      pages: responsePagesHtml(pages),
    });
  } catch (err) {
    console.error("[pdf/form-response]", err);
    return new Response("PDF generation failed", { status: 502 });
  }
  return new Response(pdf, {
    status: 200,
    headers: pdfHeaders(filename, download),
  });
}
