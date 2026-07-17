/**
 * operation-codes.ts — 操作コード（画面番号）レジストリ
 *
 * 形式: `{CAT}{MODE}{IDX}` — 英字2文字 + モード1文字 + インデックス1文字（固定4文字）
 *   CAT  : カテゴリ（CM/SA/PU/PD/SH/BL/MS）
 *   MODE : 0=一覧 / 1=新規 / 2=詳細（IDなし→検索）
 *   IDX  : 1–9、10件超は A–Z（最大35件 + 予約スロット 0）
 *
 * 改訂版: `{CAT}{MODE}{IDX}N`（5文字・将来）
 *
 * Canonical source — `_specs/operation-code.md` と同期すること。
 */

import type { AppCategory } from "./app-list";

export type OperationCodeKind = "list" | "new" | "detail";

/** 現行操作コードは4文字 */
export const OPERATION_CODE_LENGTH = 4;

/** 改訂版サフィックス（5文字目） */
export const OPERATION_CODE_UPDATE_SUFFIX = "N";

/** カテゴリ接頭辞（英字2文字） */
export const OPERATION_CODE_PREFIX = {
  common: "CM",
  sales: "SA",
  purchase: "PU",
  production: "PD",
  shipping: "SH",
  billing: "BL",
  master: "MS",
  system: "SY",
} as const;

/** 画面モード（3文字目） */
export const OPERATION_MODE = {
  list: "0",
  new: "1",
  detail: "2",
} as const;

const KIND_FROM_MODE: Record<string, OperationCodeKind> = {
  "0": "list",
  "1": "new",
  "2": "detail",
};

/** 4文字コード: 英字2 + モード数字1 + IDX (0–9 or A–Z)。改訂版は末尾 N。 */
export const OPERATION_CODE_PATTERN = /^[A-Z]{2}[0-9][0-9A-Z](?:N)?$/;

export interface OperationCodeEntry {
  code: string;
  label: string;
  href: string;
  category: AppCategory | "共通";
  kind: OperationCodeKind;
  /** カテゴリ接頭辞（2文字） */
  categoryCode: string;
  /** モード文字（1文字） */
  mode: string;
  /** インデックス文字（1文字） */
  index: string;
}

/**
 * 1つの画面リソースに紐づく list/new/detail コードをまとめて生成するヘルパー。
 * 詳細モード（kind=detail）でIDが指定されない場合の遷移先は `${basePath}/_search`。
 */
function makeResource(
  category: OperationCodeEntry["category"],
  categoryCode: string,
  index: string,
  label: string,
  basePath: string,
): OperationCodeEntry[] {
  const make = (
    mode: string,
    kind: OperationCodeKind,
    labelSuffix: string,
    href: string,
  ): OperationCodeEntry => ({
    code: `${categoryCode}${mode}${index}`,
    label: `${label}${labelSuffix}`,
    href,
    category,
    kind,
    categoryCode,
    mode,
    index,
  });

  return [
    make(OPERATION_MODE.list, "list", "", basePath),
    make(OPERATION_MODE.new, "new", " 新規", `${basePath}/new`),
    make(OPERATION_MODE.detail, "detail", " 詳細", `${basePath}/_search`),
  ];
}

