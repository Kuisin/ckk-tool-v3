/**
 * pdf-labels.ts — 取引先に出す帳票（見積書 / 納品書 / 請求書）のラベル。
 *
 * **訳はここに持たない。** 実体は `messages/<locale>.json` の `pdf.*` にあり、
 * ここは引くだけ（`lib/messages.ts`）。next-intl の `useTranslations` は使えない
 * — Gotenberg は素の HTML を描くので、リクエストに紐づく React の木が無い。
 *
 * _specs/i18n-glossary.md §2.7 / 決定 10: この 3 帳票は**受取先の言語**で出す
 * （`BusinessPartner.documentLocale` — 支店 → 親会社 → 既定の ja）。閲覧者の
 * `/profile/preferences` では変わらない。解決は各 `api/pdf/*` が
 * `normalizeLocale(...)` で行う。
 *
 * 日付・金額は `documentFormatters`（JST 固定）で整形済みの文字列が渡ってくる。
 * ここが訳すのは**まわりの決まり文句だけ**。
 */

import { escapeHtml } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { label, labelWith } from "@/lib/messages";
import { multilineHtml } from "@/lib/pdf";

interface CommonPdfLabels {
  /** 適格請求書発行事業者の登録番号ラベル。 */
  regNumber: string;
  /** 「御中」— 日本の商習慣の敬称。en/zh では出さない（空文字）。 */
  onchu: string;
  /** 支店名が無いときの宛先行。 */
  attnContactOnly: string;
  /** 支店名の後ろに続ける宛先の敬称部分。 */
  attnContactSuffix: string;
  notes: string;
  subtotal: string;
  grandTotalTaxIncl: string;
}

export interface QuotePdfLabels extends CommonPdfLabels {
  title: string;
  docNumber: string;
  issuedDate: string;
  validUntil: string;
  salesRep: string;
  product: string;
  orderType: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  deliveryDate: string;
  /**
   * 消費税の見出し。既定は「消費税（10%）」だが、ルート側が顧客の課税区分で
   * `taxLabelLocalized` の値に差し替える（見積書の税率は lib/tax-rate.ts）。
   */
  tax: string;
  validityStrip: string;
}

export interface DeliveryNotePdfLabels extends CommonPdfLabels {
  title: string;
  docNumber: string;
  issuedDate: string;
  shippingNumber: string;
  method: string;
  deliveryStrip: string;
  product: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  totalQuantity: string;
  total: string;
  endUserPrefix: string;
}

export interface InvoicePdfLabels extends CommonPdfLabels {
  title: string;
  docNumber: string;
  issuedDate: string;
  period: string;
  dueDate: string;
  billingStrip: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  source: string;
}

/** 宛名行。支店名があればその後ろに敬称を続ける。 */
export function pdfAttnLine(locale: Locale, branchName: string | null): string {
  return branchName
    ? labelWith("pdf.ATTN.withBranch", locale, { branchName })
    : label("pdf.ATTN.contactOnly", locale);
}

export function quotePdfLabels(
  locale: Locale,
  validUntil: string,
): QuotePdfLabels {
  return {
    regNumber: label("pdf.QUOTE.regNumber", locale),
    onchu: label("pdf.QUOTE.onchu", locale),
    attnContactOnly: label("pdf.QUOTE.attnContactOnly", locale),
    attnContactSuffix: label("pdf.QUOTE.attnContactSuffix", locale),
    notes: label("pdf.QUOTE.notes", locale),
    subtotal: label("pdf.QUOTE.subtotal", locale),
    grandTotalTaxIncl: label("pdf.QUOTE.grandTotalTaxIncl", locale),
    title: label("pdf.QUOTE.title", locale),
    docNumber: label("pdf.QUOTE.docNumber", locale),
    issuedDate: label("pdf.QUOTE.issuedDate", locale),
    validUntil: label("pdf.QUOTE.validUntil", locale),
    salesRep: label("pdf.QUOTE.salesRep", locale),
    product: label("pdf.QUOTE.product", locale),
    orderType: label("pdf.QUOTE.orderType", locale),
    quantity: label("pdf.QUOTE.quantity", locale),
    unitPrice: label("pdf.QUOTE.unitPrice", locale),
    amount: label("pdf.QUOTE.amount", locale),
    deliveryDate: label("pdf.QUOTE.deliveryDate", locale),
    tax: label("pdf.QUOTE.tax", locale),
    validityStrip: labelWith("pdf.QUOTE.validityStrip", locale, { validUntil }),
  };
}

