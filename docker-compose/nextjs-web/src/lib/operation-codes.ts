/**
 * operation-codes.ts — 操作コード（画面番号）レジストリ
 *
 * 形式: `{CAT}{MODE}{IDX}` — 英字2文字 + モード1文字 + インデックス1文字（固定4文字）
 *   CAT  : カテゴリ（CM/SA/PU/PD/SH/BL/MS/DC/SY）
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
  documents: "DC",
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
  // 業務フロー順: 試算 → 価格表 → 見積書 → 注文請書（設計依頼書は並行フロー）
  ...makeResource("販売", "SA", "1", "試算", "/sales/trial-estimates"),
  ...makeResource("販売", "SA", "2", "価格表", "/sales/price-lists"),
  ...makeResource("販売", "SA", "3", "見積書", "/sales/quotes"),
  ...makeResource("販売", "SA", "4", "注文請書", "/sales/order-acceptances"),
  // 注文明細は新規・編集画面を持たない（作成は注文請書の明細エディタ）ので
  // makeResource ではなく一覧・詳細だけを個別登録する。
  {
    code: "SA05",
    label: "注文明細",
    href: "/sales/order-lines",
    category: "販売",
    kind: "list",
    categoryCode: "SA",
    mode: OPERATION_MODE.list,
    index: "5",
  },
  {
    code: "SA25",
    label: "注文明細 詳細",
    href: "/sales/order-lines/_search",
    category: "販売",
    kind: "detail",
    categoryCode: "SA",
    mode: OPERATION_MODE.detail,
    index: "5",
  },
  ...makeResource("販売", "SA", "6", "設計依頼書", "/sales/design-requests"),

  // ─── 購買 (PU) ───────────────────────────────────────────────────────────
  // 業務フロー順: 購買依頼 → 素材発注書 → 素材入荷（外注依頼は工程外注の別フロー）
  ...makeResource("購買", "PU", "1", "購買依頼", "/purchase/purchase-requests"),
  ...makeResource("購買", "PU", "2", "素材発注書", "/purchase/purchase-orders"),
  ...makeResource("購買", "PU", "3", "素材入荷", "/purchase/material-receipts"),
  ...makeResource("購買", "PU", "4", "外注依頼", "/purchase/outsource-orders"),

  // ─── 生産 (PD) ───────────────────────────────────────────────────────────
  // 業務フロー順: 指示書 → 承認管理 → 在庫管理。
  // 注文明細は販売カテゴリ (SA05) へ移設したため PD01/PD11/PD21 は欠番。
  // PD22 詳細（ID無し→検索）が旧 PD20 工程実行 のエントリポイントを兼ねる
  ...makeResource("生産", "PD", "2", "指示書", "/production/work-orders"),
  ...makeResource("生産", "PD", "3", "承認管理", "/production/approvals"),
  // 在庫管理 — 製品・素材・仕掛品・ロケーションの統合単一画面, list コードのみ
  // （旧 PD04 製品在庫 / PD05 素材在庫 は本画面へ統合）
  {
    code: "PD04",
    label: "在庫管理",
    href: "/production/inventory",
    category: "生産",
    kind: "list",
    categoryCode: "PD",
    mode: "0",
    index: "4",
  },

  // ─── 出荷 (SH) ───────────────────────────────────────────────────────────
  ...makeResource("出荷", "SH", "1", "出荷書", "/shipping/shipping-orders"),
  ...makeResource("出荷", "SH", "2", "納品書", "/shipping/delivery-notes"),

  // ─── 請求 (BL) ───────────────────────────────────────────────────────────
  ...makeResource("請求", "BL", "1", "請求書", "/billing/invoices"),
  ...makeResource("請求", "BL", "2", "締日処理", "/billing/closings"),

  // ─── マスタ (MS) ─────────────────────────────────────────────────────────
  // グループ順: 取引先系 (01–03) → 製品・素材系 (04–07) → 製造定義系 (08–0A)
  //           → 組織・拠点系 (0B–0E)。10件目以降は IDX に英字 A– を使用。
  // 旧 顧客(MS01) / 最終需要家(MS02) / 外注企業(MS03) は取引先マスタへ統合。
  // MS02・MS03 は欠番（他マスタの番号を動かさないため再利用しない）。
  ...makeResource("マスタ", "MS", "1", "取引先", "/master/business-partners"),
  ...makeResource("マスタ", "MS", "4", "製品", "/master/products"),
  ...makeResource("マスタ", "MS", "5", "材種", "/master/material-types"),
  ...makeResource("マスタ", "MS", "6", "素材", "/master/materials"),
  // 採番構成は単一管理画面（タブ + モーダル）— list コードのみ
  {
    code: "MS07",
    label: "採番構成",
    href: "/master/material-numbering",
    category: "マスタ",
    kind: "list",
    categoryCode: "MS",
    mode: "0",
    index: "7",
  },
  ...makeResource("マスタ", "MS", "8", "工程マスタ", "/master/process-steps"),
  ...makeResource(
    "マスタ",
    "MS",
    "9",
    "検査表テンプレート",
    "/master/inspection-templates",
  ),
  ...makeResource("マスタ", "MS", "A", "不良種類", "/master/defect-types"),
  ...makeResource("マスタ", "MS", "B", "承認設定", "/master/approval-settings"),
  ...makeResource("マスタ", "MS", "C", "拠点", "/master/plants"),
  // 作業場所は単一管理画面（グループカード + モーダル）— list コードのみ
  {
    code: "MS0D",
    label: "作業場所",
    href: "/master/work-locations",
    category: "マスタ",
    kind: "list",
    categoryCode: "MS",
    mode: "0",
    index: "D",
  },
  // 保管場所は単一管理画面（一覧 + 拠点選択で管理パネル）— list コードのみ
  {
    code: "MS0E",
    label: "保管場所",
    href: "/master/storage-locations",
    category: "マスタ",
    kind: "list",
    categoryCode: "MS",
    mode: "0",
    index: "E",
  },

  // ─── ドキュメント (DC) ───────────────────────────────────────────────────
  // マニュアル（/manual・fumadocs）— 単一画面, list コードのみ（旧 SY03）
  {
    code: "DC01",
    label: "マニュアル",
    href: "/manual/ja",
    category: "ドキュメント",
    kind: "list",
    categoryCode: "DC",
    mode: "0",
    index: "1",
  },
  // 社内ドキュメント（要ログイン + internal_docs 権限）— 単一画面, list コードのみ
  {
    code: "DC02",
    label: "社内ドキュメント",
    href: "/internal-docs/ja",
    category: "ドキュメント",
    kind: "list",
    categoryCode: "DC",
    mode: "0",
    index: "2",
  },

  // ─── システム (SY) ───────────────────────────────────────────────────────
  // 採番: SY01 = ユーザー管理、SY02–SY04 = アプリ設定、SY05– = 管理系。
  // （旧 SY01 システム設定ハブは廃止。）いずれも単一画面, list コードのみ。
  {
    code: "SY01",
    label: "ユーザー管理",
    href: "/settings/users",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "1",
  },
  // 試算計算（計算基準・カスタム入力・カスタム計算）
  {
    code: "SY02",
    label: "試算計算",
    href: "/settings/trial-pricing-engine",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "2",
  },
  // 製品項目（項目定義ライブラリ）— 旧 SY04
  {
    code: "SY03",
    label: "製品項目",
    href: "/settings/product-items",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "3",
  },
  // 製品種別（項目を割り当てるテンプレート）— 旧 SY05
  {
    code: "SY04",
    label: "製品種別",
    href: "/settings/product-types",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "4",
  },
  // アプリ管理（環境別 表示 ON/OFF, feature_flags）
  {
    code: "SY05",
    label: "アプリ管理",
    href: "/settings/apps",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "5",
  },
  // ファイル管理（SeaweedFS の一覧・削除）
  {
    code: "SY06",
    label: "ファイル管理",
    href: "/settings/files",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "6",
  },
  // 操作履歴（監査ログ before/after）
  {
    code: "SY07",
    label: "操作履歴",
    href: "/settings/activity",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "7",
  },
  // QRカード管理（キオスクログイン用カードの発行・割当・印刷）
  {
    code: "SY08",
    label: "QRカード管理",
    href: "/settings/kiosk-cards",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "8",
  },
  // 端末管理（キオスク端末の有効化・フロアマップ配置）
  {
    code: "SY09",
    label: "端末管理",
    href: "/settings/kiosk-devices",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "9",
  },
  // キオスク設定（ランチャーのアプリ表示 + 認証ポリシー参照）
  {
    code: "SY0A",
    label: "キオスク設定",
    href: "/settings/kiosk",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "A",
  },
  // リンク管理（メモ / コメント内の外部リンク索引 + ブロック指定）
  {
    code: "SY0B",
    label: "リンク管理",
    href: "/settings/links",
    category: "システム",
    kind: "list",
    categoryCode: "SY",
    mode: "0",
    index: "B",
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
