/**
 * accounting-export-core.ts — 会計連携（仕訳 CSV）の組み立て（純粋関数）。
 *
 * これまでの形: 弥生会計 Next 向けに、勘定科目を**日本語の科目名**（売掛金 /
 * 売上高 / 仮受消費税）で直書きし、列は 6 列固定だった（旧 lib/csv-export.ts）。
 * 移行先の会計ソフト（TKC FX4クラウド）は科目名ではなく**科目コード**で仕訳を
 * 受けるので、そのままでは 1 行も取り込めない。
 *
 * そこで「弥生を FX4 と書き換える」のではなく、**列の並びと文字コードを管理者が
 * 画面（SY0J 会計連携）で決められる**形にした。会計ソフトの受入レイアウト表が
 * 届いたら**設定値を入れるだけ**で済み、次に会計ソフトが替わってもコードは動かない。
 *
 * ★ **仕訳の作り方は旧実装から 1 ミリも変えていない。** 税率ごとの束につき
 *   「売上（税抜）行」＋「消費税行」、0 円の行は出さない、率を摘要に書くのは
 *   混在しているときだけ、`taxAmount` のみ / 非課税のフォールバックも同じ。
 *   変わったのは**セルの中身が科目名からコードになった**ことと、**列の並びが
 *   設定で決まる**ことだけ。不変条件 **Σ借方金額 = 税込合計** は維持する。
 *
 * DB も server-only も参照しないので単体テストできる。読み書きは
 * `accounting-settings.ts`、文字コードは `accounting-encode.ts`、
 * ダウンロードは `app/api/export/accounting/route.ts`、画面は `/settings/accounting`。
 */

import { z } from "zod";
import { documentFormatters } from "./format";
import { roundYen } from "./money";

// ───────────────────────────────────────────────────────────────────────────
// 出力できる項目の語彙
// ───────────────────────────────────────────────────────────────────────────

/**
 * 1 列に出せる項目。**設定はこの中からしか選べない。**
 *
 * 自由なテンプレート文字列にしないのは、会計ソフトが受けるのは決まった意味の
 * 欄の並びであって自由文ではないから。語彙にしておくと、設定画面が
 * ドロップダウンで済み、綴り間違いが保存の時点で落ちる。
 */
export const ACCOUNTING_FIELD_IDS = [
  // 日付
  "date",
  "dateYear",
  "dateMonth",
  "dateDay",
  // 伝票
  "slipNo",
  "rowIndex",
  "voucherNo",
  // 借方（常に売掛金側）
  "debitAccountCode",
  "debitSubCode",
  "debitDeptCode",
  "debitTaxCode",
  "debitAmount",
  // 貸方（売上高 / 仮受消費税）
  "creditAccountCode",
  "creditSubCode",
  "creditDeptCode",
  "creditTaxCode",
  "creditAmount",
  // その他
  "taxRatePercent",
  "memo",
  "invoiceNumber",
  "customerCode",
  "customerName",
  "constant",
  "empty",
] as const;

export type AccountingField = (typeof ACCOUNTING_FIELD_IDS)[number];

/** 出力 CSV の 1 列。 */
export interface AccountingColumn {
  /** 並べ替え用の安定した id（設定画面が振る）。 */
  id: string;
  field: AccountingField;
  /** ヘッダ行に出す見出し。ヘッダ行を出さない設定なら使われない。 */
  header: string;
  /** `field === "constant"` のときだけ意味を持つ固定文字列。 */
  constant?: string;
}

export type AccountingEncoding = "utf8-bom" | "utf8" | "shift_jis";
export type AccountingNewline = "crlf" | "lf";
export type AccountingDateFormat =
  | "YYYY/MM/DD"
  | "YYYYMMDD"
  | "YYYY-MM-DD"
  | "YY/MM/DD";
export type AccountingQuoteMode = "minimal" | "all" | "all-text";
export type AccountingAmountStyle = "plain" | "grouped";

/** 税率ごとの消費税コードの既定（マスタ側が空のときに使う）。 */
export interface AccountingTaxCodeRule {
  /** 0.1 = 10%。 */
  taxRate: number;
  debitTaxCode: string;
  creditTaxCode: string;
}

export interface AccountingAccounts {
  /** 売掛金（借方）。 */
  receivableAccountCode: string;
  /** 売上高（貸方・売上行）。 */
  salesAccountCode: string;
  /** 仮受消費税（貸方・消費税行）。 */
  taxAccountCode: string;
  /** 部門コード。顧客側に入っていればそちらが勝つ。 */
  deptCode: string;
  /** 上のどれにも当たらなかったときの消費税コード。 */
  taxCode: string;
}

