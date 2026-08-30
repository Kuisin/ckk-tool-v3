/**
 * GET /api/pdf/kiosk-cards?ids=...&download=1 — QR カード印刷シート PDF (SY08)。
 *
 * ブラウザ印刷（window.print）ではなく Gotenberg で PDF を生成して返す。
 * 用紙は **A4 名刺用紙 10 面**（エーワン等）。カードは日本名刺サイズ
 * 91×55mm を隙間なしで 2 列 × 5 行 = 10 枚/頁、A4 上の位置は 10 面
 * マルチカードの定位置（上下 11mm / 左右 14mm）。断裁ガイドは各カード四隅の
 * トリム線交点を中心にした十字線 — テンプレートは
 * src/pdf-templates/kiosk-cards.html。
 *
 * ★ 原寸（91×55mm）を絶対に崩さないための geometry は下の SHEET が唯一の
 *   定義で、Gotenberg のページサイズとテンプレート CSS の両方へ流し込む。
 *
 * 選択に依存する一時ドキュメントのため SeaweedFS へはキャッシュしない
 * （帳票 PDF と違い保存キーが定まらない + 氏名入りで使い捨て）。
 */

import { formatCode } from "@/lib/crockford";
import { escapeHtml } from "@/lib/format";
import {
  fetchKioskCardsForPrint,
  type KioskCardPrintRow,
} from "@/lib/kiosk-admin";
import {
  CARD_SHEET_PAGE,
  CARDS_PER_PAGE,
  cardSheetTemplateVars,
} from "@/lib/kiosk-card-sheet";
import { renderPdf } from "@/lib/pdf";
import { withPrintPreferences } from "@/lib/pdf-print-prefs";
import { useElevation } from "@/lib/privileged-access";
import { qrSvg } from "@/lib/qr";

export const dynamic = "force-dynamic";

// 寸法（原寸印刷の要）は lib/kiosk-card-sheet.ts が唯一の定義。

/** カード 1 枚分のセル（十字トンボ + QR + 社名 + 氏名/記名線 + No.）。 */
function cardCell(card: KioskCardPrintRow): string {
  const code = formatCode(card.id);
  const user = card.userDisplayName
    ? `<span class="user">${escapeHtml(card.userDisplayName)}</span>`
    : `<span class="user-line"></span>`;
  return `<div class="cell">
    <span class="crop crop-tl"></span>
    <span class="crop crop-tr"></span>
    <span class="crop crop-bl"></span>
    <span class="crop crop-br"></span>
    <div class="card">
      <div class="qr">${qrSvg(code, { margin: 2 })}</div>
      <div class="head">
        <span class="company">シー・ケィ・ケー株式会社</span>
        ${user}
        <span class="shortcode">No. ${code.slice(-9)}</span>
      </div>
      <div class="full-id">${code}</div>
    </div>
  </div>`;
}

/** 10 枚ごとにページへ分割した HTML（テンプレートの {{pages}} へ注入）。 */
function pagesHtml(cards: KioskCardPrintRow[]): string {
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
    const cells = cards
      .slice(i, i + CARDS_PER_PAGE)
      .map(cardCell)
      .join("\n");
    pages.push(`<div class="sheet"><div class="grid">${cells}</div></div>`);
  }
  return pages.join("\n");
}

/** 保存名が一意になる日時サフィックス（JST）。 */
function timestampJst(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}`;
}

export async function GET(request: Request): Promise<Response> {
  // 台紙の PDF は QR（= 認証情報そのもの）をファイルとして手元に残す操作。
  // 一覧を見るのとは重さが違うので、承認された期間だけに絞る。
  const gate = await useElevation("kiosk_card.print");
  if (!gate.ok) {
    return Response.json(
      { error: gate.error },
      { status: gate.needsElevation ? 403 : 401 },
    );
  }

  const params = new URL(request.url).searchParams;
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z2-9]{16}$/.test(s))
    .slice(0, 100);
  if (ids.length === 0) {
    return Response.json(
      { error: "印刷対象のカードが指定されていません" },
      { status: 400 },
    );
  }
  const cards = await fetchKioskCardsForPrint(ids);
  if (cards.length === 0) {
    return Response.json(
      { error: "印刷対象のカードがありません" },
      { status: 404 },
    );
  }

  let pdf: ArrayBuffer;
  try {
    // 余白 0 でミリ単位のレイアウトをテンプレート CSS に完全委譲する。
    // ページサイズは SHEET から算出した値を Gotenberg と CSS の両方へ渡す。
    pdf = await renderPdf(
      "kiosk-cards.html",
      { pages: pagesHtml(cards), ...cardSheetTemplateVars() },
      {
        margins: "0",
        paperWidth: `${CARD_SHEET_PAGE.width}mm`,
        paperHeight: `${CARD_SHEET_PAGE.height}mm`,
      },
    );
    // 印刷ダイアログの既定を「原寸（100%）」に固定する。用紙はプリンタ既定
    // （日本なら A4）に載せたいので、実在しないページサイズでトレイを選ばせない。
    pdf = withPrintPreferences(pdf, { pickTrayByPdfSize: false });
  } catch (err) {
    console.error("[pdf/kiosk-cards]", err);
    return Response.json({ error: "PDF generation failed" }, { status: 502 });
  }

  const stamp = timestampJst();
  const asciiName = `qr-cards_${stamp}.pdf`;
  const utf8Name = encodeURIComponent(`QRカード印刷_${stamp}.pdf`);
  const disposition = params.get("download") === "1" ? "attachment" : "inline";
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
