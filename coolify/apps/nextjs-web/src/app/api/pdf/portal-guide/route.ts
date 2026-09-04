/**
 * GET /api/pdf/portal-guide?account=<id>|bp=<id>[&download=1]
 *   — 取引先ポータルのご利用案内 PDF（SY0H から発行して手渡す紙）。
 *
 * **ご担当者 1 名 = 1 ページ**の束で、1 枚が完結した案内になっている
 * （1 社に窓口が複数あるのは普通なので、切り離してそれぞれに渡せる）。
 *   `account=` … その 1 名ぶん
 *   `bp=`      … その取引先の有効なアカウント全員ぶん
 *
 * ■ 受取先の言語で刷る（_specs/i18n-glossary.md 決定 10）
 * 取引先に渡す紙なので、見る社員の表示設定ではなく `document_locale` で決まる。
 * 見積書・納品書・請求書と同じ規約。
 *
 * ■ 保存しない
 * 帳票と違って書類番号が無く、内容（共有範囲・担当営業）はその時点の写し。
 * SeaweedFS に置くと「いつの案内か」が判らない古い紙が残るので、毎回刷る。
 *
 * ■ 紙に載せない秘密
 * バックアップコード・セッション・書類リンクのトークンは載せない
 * （lib/portal-guide-core.ts の方針）。QR に入るのは宛先アドレスの前埋めまで。
 */

import { requirePermissionResponse } from "@/lib/authz";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { escapeHtml } from "@/lib/format";
import { renderPdf } from "@/lib/pdf";
import { portalGuidePdfLabels } from "@/lib/pdf-labels";
import {
  PORTAL_IDLE_TIMEOUT_MS,
  PORTAL_OTP_LENGTH,
  PORTAL_OTP_TTL_MS,
} from "@/lib/portal-auth-core";
import {
  fetchPortalGuideForAccount,
  fetchPortalGuideForBp,
  type PortalGuideError,
  type PortalGuidePage,
} from "@/lib/portal-guide";
import type { PortalGuideScope } from "@/lib/portal-guide-core";
import { qrSvg } from "@/lib/qr";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

// 発行元（CKK 本社）— quote / delivery-note ルートの issuer と同一。
// 登録番号は載せない（税務書類ではない）。
const ISSUER = {
  name: "シー・ケィ・ケー株式会社", // i18n-ignore
  address: "〒475-0823 愛知県半田市港町2丁目27番2", // i18n-ignore
  tel: "TEL: 0569-21-6187　FAX: 0569-23-6427",
};

/** 発行できない理由 → 応答。理由ごとに文言を分ける（管理者が読む画面）。 */
const ERROR_STATUS: Record<PortalGuideError, number> = {
  NOT_FOUND: 404,
  INACTIVE: 409,
  NO_ACCOUNTS: 404,
};

const ERROR_KEY: Record<PortalGuideError, string> = {
  NOT_FOUND: "settings.portalGuide.accountNotFound",
  INACTIVE: "settings.portalGuide.activateBeforeIssuing",
  NO_ACCOUNTS: "settings.portalGuide.noActiveAccounts",
};

/**
 * 「ご覧いただけるもの」の箇条書き。当てはまる行だけを組み立てる
 * （テンプレートエンジンに条件分岐が無い）。中身は訳済みの文字列なので
 * エスケープしてから `<li>` に包む。
 */
function scopeHtml(
  scope: PortalGuideScope,
  labels: ReturnType<typeof portalGuidePdfLabels>,
): string {
  const lines: string[] = [];
  if (scope.documents) {
    lines.push(labels.scopeDocuments);
    if (scope.branches) lines.push(labels.scopeBranches);
    if (scope.asEndUser) lines.push(labels.scopeAsEndUser);
  }
  if (scope.singleDocuments > 0) lines.push(labels.scopeSingleDocuments);
  if (scope.forms.length > 0) lines.push(labels.scopeForms);
  return lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
}

/** お問い合わせ欄。担当営業が居なければ定型文だけ。 */
function contactHtml(
  page: PortalGuidePage,
  labels: ReturnType<typeof portalGuidePdfLabels>,
): string {
  if (!page.salesRepName) return escapeHtml(labels.contactFallback);
  const name = escapeHtml(page.salesRepName);
  const mail = page.salesRepEmail
    ? `<br>${escapeHtml(page.salesRepEmail)}`
    : "";
  return `${name}${mail}`;
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("portal_admin", "READ");
  if (denied) return denied;
  // ポータルが無い環境ではこの紙も存在しない。
  if (!isDevFeatureEnabled("portal")) {
    return new Response("Not found", { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const accountId = params.get("account");
  const bpId = params.get("bp");
  if (!accountId && !bpId) {
    return Response.json(
      { error: 'Missing "account" or "bp" query parameter' },
      { status: 400 },
    );
  }

  const result = accountId
    ? await fetchPortalGuideForAccount(accountId)
    : await fetchPortalGuideForBp(bpId as string);
  if (!result.ok) {
    // 文言の鍵だけを返す（この API を呼ぶのは管理画面のリンクなので、
    // 画面側が訳す）。理由は状態コードでも区別できる。
    return Response.json(
      { error: ERROR_KEY[result.error], reason: result.error },
      { status: ERROR_STATUS[result.error] },
    );
  }

  const { document } = result;
  const codeMinutes = Math.round(PORTAL_OTP_TTL_MS / 60_000);
  const idleHours = Math.round(PORTAL_IDLE_TIMEOUT_MS / 3_600_000);

  const pages = document.pages.map((page) => {
    // 手順の文には桁数・有効時間が、共有の文には件数と名前が入るので、
    // ラベルは**ページごと**に作る。
    const labels = portalGuidePdfLabels(document.locale, {
      contactName: page.contactName,
      codeLength: PORTAL_OTP_LENGTH,
      codeMinutes,
      idleHours,
      singleDocuments: page.scope.singleDocuments,
      formNames: page.scope.forms.join(" / "),
    });
    return {
      labels,
      partner_name: page.partnerName,
      contact_name: page.contactName,
      email: page.email,
      login_url: page.loginUrl,
      // 自前生成の SVG（外部入力は混ざらない）。テンプレートは三重括弧。
      qr: qrSvg(page.qrUrl, { margin: 2 }),
      scope_html: scopeHtml(page.scope, labels),
      contact_html: contactHtml(page, labels),
    };
  });

  let pdf: ArrayBuffer;
  try {
    pdf = await renderPdf("portal-guide.html", {
      lang: document.locale,
      issuer: ISSUER,
      // `<title>` はループの外なので根にも 1 つ要る（中身は同じ見出し）。
      labels: pages[0]?.labels,
      pages,
    });
  } catch (err) {
    console.error("[pdf/portal-guide]", err);
    return Response.json({ error: "PDF generation failed" }, { status: 502 });
  }

  const disposition = params.get("download") === "1" ? "attachment" : "inline";
  const asciiName = "portal-guide.pdf";
  const utf8Name = encodeURIComponent(
    `ポータルご利用案内_${document.partnerName}.pdf`, // i18n-ignore
  );
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
