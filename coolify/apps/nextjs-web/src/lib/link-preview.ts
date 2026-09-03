/**
 * link-preview.ts — アプリ URL → プレビュー対象の解決（pure・unit test 対象）。
 *
 * Nextcloud 等の外部ツールに貼られたアプリ URL から「何の画面か」を解決し、
 * RBAC 判定に使う permission_code（user_permissions view の列）を返す。
 * リッチ内容の取得と権限チェックは /api/preview/resolve（server）側で行う —
 * ここは URL 解析と表示ラベルのみで DB に触れない。
 *
 * permission_code は `permissions.code`（shared-db/sql/rbac-seed.sql）と
 * 1 対 1 で持つ — 以前はセクション名（"sales" 等）から一括で引いていたが、
 * "sales" は実在しない permission_code で、この経路のリッチプレビューは
 * 常に権限なし扱いになっていた（価格試算/価格表/見積書の 3 種すべてが対象）。
 * コードは `lib/app-list.ts` の `requiredPermission` と同じ値を使うこと。
 *
 * ラベルは ja 固定 — 呼び出し元（外部ツールへ埋め込むリッチプレビュー）には
 * 「これを見ている人」の言語設定を引ける request-scope が無い。
 */

import { type DocKey, parseDocKey } from "@/lib/doc-number";

/** 文書（(year_month, seq) 複合キーで持つテーブル）プレビュー対象。 */
export interface DocPreviewTarget {
  kind:
    | "trial-estimate"
    | "price-list"
    | "quote"
    | "order-acceptance"
    | "work-order"
    | "delivery-order"
    | "delivery-note"
    | "invoice";
  /** user_permissions.permission_code（READ を要求）。 */
  permissionCode: string;
  /** 文書種別の表示ラベル（ja）。 */
  label: string;
  docNumber: string;
  docKey: DocKey;
}

/**
 * 採番番号を列にそのまま保存するテーブル（po_number / request_number 等）の
 * プレビュー対象。番号の書式は DocPreviewTarget と同じだが、行の照会は
 * (year_month, seq) の複合キーではなく番号列そのもので行う。
 */
export interface NumberedPreviewTarget {
  kind: "purchase-order" | "purchase-request" | "design-request";
  permissionCode: string;
  label: string;
  docNumber: string;
}

/** マスタ（内部 int id URL）プレビュー対象。 */
export interface MasterPreviewTarget {
  kind: "material-type" | "material" | "product";
  permissionCode: string;
  label: string;
  id: number;
}

export type PreviewTarget =
  | DocPreviewTarget
  | NumberedPreviewTarget
  | MasterPreviewTarget;

const DOC_ROUTES: Record<
  string,
  {
    kind: DocPreviewTarget["kind"];
    prefix: "EST" | "PRC" | "QOT" | "ORD" | "WOR" | "DOR" | "DRN" | "INV";
    label: string;
    permissionCode: string;
  }
> = {
  "sales/trial-estimates": {
    kind: "trial-estimate",
    prefix: "EST",
    label: "価格試算", // i18n-ignore
    permissionCode: "price_list",
  },
  "sales/price-lists": {
    kind: "price-list",
    prefix: "PRC",
    label: "価格表", // i18n-ignore
    permissionCode: "price_list",
  },
  "sales/quotes": {
    kind: "quote",
    prefix: "QOT",
    label: "見積書", // i18n-ignore
    permissionCode: "quote",
  },
  "sales/order-acceptances": {
    kind: "order-acceptance",
    prefix: "ORD",
    label: "注文請書", // i18n-ignore
    permissionCode: "order_acceptance",
  },
  "production/work-orders": {
    kind: "work-order",
    prefix: "WOR",
    label: "指示書", // i18n-ignore
    permissionCode: "work_order",
  },
  "shipping/delivery-orders": {
    kind: "delivery-order",
    prefix: "DOR",
    label: "出荷書", // i18n-ignore
    permissionCode: "delivery_order",
  },
  "shipping/delivery-notes": {
    kind: "delivery-note",
    prefix: "DRN",
    label: "納品書", // i18n-ignore
    permissionCode: "delivery_note",
  },
  "billing/invoices": {
    kind: "invoice",
    prefix: "INV",
    label: "請求書", // i18n-ignore
    permissionCode: "invoice",
  },
};

const NUMBER_ROUTES: Record<
  string,
  {
    kind: NumberedPreviewTarget["kind"];
    prefix: "PO" | "PRQ" | "DSG";
    label: string;
    permissionCode: string;
  }
> = {
  "purchase/purchase-orders": {
    kind: "purchase-order",
    prefix: "PO",
    label: "素材発注書", // i18n-ignore
    permissionCode: "purchase_order",
  },
  "purchase/purchase-requests": {
    kind: "purchase-request",
    prefix: "PRQ",
    label: "購買依頼", // i18n-ignore
    permissionCode: "purchase_order",
  },
  "sales/design-requests": {
    kind: "design-request",
    prefix: "DSG",
    label: "設計依頼書", // i18n-ignore
    permissionCode: "design_request",
  },
};

const MASTER_ROUTES: Record<
  string,
  { kind: MasterPreviewTarget["kind"]; label: string; permissionCode: string }
> = {
  "master/material-types": {
    kind: "material-type",
    label: "材種", // i18n-ignore
    permissionCode: "master",
  },
  "master/materials": {
    kind: "material",
    label: "素材", // i18n-ignore
    permissionCode: "master",
  },
  "master/products": {
    kind: "product",
    label: "製品", // i18n-ignore
    permissionCode: "master",
  },
};

/**
 * アプリ URL（絶対 or パスのみ）→ プレビュー対象。対象外の URL は null。
 * ホストは検証しない（Nextcloud 側 provider が対象ホストを絞る）。
 */
export function resolvePreviewTarget(url: string): PreviewTarget | null {
  let pathname: string;
  try {
    pathname = url.startsWith("/") ? url : new URL(url).pathname;
  } catch {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length !== 3) return null;
  const route = `${segments[0]}/${segments[1]}`;
  const id = segments[2];

  const doc = DOC_ROUTES[route];
  if (doc) {
    const key = parseDocKey(id, doc.prefix);
    if (!key || !id.startsWith(`${doc.prefix}-`)) return null;
    return {
      kind: doc.kind,
      permissionCode: doc.permissionCode,
      label: doc.label,
      docNumber: id,
      docKey: key,
    };
  }

  const numbered = NUMBER_ROUTES[route];
  if (numbered) {
    const key = parseDocKey(id, numbered.prefix);
    if (!key || !id.startsWith(`${numbered.prefix}-`)) return null;
    return {
      kind: numbered.kind,
      permissionCode: numbered.permissionCode,
      label: numbered.label,
      docNumber: id,
    };
  }

  const master = MASTER_ROUTES[route];
  if (master) {
    const num = Number(id);
    if (!/^\d+$/.test(id) || !Number.isInteger(num) || num < 1) return null;
    return {
      kind: master.kind,
      permissionCode: master.permissionCode,
      label: master.label,
      id: num,
    };
  }

  return null;
}

/** 未認証向けの汎用プレビュー文（業務データを含めない）。 */
export function genericPreviewTitle(target: PreviewTarget): string {
  return "docNumber" in target
    ? `${target.label} ${target.docNumber}`
    : `${target.label} #${target.id}`;
}