/** 操作コード → 画面の完全レジストリ */
export const OPERATION_CODES: OperationCodeEntry[] = [
  // ─── 共通 ────────────────────────────────────────────────────────────────
  {
    code: "CM00",
    label: "ダッシュボード",
    href: "/",
    category: "共通",
    kind: "list",
    categoryCode: "CM",
    mode: "0",
    index: "0",
  },

  // ─── 販売 (SA) ───────────────────────────────────────────────────────────
  ...makeResource("販売", "SA", "1", "価格表", "/sales/price-lists"),
  ...makeResource("販売", "SA", "2", "見積書", "/sales/quotes"),
  ...makeResource("販売", "SA", "3", "受注請書", "/sales/order-acceptances"),
  ...makeResource("販売", "SA", "4", "設計依頼書", "/sales/design-requests"),
  ...makeResource("販売", "SA", "5", "試算", "/sales/trial-estimates"),

  // ─── 購買 (PU) ───────────────────────────────────────────────────────────
  ...makeResource("購買", "PU", "1", "素材入荷", "/purchase/material-receipts"),
  ...makeResource("購買", "PU", "2", "外注依頼", "/purchase/outsource-orders"),
  ...makeResource("購買", "PU", "3", "素材発注書", "/purchase/purchase-orders"),
  // 発注書の前段（業務フロー上は PU03 より先）— コードは追加順で PU04
  ...makeResource("購買", "PU", "4", "購買依頼", "/purchase/purchase-requests"),

  // ─── 生産 (PD) ───────────────────────────────────────────────────────────
  // PD22 詳細（ID無し→検索）が旧 PD20 工程実行 のエントリポイントを兼ねる
  ...makeResource("生産", "PD", "2", "指示書", "/production/work-orders"),
  ...makeResource("生産", "PD", "3", "承認管理", "/production/approvals"),
  ...makeResource(
    "生産",
    "PD",
    "4",
    "製品在庫",
    "/production/inventory/products",
  ),
  ...makeResource(
    "生産",
    "PD",
    "5",
    "素材在庫",
    "/production/inventory/materials",
  ),

  // ─── 出荷 (SH) ───────────────────────────────────────────────────────────
  ...makeResource("出荷", "SH", "1", "出荷書", "/shipping/shipping-orders"),
  ...makeResource("出荷", "SH", "2", "納品書", "/shipping/delivery-notes"),

  // ─── 請求 (BL) ───────────────────────────────────────────────────────────
  ...makeResource("請求", "BL", "1", "請求書", "/billing/invoices"),
  ...makeResource("請求", "BL", "2", "締日処理", "/billing/closings"),

  // ─── マスタ (MS) ─────────────────────────────────────────────────────────
  // 10件目（承認グループ）は IDX に英字 A を使用
  ...makeResource("マスタ", "MS", "1", "顧客", "/master/customers"),
  ...makeResource("マスタ", "MS", "2", "最終需要家", "/master/end-users"),
  ...makeResource("マスタ", "MS", "3", "製品", "/master/products"),
  ...makeResource("マスタ", "MS", "4", "材種", "/master/material-types"),
  ...makeResource("マスタ", "MS", "5", "素材", "/master/materials"),
  ...makeResource("マスタ", "MS", "6", "外注企業", "/master/suppliers"),
  ...makeResource("マスタ", "MS", "7", "工程マスタ", "/master/process-steps"),
  ...makeResource(
    "マスタ",
    "MS",
    "8",
    "検査表テンプレート",
    "/master/inspection-templates",
  ),
  ...makeResource("マスタ", "MS", "9", "不良種類", "/master/defect-types"),
  ...makeResource(
    "マスタ",
    "MS",
    "A",
    "承認グループ",
    "/master/approval-groups",
  ),
  ...makeResource("マスタ", "MS", "B", "工場", "/master/factories"),
  // 採番構成は単一管理画面（タブ + モーダル）— list コードのみ
  {
    code: "MS0C",
    label: "採番構成",
    href: "/master/material-numbering",
    category: "マスタ",
    kind: "list",
    categoryCode: "MS",
    mode: "0",
    index: "C",
  },

  // ─── システム (SY) ───────────────────────────────────────────────────────
  // システム設定ハブ（アプリ設定・システム管理）— 単一画面, list コードのみ
  {
    code: "SY01",
    label: "システム設定",
    href: "/settings",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "1",
  },
];

const CODE_LOOKUP = new Map(
  OPERATION_CODES.map((entry) => [entry.code.toUpperCase(), entry]),
);

const MAX_INPUT_LENGTH =
  OPERATION_CODE_LENGTH + OPERATION_CODE_UPDATE_SUFFIX.length;

function lookupCode(input: string): OperationCodeEntry | undefined {
  return CODE_LOOKUP.get(input.toUpperCase());
}

/** 英数字のみ。大文字。4文字または改訂版5文字（末尾 N） */
export function sanitizeOperationCodeInput(input: string): string {
  const upper = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_INPUT_LENGTH);
  if (
    upper.length > OPERATION_CODE_LENGTH &&
    !upper.endsWith(OPERATION_CODE_UPDATE_SUFFIX)
  ) {
    return upper.slice(0, OPERATION_CODE_LENGTH);
  }
  return upper;
}

export function isValidOperationCodeFormat(code: string): boolean {
  return (
    (code.length === OPERATION_CODE_LENGTH ||
      code.length === MAX_INPUT_LENGTH) &&
    OPERATION_CODE_PATTERN.test(code.toUpperCase())
  );
}

/** 画面表示用コード */
export function formatOperationCodeDisplay(entry: OperationCodeEntry): string {
  return entry.code;
}

/** 4文字コードを {CAT, MODE, IDX} に分解。改訂版サフィックスは無視 */
function parseCode(
  code: string,
): { categoryCode: string; mode: string; index: string } | null {
  const upper = code.toUpperCase();
  if (
    upper.length !== OPERATION_CODE_LENGTH &&
    upper.length !== MAX_INPUT_LENGTH
  )
    return null;
  if (!OPERATION_CODE_PATTERN.test(upper)) return null;
  return {
    categoryCode: upper.slice(0, 2),
    mode: upper.slice(2, 3),
    index: upper.slice(3, 4),
  };
}