export interface AccountingExportSettings {
  columns: AccountingColumn[];
  headerRow: boolean;
  encoding: AccountingEncoding;
  newline: AccountingNewline;
  dateFormat: AccountingDateFormat;
  quoteMode: AccountingQuoteMode;
  amountStyle: AccountingAmountStyle;
  /** ファイル名の接尾辞 `<INV番号>_<suffix>.csv`。 */
  filenameSuffix: string;
  accounts: AccountingAccounts;
  taxCodeRules: AccountingTaxCodeRule[];
}

/**
 * 既定の設定。
 *
 * ★ **これはまだ会計ソフトの正式な受入レイアウトではない。** 受入レイアウト表が
 *   手元に無い段階で決めた「科目コードで出す一般的な形」で、実物が届いたら
 *   SY0J の画面から列と既定コードを入れ替える（コードの変更は要らない）。
 *   科目コードを空にしてあるのも同じ理由 — 経理が決める値で、環境ごとに違う。
 */
export const DEFAULT_ACCOUNTING_EXPORT_SETTINGS: AccountingExportSettings = {
  columns: [
    { id: "c1", field: "date", header: "伝票日付" },
    { id: "c2", field: "debitAccountCode", header: "借方科目コード" },
    { id: "c3", field: "debitSubCode", header: "借方補助科目" },
    { id: "c4", field: "debitDeptCode", header: "借方部門" },
    { id: "c5", field: "debitTaxCode", header: "借方消費税" },
    { id: "c6", field: "debitAmount", header: "借方金額" },
    { id: "c7", field: "creditAccountCode", header: "貸方科目コード" },
    { id: "c8", field: "creditSubCode", header: "貸方補助科目" },
    { id: "c9", field: "creditDeptCode", header: "貸方部門" },
    { id: "c10", field: "creditTaxCode", header: "貸方消費税" },
    { id: "c11", field: "creditAmount", header: "貸方金額" },
    { id: "c12", field: "memo", header: "摘要" },
    { id: "c13", field: "voucherNo", header: "証憑番号" },
  ],
  headerRow: true,
  // BOM 付き UTF-8 が既定。Excel で開いても化けず、受入が Shift_JIS 指定なら
  // 画面から切り替える（変換は accounting-encode.ts）。
  encoding: "utf8-bom",
  newline: "crlf",
  dateFormat: "YYYY/MM/DD",
  quoteMode: "minimal",
  amountStyle: "plain",
  filenameSuffix: "accounting",
  accounts: {
    receivableAccountCode: "",
    salesAccountCode: "",
    taxAccountCode: "",
    deptCode: "",
    taxCode: "",
  },
  taxCodeRules: [],
};

const columnSchema = z
  .object({
    id: z.string().min(1),
    field: z.enum(ACCOUNTING_FIELD_IDS),
    header: z.string(),
    constant: z.string().optional(),
  })
  .refine((c) => c.field !== "constant" || (c.constant ?? "") !== "", {
    // 固定文字列の列で中身が空だと、ただの空列と見分けが付かない。
    path: ["constant"],
    message: "constant",
  });

export const accountingExportSettingsSchema = z.object({
  // 列が 0 本の CSV は作れない。設定画面が全部消せてしまわないようにここで止める。
  columns: z.array(columnSchema).min(1).max(64),
  headerRow: z.boolean(),
  encoding: z.enum(["utf8-bom", "utf8", "shift_jis"]),
  newline: z.enum(["crlf", "lf"]),
  dateFormat: z.enum(["YYYY/MM/DD", "YYYYMMDD", "YYYY-MM-DD", "YY/MM/DD"]),
  quoteMode: z.enum(["minimal", "all", "all-text"]),
  amountStyle: z.enum(["plain", "grouped"]),
  filenameSuffix: z
    .string()
    .min(1)
    .max(32)
    // ファイル名に入るので、区切り文字やパスになる文字は通さない。
    .regex(/^[A-Za-z0-9._-]+$/),
  accounts: z.object({
    receivableAccountCode: z.string().max(16),
    salesAccountCode: z.string().max(16),
    taxAccountCode: z.string().max(16),
    deptCode: z.string().max(16),
    taxCode: z.string().max(16),
  }),
  taxCodeRules: z
    .array(
      z.object({
        taxRate: z.number().min(0).max(1),
        debitTaxCode: z.string().max(16),
        creditTaxCode: z.string().max(16),
      }),
    )
    .max(16),
});