export function deliveryNotePdfLabels(locale: Locale): DeliveryNotePdfLabels {
  return {
    regNumber: label("pdf.DELIVERY_NOTE.regNumber", locale),
    onchu: label("pdf.DELIVERY_NOTE.onchu", locale),
    attnContactOnly: label("pdf.DELIVERY_NOTE.attnContactOnly", locale),
    attnContactSuffix: label("pdf.DELIVERY_NOTE.attnContactSuffix", locale),
    notes: label("pdf.DELIVERY_NOTE.notes", locale),
    subtotal: label("pdf.DELIVERY_NOTE.subtotal", locale),
    grandTotalTaxIncl: label("pdf.DELIVERY_NOTE.grandTotalTaxIncl", locale),
    title: label("pdf.DELIVERY_NOTE.title", locale),
    docNumber: label("pdf.DELIVERY_NOTE.docNumber", locale),
    issuedDate: label("pdf.DELIVERY_NOTE.issuedDate", locale),
    shippingNumber: label("pdf.DELIVERY_NOTE.shippingNumber", locale),
    method: label("pdf.DELIVERY_NOTE.method", locale),
    deliveryStrip: label("pdf.DELIVERY_NOTE.deliveryStrip", locale),
    product: label("pdf.DELIVERY_NOTE.product", locale),
    quantity: label("pdf.DELIVERY_NOTE.quantity", locale),
    unitPrice: label("pdf.DELIVERY_NOTE.unitPrice", locale),
    amount: label("pdf.DELIVERY_NOTE.amount", locale),
    totalQuantity: label("pdf.DELIVERY_NOTE.totalQuantity", locale),
    total: label("pdf.DELIVERY_NOTE.total", locale),
    endUserPrefix: label("pdf.DELIVERY_NOTE.endUserPrefix", locale),
  };
}

export function invoicePdfLabels(
  locale: Locale,
  dueDate: string,
): InvoicePdfLabels {
  return {
    regNumber: label("pdf.INVOICE.regNumber", locale),
    onchu: label("pdf.INVOICE.onchu", locale),
    attnContactOnly: label("pdf.INVOICE.attnContactOnly", locale),
    attnContactSuffix: label("pdf.INVOICE.attnContactSuffix", locale),
    notes: label("pdf.INVOICE.notes", locale),
    subtotal: label("pdf.INVOICE.subtotal", locale),
    grandTotalTaxIncl: label("pdf.INVOICE.grandTotalTaxIncl", locale),
    title: label("pdf.INVOICE.title", locale),
    docNumber: label("pdf.INVOICE.docNumber", locale),
    issuedDate: label("pdf.INVOICE.issuedDate", locale),
    period: label("pdf.INVOICE.period", locale),
    dueDate: label("pdf.INVOICE.dueDate", locale),
    billingStrip: labelWith("pdf.INVOICE.billingStrip", locale, { dueDate }),
    description: label("pdf.INVOICE.description", locale),
    quantity: label("pdf.INVOICE.quantity", locale),
    unitPrice: label("pdf.INVOICE.unitPrice", locale),
    amount: label("pdf.INVOICE.amount", locale),
    source: label("pdf.INVOICE.source", locale),
  };
}

/**
 * 取引先ポータルのご利用案内（api/pdf/portal-guide）。
 *
 * 3 帳票と違って**税務書類ではない**ので登録番号・御中まわりの共通ラベルは
 * 使わない（`CommonPdfLabels` を継がない）。宛名の「御中 / 様」だけ要る。
 *
 * 手順の文には**桁数と有効時間を変数で差し込む** — `PORTAL_OTP_LENGTH` や
 * `PORTAL_IDLE_TIMEOUT_MS` を変えたときに紙だけが古いままにならないように、
 * 訳文には数を書かない。
 */