/** モード桁を差し替えて派生コードを生成 */
function withMode(code: string, mode: string): string | null {
  const parts = parseCode(code);
  if (!parts) return null;
  return `${parts.categoryCode}${mode}${parts.index}`;
}

/** 任意のモードのコード → 一覧コード（`0X`） */
export function toListOperationCode(code: string): string | null {
  return withMode(code, OPERATION_MODE.list);
}

/** 任意のモードのコード → 新規コード（`1X`） */
export function toNewOperationCode(code: string): string | null {
  return withMode(code, OPERATION_MODE.new);
}

/**
 * 任意のモードのコード → 詳細コード（`2X`）
 *
 * `id` を渡した場合は、解決した Entry の href に `/${id}` を結合した URL も返す。
 * id 無しの場合は検索画面（`{basePath}/_search`）が遷移先となる。
 */
export function toDetailOperationCode(
  code: string,
  id?: string,
): string | { code: string; href: string } | null {
  const detailCode = withMode(code, OPERATION_MODE.detail);
  if (!detailCode) return null;
  if (id === undefined) return detailCode;

  const entry = lookupCode(detailCode);
  if (!entry) return detailCode;

  // 検索画面 href から basePath を復元して `${basePath}/${id}` を返す
  const basePath = entry.href.replace(/\/_search$/, "");
  return { code: detailCode, href: `${basePath}/${encodeURIComponent(id)}` };
}

/** 現行コードから改訂版コードを導出（例: PD02 → PD02N）— 将来登録用 */
export function toUpdatedOperationCode(baseCode: string): string | null {
  const upper = baseCode.toUpperCase();
  if (
    upper.length !== OPERATION_CODE_LENGTH ||
    upper.endsWith(OPERATION_CODE_UPDATE_SUFFIX)
  ) {
    return null;
  }
  return `${upper}${OPERATION_CODE_UPDATE_SUFFIX}`;
}

/** 入力を操作コード文字列に正規化（完全一致のみ） */
export function normalizeOperationCodeInput(input: string): string | null {
  const cleaned = sanitizeOperationCodeInput(input.trim());
  if (!isValidOperationCodeFormat(cleaned)) return null;
  return lookupCode(cleaned)?.code ?? null;
}

/** 操作コードから画面定義を取得 */
export function resolveOperationCode(input: string): OperationCodeEntry | null {
  const cleaned = sanitizeOperationCodeInput(input.trim());
  if (!cleaned) return null;
  return lookupCode(cleaned) ?? null;
}

/** 一覧画面の href に対応する操作コード */
export function getListOperationCode(href: string): string | null {
  const entry = OPERATION_CODES.find(
    (e) => e.kind === "list" && e.href === href,
  );
  return entry?.code ?? null;
}

/** コード・ラベルで操作コードを検索（オートコンプリート用） */
export function searchOperationCodes(
  query: string,
  limit = 8,
): OperationCodeEntry[] {
  const q = query.trim();
  if (!q) return [];

  const cleaned = sanitizeOperationCodeInput(q);
  const lower = q.toLowerCase();

  return OPERATION_CODES.filter((entry) => {
    const codeUpper = entry.code.toUpperCase();
    const cleanedUpper = cleaned.toUpperCase();
    if (cleanedUpper && codeUpper.startsWith(cleanedUpper)) return true;
    if (entry.label.toLowerCase().includes(lower)) return true;
    if (
      entry.category !== "共通" &&
      entry.category.toLowerCase().includes(lower)
    )
      return true;
    return false;
  }).slice(0, limit);
}

export interface NavigateByOperationCodeOptions {
  onNavigate?: (href: string) => void;
  router?: { push: (href: string) => void };
}

/**
 * 操作コードで画面へ遷移。見つからなければ null
 *
 * 詳細モード（`2X`）は ID 無しの場合 `{basePath}/_search` へ遷移する。
 * Entry.href は登録時にそのように設定されている。
 */
export function navigateByOperationCode(
  input: string,
  options?: NavigateByOperationCodeOptions,
): OperationCodeEntry | null {
  const entry = resolveOperationCode(input);
  if (!entry) return null;

  if (options?.onNavigate) {
    options.onNavigate(entry.href);
  } else if (options?.router) {
    options.router.push(entry.href);
  } else if (typeof window !== "undefined") {
    window.location.assign(entry.href);
  }

  return entry;
}

// 内部用エクスポート（テスト用）
export { KIND_FROM_MODE };