// ───────────────────────────────────────────────────────────────────────────
// 入力
// ───────────────────────────────────────────────────────────────────────────

/** 税率 1 つ分の内訳。`taxableBase` はその率の対象となる税抜金額。 */
export interface TaxLineBreakdown {
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
  /** 税区分マスタの消費税コード。null/未指定 = 設定の既定に落ちる。 */
  taxCode?: string | null;
  /** 税区分マスタの売上高 科目コード。null/未指定 = 設定の既定に落ちる。 */
  salesAccountCode?: string | null;
  /** 税区分マスタの仮受消費税 科目コード。null/未指定 = 設定の既定に落ちる。 */
  taxAccountCode?: string | null;
  /**
   * この束の税区分が一意に定まらず、明細の区分がコードで**食い違っている**。
   *
   * `invoice_tax_summaries.tax_category_id` は「同じ率の区分が 2 つ以上あるとき」
   * に null になる。そのとき黙って設定の既定へ落とすと、**違う科目へ計上された
   * 仕訳**が出来上がる。あとから直すより出さないほうが安いので、呼び出し側
   * （ルート）はこれが立っている請求書のエクスポートを拒否する。
   */
  codeConflict?: boolean;
}

/** 請求書 1 件ぶんの入力（DB 非依存）。 */
export interface JournalInvoiceInput {
  /** 導出文書番号 INV-YYYYMM-NNNNN。 */
  invoiceNumber: string;
  /** 顧客名。 */
  customerName: string;
  /** 顧客コード（社内）。会計側の補助科目とは**別物**なので混同しない。 */
  customerCode?: string | null;
  /** 売掛金の科目コード（取引先マスタ）。null = 設定の既定。 */
  receivableAccountCode?: string | null;
  /** 売掛金の補助科目コード（取引先マスタ）。null = 空欄。 */
  receivableSubAccountCode?: string | null;
  /** 伝票番号に使う連番（請求書の seq）。 */
  slipNo?: number | null;
  /** 仕訳日付 = 発行日。ISO 文字列 or Date。 */
  date: string | Date;
  /** 税込総額（円）。 */
  totalAmount: number;
  /** 消費税額（円）。`taxLines` が無いときのフォールバックに使う。 */
  taxAmount?: number;
  /** 税率ごとの内訳（適格請求書の区分記載）。 */
  taxLines?: readonly TaxLineBreakdown[];
}

/** 仕訳 1 行（貸借同一行）。 */
export interface JournalRow {
  /** 売上行 or 消費税行。 */
  kind: "sales" | "tax";
  date: string | Date;
  taxRate: number;
  debit: JournalSide;
  credit: JournalSide;
  memo: string;
  voucherNo: string;
  invoiceNumber: string;
  customerCode: string;
  customerName: string;
  slipNo: string;
}

export interface JournalSide {
  accountCode: string;
  subCode: string;
  deptCode: string;
  taxCode: string;
  amount: number;
}

// ───────────────────────────────────────────────────────────────────────────
// 仕訳行の組み立て
// ───────────────────────────────────────────────────────────────────────────

/** 率（0.1）→ 表示用のパーセント文字列（"10"）。旧実装と同じ丸め。 */
function ratePercent(taxRate: number): string {
  return String(Number((taxRate * 100).toFixed(4)));
}

/** マスタ → 設定の既定 → 空欄、の順で最初に埋まっているものを返す。 */
function pick(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (c != null && c !== "") return c;
  }
  return "";
}

/** その率の消費税コード既定（設定の税率別ルール）。 */
function taxCodeRuleFor(
  settings: AccountingExportSettings,
  taxRate: number,
): AccountingTaxCodeRule | undefined {
  return settings.taxCodeRules.find((r) => r.taxRate === taxRate);
}

/**
 * 請求書 1 件 → 仕訳行。**列の並びには一切依存しない**（並びは renderCell 側）。
 *
 * ★ 不変条件: Σ debit.amount = 税込合計。崩れると会計側の取込がエラーになる。
 */
