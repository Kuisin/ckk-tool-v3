/**
 * pdf-labels.ts — static ja/en/zh label sets for partner-facing document PDFs
 * (見積書 / 納品書 / 請求書). Server-only, no next-intl (Gotenberg renders plain
 * HTML — there is no request-scoped React tree for `useTranslations` there).
 *
 * _specs/i18n-glossary.md §2.7 / 決定 10: these documents render in the
 * **recipient's** language (`BusinessPartner.documentLocale` — branch first,
 * then the parent company, falling back to the default ja), never the
 * viewer's `/profile/preferences` setting. Each `api/pdf/*` route resolves it
 * itself via `normalizeLocale(quote.recipientDocumentLocale)` (the `data.ts`
 * mapper already picks branch-over-parent).
 *
 * Dates/amounts stay pre-formatted by `documentFormatters` (JST, fixed) before
 * reaching these labels — only the static surrounding text is translated here.
 */

import type { Locale } from "@/lib/i18n";

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

const COMMON: Record<Locale, CommonPdfLabels> = {
  ja: {
    regNumber: "登録番号:",
    onchu: "御中",
    attnContactOnly: "ご担当者 様",
    attnContactSuffix: "　ご担当者 様",
    notes: "備考",
    subtotal: "小計",
    grandTotalTaxIncl: "合計金額（税込）",
  },
  en: {
    regNumber: "Registration No.:",
    onchu: "",
    attnContactOnly: "Attn: Contact",
    attnContactSuffix: " — Attn: Contact",
    notes: "Notes",
    subtotal: "Subtotal",
    grandTotalTaxIncl: "Total (incl. tax)",
  },
  zh: {
    regNumber: "登记编号：",
    onchu: "",
    attnContactOnly: "收件人：经办人",
    attnContactSuffix: " 收件人：经办人",
    notes: "备注",
    subtotal: "小计",
    grandTotalTaxIncl: "合计金额（含税）",
  },
};

/** Build the recipient meta line (branch name + attn line), locale-aware. */
export function pdfAttnLine(locale: Locale, branchName: string | null): string {
  const l = COMMON[locale];
  return branchName ? `${branchName}${l.attnContactSuffix}` : l.attnContactOnly;
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
  /** 消費税（10%）— 見積の税率は固定（lib/pricing/model.ts TAX_RATE）。 */
  tax: string;
  validityStrip: string;
}