export interface PortalGuidePdfLabels {
  title: string;
  onchu: string;
  attnSuffix: string;
  personalStrip: string;
  howToTitle: string;
  step1: string;
  step2: string;
  step3: string;
  scopeTitle: string;
  scopeDocuments: string;
  scopeBranches: string;
  scopeAsEndUser: string;
  scopeSingleDocuments: string;
  scopeForms: string;
  urlLabel: string;
  emailLabel: string;
  qrCaption: string;
  noticeTitle: string;
  noticeSecret: string;
  noticeIdle: string;
  noticeNoMail: string;
  contactTitle: string;
  contactFallback: string;
}

export function portalGuidePdfLabels(
  locale: Locale,
  vars: {
    contactName: string;
    codeLength: number;
    codeMinutes: number;
    idleHours: number;
    singleDocuments: number;
    formNames: string;
  },
): PortalGuidePdfLabels {
  return {
    title: label("pdf.PORTAL_GUIDE.title", locale),
    onchu: label("pdf.PORTAL_GUIDE.onchu", locale),
    attnSuffix: label("pdf.PORTAL_GUIDE.attnSuffix", locale),
    personalStrip: labelWith("pdf.PORTAL_GUIDE.personalStrip", locale, {
      name: vars.contactName,
    }),
    howToTitle: label("pdf.PORTAL_GUIDE.howToTitle", locale),
    step1: label("pdf.PORTAL_GUIDE.step1", locale),
    step2: labelWith("pdf.PORTAL_GUIDE.step2", locale, {
      length: vars.codeLength,
      minutes: vars.codeMinutes,
    }),
    step3: label("pdf.PORTAL_GUIDE.step3", locale),
    scopeTitle: label("pdf.PORTAL_GUIDE.scopeTitle", locale),
    scopeDocuments: label("pdf.PORTAL_GUIDE.scopeDocuments", locale),
    scopeBranches: label("pdf.PORTAL_GUIDE.scopeBranches", locale),
    scopeAsEndUser: label("pdf.PORTAL_GUIDE.scopeAsEndUser", locale),
    scopeSingleDocuments: labelWith(
      "pdf.PORTAL_GUIDE.scopeSingleDocuments",
      locale,
      { count: vars.singleDocuments },
    ),
    scopeForms: labelWith("pdf.PORTAL_GUIDE.scopeForms", locale, {
      names: vars.formNames,
    }),
    urlLabel: label("pdf.PORTAL_GUIDE.urlLabel", locale),
    emailLabel: label("pdf.PORTAL_GUIDE.emailLabel", locale),
    qrCaption: label("pdf.PORTAL_GUIDE.qrCaption", locale),
    noticeTitle: label("pdf.PORTAL_GUIDE.noticeTitle", locale),
    noticeSecret: label("pdf.PORTAL_GUIDE.noticeSecret", locale),
    noticeIdle: labelWith("pdf.PORTAL_GUIDE.noticeIdle", locale, {
      hours: vars.idleHours,
    }),
    noticeNoMail: label("pdf.PORTAL_GUIDE.noticeNoMail", locale),
    contactTitle: label("pdf.PORTAL_GUIDE.contactTitle", locale),
    contactFallback: label("pdf.PORTAL_GUIDE.contactFallback", locale),
  };
}

/** 注文種別 — 帳票の中だけで使う小さな閉じた表。 */
export function orderTypeLabelLocalized(
  orderType: string,
  locale: Locale,
): string {
  return label(`pdf.ORDER_TYPE.${orderType}`, locale, orderType);
}

/** 配送方法（ユーザー直送 / 通常納品）— 納品書のみ。 */
export function deliveryMethodLabelLocalized(
  method: string,
  locale: Locale,
): string {
  return label(`pdf.DELIVERY_METHOD.${method}`, locale, method);
}

/**
 * 消費税ラベル（税率・非課税）— 請求書・見積書。未指定は課税扱い。
 *
 * @deprecated 税率ごとの区分記載（`taxRowLabelLocalized`）へ移行中。区分に
 * 頼ると管理者が足した独自区分を表せず、混在請求書では区分が 1 つに定まらない。
 */
export function taxLabelLocalized(
  taxType: string | null | undefined,
  locale: Locale,
): string {
  const key = taxType ?? "TAXABLE";
  const hit = label(`pdf.TAX.${key}`, locale, "");
  return hit || label("pdf.TAX.TAXABLE", locale);
}