export function buildJournalRows(
  invoice: JournalInvoiceInput,
  settings: AccountingExportSettings,
): JournalRow[] {
  // 丸めは lib/money.ts の方針 1 本（請求書の作成時に既に整数円で確定して
  // いるので、ここは念のための同じ丸め = 値は動かない）。
  const amount = roundYen(invoice.totalAmount);
  const tax = roundYen(invoice.taxAmount ?? 0);
  const memoBase = `${invoice.invoiceNumber} ${invoice.customerName}`;
  const a = settings.accounts;

  const debitAccountCode = pick(
    invoice.receivableAccountCode,
    a.receivableAccountCode,
  );
  const debitSubCode = pick(invoice.receivableSubAccountCode);
  const deptCode = pick(a.deptCode);
  const customerCode = pick(invoice.customerCode);
  const slipNo = invoice.slipNo != null ? String(invoice.slipNo) : "";

  const rows: JournalRow[] = [];
  const push = (
    kind: "sales" | "tax",
    taxRate: number,
    creditAccountCode: string,
    creditTaxCode: string,
    debitTaxCode: string,
    value: number,
    memo: string,
  ) => {
    rows.push({
      kind,
      date: invoice.date,
      taxRate,
      debit: {
        accountCode: debitAccountCode,
        subCode: debitSubCode,
        deptCode,
        taxCode: debitTaxCode,
        amount: value,
      },
      credit: {
        accountCode: creditAccountCode,
        // 貸方（売上高 / 仮受消費税）の補助科目は持たない。得意先の補助科目は
        // 売掛金の下に付くものなので、貸方へ複写すると別の意味になる。
        subCode: "",
        deptCode,
        taxCode: creditTaxCode,
        amount: value,
      },
      memo,
      voucherNo: invoice.invoiceNumber,
      invoiceNumber: invoice.invoiceNumber,
      customerCode,
      customerName: invoice.customerName,
      slipNo,
    });
  };

  // 税率ごとの内訳があるときは率ごとに仕訳する。
  if (invoice.taxLines && invoice.taxLines.length > 0) {
    // 率を摘要に書くのは**混在しているときだけ**。1 率しか無い請求書に書き足すと、
    // 既存の請求書を書き出し直したときに摘要だけが変わる（金額も行数も同じなのに
    // 差分が出る）。混在していなければ従来と同じ摘要になるのが正しい。
    const mixed = invoice.taxLines.length > 1;
    for (const line of invoice.taxLines) {
      const base = roundYen(line.taxableBase);
      const lineTax = roundYen(line.taxAmount);
      const suffix = mixed ? ` ${ratePercent(line.taxRate)}%` : "";
      const rule = taxCodeRuleFor(settings, line.taxRate);
      const debitTaxCode = pick(rule?.debitTaxCode, a.taxCode);
      const creditTaxCode = pick(line.taxCode, rule?.creditTaxCode, a.taxCode);
      if (base !== 0) {
        push(
          "sales",
          line.taxRate,
          pick(line.salesAccountCode, a.salesAccountCode),
          creditTaxCode,
          debitTaxCode,
          base,
          `${memoBase}${suffix}`,
        );
      }
      if (lineTax !== 0) {
        push(
          "tax",
          line.taxRate,
          pick(line.taxAccountCode, a.taxAccountCode),
          creditTaxCode,
          debitTaxCode,
          lineTax,
          `${memoBase} 消費税${suffix.trim()}`,
        );
      }
    }
    return rows;
  }

  // 束が無い（税区分マスタ以前の）請求書 — ヘッダの税額から 2 行 / 1 行。
  const fallbackTaxCode = pick(a.taxCode);
  if (tax > 0) {
    push(
      "sales",
      0,
      pick(a.salesAccountCode),
      fallbackTaxCode,
      fallbackTaxCode,
      amount - tax,
      memoBase,
    );
    push(
      "tax",
      0,
      pick(a.taxAccountCode),
      fallbackTaxCode,
      fallbackTaxCode,
      tax,
      `${memoBase} 消費税`,
    );
  } else {
    push(
      "sales",
      0,
      pick(a.salesAccountCode),
      fallbackTaxCode,
      fallbackTaxCode,
      amount,
      memoBase,
    );
  }
  return rows;
}

// ───────────────────────────────────────────────────────────────────────────
// セルの描画
// ───────────────────────────────────────────────────────────────────────────

/**
 * ISO 文字列 / Date → **JST の暦日** `yyyy/mm/dd`。
 *
 * 帳票と同じ固定フォーマッタ（documentFormatters）を通す — ISO 文字列を切り出すと
 * UTC の日付になり、JST 0〜9 時の発行が前日の仕訳になる。ここで一度 JST の
 * 年月日にしてから、設定の書式へ組み直す（時間帯の処理を 2 つ持たない）。
 */
function jstParts(date: string | Date): {
  year: string;
  month: string;
  day: string;
} {
  const [year, month, day] = documentFormatters.date(date).split("/");
  return { year, month, day };
}