export function quotePdfLabels(
  locale: Locale,
  validUntil: string,
): QuotePdfLabels {
  const common = COMMON[locale];
  const byLocale: Record<
    Locale,
    Omit<QuotePdfLabels, keyof CommonPdfLabels>
  > = {
    ja: {
      title: "見積書",
      docNumber: "見積書番号",
      issuedDate: "発行日",
      validUntil: "有効期限",
      salesRep: "担当営業",
      product: "製品",
      orderType: "注文種別",
      quantity: "数量",
      unitPrice: "単価 (円)",
      amount: "金額 (円)",
      deliveryDate: "納期",
      tax: "消費税（10%）",
      validityStrip: `本見積書の有効期限は ${validUntil} までとなります。期限内にご注文をお願いいたします。`,
    },
    en: {
      title: "Quote",
      docNumber: "Quote number",
      issuedDate: "Issued date",
      validUntil: "Valid until",
      salesRep: "Sales rep",
      product: "Product",
      orderType: "Order type",
      quantity: "Quantity",
      unitPrice: "Unit price (¥)",
      amount: "Amount (¥)",
      deliveryDate: "Delivery date",
      tax: "Tax (10%)",
      validityStrip: `This quote is valid until ${validUntil}. Please place your order within this period.`,
    },
    zh: {
      title: "报价单",
      docNumber: "报价单号",
      issuedDate: "发行日期",
      validUntil: "有效期至",
      salesRep: "销售负责人",
      product: "产品",
      orderType: "订单类别",
      quantity: "数量",
      unitPrice: "单价（日元）",
      amount: "金额（日元）",
      deliveryDate: "交期",
      tax: "税额（10%）",
      validityStrip: `本报价单有效期至 ${validUntil}，请在此期限内下单。`,
    },
  };
  return { ...common, ...byLocale[locale] };
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

export function deliveryNotePdfLabels(locale: Locale): DeliveryNotePdfLabels {
  const common = COMMON[locale];
  const byLocale: Record<
    Locale,
    Omit<DeliveryNotePdfLabels, keyof CommonPdfLabels>
  > = {
    ja: {
      title: "納品書",
      docNumber: "納品書番号",
      issuedDate: "発行日",
      shippingNumber: "出荷書番号",
      method: "納品方法",
      deliveryStrip:
        "下記の通り納品いたします。ご査収のほどよろしくお願いいたします。",
      product: "製品",
      quantity: "数量",
      unitPrice: "単価 (円)",
      amount: "金額 (円)",
      totalQuantity: "数量合計",
      total: "合計金額",
      endUserPrefix: "届け先（最終需要家）:",
    },
    en: {
      title: "Delivery note",
      docNumber: "Delivery note number",
      issuedDate: "Issued date",
      shippingNumber: "Delivery order number",
      method: "Delivery method",
      deliveryStrip: "Delivered as detailed below. Please confirm receipt.",
      product: "Product",
      quantity: "Quantity",
      unitPrice: "Unit price (¥)",
      amount: "Amount (¥)",
      totalQuantity: "Total quantity",
      total: "Total",
      endUserPrefix: "Ship-to (end user):",
    },
    zh: {
      title: "送货单",
      docNumber: "送货单号",
      issuedDate: "发行日期",
      shippingNumber: "出货单号",
      method: "配送方式",
      deliveryStrip: "谨此送货如下，请查收。",
      product: "产品",
      quantity: "数量",
      unitPrice: "单价（日元）",
      amount: "金额（日元）",
      totalQuantity: "数量合计",
      total: "合计金额",
      endUserPrefix: "送货对象（最终用户）：",
    },
  };
  return { ...common, ...byLocale[locale] };
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

export function invoicePdfLabels(
  locale: Locale,
  dueDate: string,
): InvoicePdfLabels {
  const common = COMMON[locale];
  const byLocale: Record<
    Locale,
    Omit<InvoicePdfLabels, keyof CommonPdfLabels>
  > = {
    ja: {
      title: "請求書",
      docNumber: "請求書番号",
      issuedDate: "発行日",
      period: "請求期間",
      dueDate: "支払期限",
      billingStrip: `下記の通りご請求申し上げます。${dueDate} までにお支払いをお願いいたします。`,
      description: "摘要",
      quantity: "数量",
      unitPrice: "単価 (円)",
      amount: "金額 (円)",
      source: "由来",
    },
    en: {
      title: "Invoice",
      docNumber: "Invoice number",
      issuedDate: "Issued date",
      period: "Billing period",
      dueDate: "Payment due",
      billingStrip: `Billed as detailed below. Please remit payment by ${dueDate}.`,
      description: "Description",
      quantity: "Quantity",
      unitPrice: "Unit price (¥)",
      amount: "Amount (¥)",
      source: "Source",
    },
    zh: {
      title: "请款单",
      docNumber: "请款单号",
      issuedDate: "发行日期",
      period: "请款期间",
      dueDate: "付款截止日",
      billingStrip: `谨此请款如下，请于 ${dueDate} 前付款。`,
      description: "摘要",
      quantity: "数量",
      unitPrice: "单价（日元）",
      amount: "金额（日元）",
      source: "来源",
    },
  };
  return { ...common, ...byLocale[locale] };
}

/** 注文種別（本番/テスト/サンプル/その他）— quote items のみで使う小さな閉じた翻訳。 */
export function orderTypeLabelLocalized(
  orderType: string,
  locale: Locale,
): string {
  const MAP: Record<Locale, Record<string, string>> = {
    ja: {
      PRODUCTION: "本番",
      TEST: "テスト",
      SAMPLE: "サンプル",
      OTHER: "その他",
    },
    en: {
      PRODUCTION: "Production",
      TEST: "Test",
      SAMPLE: "Sample",
      OTHER: "Other",
    },
    zh: { PRODUCTION: "量产", TEST: "试制", SAMPLE: "样品", OTHER: "其他" },
  };
  return MAP[locale][orderType] ?? orderType;
}

/** 配送方法（ユーザー直送/通常納品）— delivery-note のみで使う小さな閉じた翻訳。 */
export function deliveryMethodLabelLocalized(
  method: string,
  locale: Locale,
): string {
  const MAP: Record<Locale, Record<string, string>> = {
    ja: { DIRECT_TO_USER: "ユーザー直送", NORMAL: "通常納品" },
    en: { DIRECT_TO_USER: "Direct to end user", NORMAL: "Standard delivery" },
    zh: { DIRECT_TO_USER: "直送最终用户", NORMAL: "常规配送" },
  };
  return MAP[locale][method] ?? method;
}

/** 消費税ラベル（税率・非課税）— invoice のみで使う小さな閉じた翻訳。 */
export function taxLabelLocalized(
  taxType: string | null | undefined,
  locale: Locale,
): string {
  const MAP: Record<Locale, Record<string, string>> = {
    ja: {
      REDUCED: "消費税（8%）",
      EXEMPT: "消費税（非課税）",
      TAXABLE: "消費税（10%）",
    },
    en: {
      REDUCED: "Tax (8%)",
      EXEMPT: "Tax exempt",
      TAXABLE: "Tax (10%)",
    },
    zh: {
      REDUCED: "税额（8%）",
      EXEMPT: "免税",
      TAXABLE: "税额（10%）",
    },
  };
  return MAP[locale][taxType ?? "TAXABLE"] ?? MAP[locale].TAXABLE;
}