/**
 * 税率ごとの区分記載の見出し — 「消費税（10%）」。
 *
 * **率から組み立てる**（区分名ではなく）。区分名は「軽減税率」のように率を
 * 含まないことがあり、区分記載として読めない。0% だけは「非課税」— 帳票で
 * 「消費税（0%）」は不自然なので。
 *
 * 以前は % を訳文に焼き込んでいた（`"消費税（10%）"`）ので、税率が変わると
 * 3 言語の訳文を直す必要があった。いまは `{rate}` を差し込む。
 */
export function taxRowLabelLocalized(taxRate: number, locale: Locale): string {
  if (taxRate === 0) return label("pdf.TAX.EXEMPT", locale);
  return label("pdf.TAX.RATE", locale, "", {
    rate: String(Number((taxRate * 100).toFixed(4))),
  });
}

/** 混在時だけ添える「対象 ¥X」。単一税率では対象額 = 小計なので出さない。 */
export function taxBaseSuffixLocalized(
  taxableBase: string,
  locale: Locale,
): string {
  return label("pdf.TAX.BASE_SUFFIX", locale, "", { base: taxableBase });
}

/**
 * 見積書の明細 1 行の**注意書き**（行の直下に刷る HTML 断片）。
 *
 * 載るのは 2 つ — どちらも無ければ空文字（行を足さない）:
 *   - 値引き: 「※ {値引き名}: -¥{額}」。単価欄は値引き前、金額欄は値引き後
 *     なので、その差がどこから来たのかをこの 1 行が説明する。値引き名が無い
 *     行は「値引き」と刷る（額だけでは何の差か読めない）。
 *   - 明細の備考: 複数行。改行は <br>、中身は必ずエスケープする
 *     （`multilineHtml` — 備考は利用者が書く文字列。lib/pdf.ts 監査 H4）。
 *
 * 文言は受取先の言語（`locale`）で引く。`amount` は整形済みの金額文字列。
 */
/**
 * 帳票の円記号は半角 `¥`（合計欄の `¥ 215,010`・値引きの `-¥12,000`）。
 * 画面用に整形された文字列（Intl の ja-JP は全角 `￥` を出す）を帳票へ流す
 * ときはここを通す。
 */
export function pdfYenSign(text: string): string {
  return text.replaceAll("\uFFE5", "\u00A5");
}

/**
 * 見積書の明細: 再研磨の行の「研ぎ直す工具」を品名の下に刷る断片
 * （`{{{tool_html}}}`）。工具が無い行は空 — 行を増やさない。
 * 文言は受取先の言語、工具名は必ずエスケープする（品目名は利用者が書く文字列）。
 */
export function quoteLineToolHtml(
  toolLabel: string | null | undefined,
  locale: Locale,
): string {
  const tool = toolLabel?.trim();
  if (!tool) return "";
  const text = labelWith("pdf.QUOTE.toolLine", locale, { tool });
  return `<br><span class="sub line-tool">${escapeHtml(text)}</span>`;
}

export function quoteLineNoteHtml(
  line: {
    discountLabel: string | null;
    discountAmount: number;
    notes: string | null;
  },
  amount: string,
  locale: Locale,
): string {
  const parts: string[] = [];
  if (line.discountAmount > 0) {
    // 値引きの名前は保存時のスナップショット（「まとめ買い値引き（￥200/本）」）で、
    // 画面の金額書式（Intl の ja-JP は全角の ￥）のまま入っている。帳票の金額は
    // 半角の ¥ で刷るので、1 行の中で全角と半角が混ざらないよう揃える。
    const name = pdfYenSign(
      line.discountLabel?.trim() || label("pdf.QUOTE.lineDiscount", locale),
    );
    const text = labelWith("pdf.QUOTE.lineDiscountNote", locale, {
      label: name,
      amount,
    });
    parts.push(`<div class="line-discount">${escapeHtml(text)}</div>`);
  }
  const notes = line.notes?.trim();
  if (notes) {
    parts.push(`<div class="line-notes">${multilineHtml(notes)}</div>`);
  }
  return parts.join("");
}