function formatDate(date: string | Date, format: AccountingDateFormat): string {
  const { year, month, day } = jstParts(date);
  switch (format) {
    case "YYYYMMDD":
      return `${year}${month}${day}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "YY/MM/DD":
      return `${year.slice(-2)}/${month}/${day}`;
    default:
      return `${year}/${month}/${day}`;
  }
}

/** 金額 — plain は数値のまま（CSV では裸）、grouped は 3 桁区切りの文字列。 */
function formatAmount(
  value: number,
  style: AccountingAmountStyle,
): string | number {
  return style === "grouped" ? value.toLocaleString("en-US") : value;
}

/**
 * 1 行 × 1 列 → セルの値。エスケープ前の生の値を返す。
 *
 * `rowIndex` は 1 起点（ファイル内の仕訳行の通し番号。ヘッダ行は数えない）。
 */
export function renderCell(
  row: JournalRow,
  rowIndex: number,
  column: AccountingColumn,
  settings: AccountingExportSettings,
): string | number {
  switch (column.field) {
    case "date":
      return formatDate(row.date, settings.dateFormat);
    case "dateYear":
      return jstParts(row.date).year;
    case "dateMonth":
      return jstParts(row.date).month;
    case "dateDay":
      return jstParts(row.date).day;
    case "slipNo":
      return row.slipNo;
    case "rowIndex":
      return rowIndex;
    case "voucherNo":
      return row.voucherNo;
    case "debitAccountCode":
      return row.debit.accountCode;
    case "debitSubCode":
      return row.debit.subCode;
    case "debitDeptCode":
      return row.debit.deptCode;
    case "debitTaxCode":
      return row.debit.taxCode;
    case "debitAmount":
      return formatAmount(row.debit.amount, settings.amountStyle);
    case "creditAccountCode":
      return row.credit.accountCode;
    case "creditSubCode":
      return row.credit.subCode;
    case "creditDeptCode":
      return row.credit.deptCode;
    case "creditTaxCode":
      return row.credit.taxCode;
    case "creditAmount":
      return formatAmount(row.credit.amount, settings.amountStyle);
    case "taxRatePercent":
      return ratePercent(row.taxRate);
    case "memo":
      return row.memo;
    case "invoiceNumber":
      return row.invoiceNumber;
    case "customerCode":
      return row.customerCode;
    case "customerName":
      return row.customerName;
    case "constant":
      return column.constant ?? "";
    case "empty":
      return "";
  }
}

/**
 * CSV フィールドのエスケープ — カンマ・引用符・改行を含む場合はダブルクォート。
 *
 * 先頭が = + - @ / タブ / CR のセルは Excel が数式として実行する（CSV
 * インジェクション）。取引先名は取引先マスタから来る文字列なので、先頭に
 * アポストロフィを置いて文字列に固定する。**数値は対象外** — 負の金額 `-100` を
 * `'-100` にすると仕訳が壊れる。
 */
export function csvField(
  value: string | number,
  quoteMode: AccountingQuoteMode = "minimal",
): string {
  if (typeof value === "number") {
    return quoteMode === "all" ? `"${value}"` : String(value);
  }
  const s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (quoteMode === "all" || quoteMode === "all-text") {
    return `"${s.replace(/"/g, '""')}"`;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 請求書 1 件 → 仕訳 CSV のテキスト。
 *
 * BOM と文字コードの変換は `accounting-encode.ts` が持つ（ここは文字列だけ）。
 */
export function buildAccountingCsvText(
  invoice: JournalInvoiceInput,
  settings: AccountingExportSettings,
): string {
  const rows = buildJournalRows(invoice, settings);
  const eol = settings.newline === "lf" ? "\n" : "\r\n";
  const lines: string[] = [];
  if (settings.headerRow) {
    lines.push(
      settings.columns
        .map((c) => csvField(c.header, settings.quoteMode))
        .join(","),
    );
  }
  rows.forEach((row, i) => {
    lines.push(
      settings.columns
        .map((c) =>
          csvField(renderCell(row, i + 1, c, settings), settings.quoteMode),
        )
        .join(","),
    );
  });
  return `${lines.join(eol)}${eol}`;
}

/**
 * 科目が一意に決まらない束を持っているか（あればエクスポートを拒否する）。
 *
 * 呼び出し側でメッセージを組み立てられるよう、該当する率を返す。
 */
export function conflictingTaxRates(
  invoice: Pick<JournalInvoiceInput, "taxLines">,
): number[] {
  return (invoice.taxLines ?? [])
    .filter((l) => l.codeConflict)
    .map((l) => l.taxRate);
}
