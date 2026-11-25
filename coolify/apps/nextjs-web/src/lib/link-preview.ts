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

import {
  type DocKey,
  type DocPrefix,
  type DocTable,
  isLegacyDocNumber,
  isNewDocNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { parseDocId } from "@/lib/doc-ref-core";

/**
 * 書類（番号を DB が払い出す表）のプレビュー対象。
 *
 * URL の id は 3 通りあり得る:
 *   `CKK~QOT-2026-00001` … いまの URL。`docKey` が決まる（DB を引かずに行を指せる）
 *   `QOT-2026-00001`     … 法人コードなし。`docKey` は null
 *   `QOT-202607-00001`   … 旧番号（番号設計 PR-C より前に貼られたリンク）。null
 * 下の 2 つは、呼び出し側（/api/preview/resolve）が
 * `resolveDocId(target.table, target.rawId)` で書類を引いて決める — このファイルは
 * DB に触れない。
 */
export interface DocPreviewTarget {
  kind:
    | "trial-estimate"
    | "price-list"
    | "quote"
    | "order-acceptance"
    | "work-order"
    | "delivery-order"
    | "delivery-note"
    | "invoice"
    | "purchase-order"
    | "purchase-request"
    | "design-request";
  /** user_permissions.permission_code（READ を要求）。 */
  permissionCode: string;
  /** 文書種別の表示ラベル（ja）。 */
  label: string;
  /** 書類の表（= lib/doc-ref.ts resolveDocId の type）。 */
  table: DocTable;
  /** 書類番号だけ（法人コードは落とす）。未認証向けの汎用タイトルに使う。 */
  docNumber: string;
  /** 行の鍵。法人コード付きの新しい番号のときだけ決まる。 */
  docKey: DocKey | null;
  /** URL のパス区切りそのまま（復号済み）。resolveDocId に渡す。 */
  rawId: string;
}

/** マスタ（内部 int id URL）プレビュー対象。 */
export interface MasterPreviewTarget {
  kind: "material-type" | "material" | "product";
  permissionCode: string;
  label: string;
  id: number;
}

export type PreviewTarget = DocPreviewTarget | MasterPreviewTarget;

const DOC_ROUTES: Record<
  string,
  {
    kind: DocPreviewTarget["kind"];
    prefix: DocPrefix;
    table: DocTable;
    label: string;
    permissionCode: string;
  }
> = {
  "sales/trial-estimates": {
    kind: "trial-estimate",
    prefix: "EST",
    table: "estimates",
    label: "価格試算", // i18n-ignore
    permissionCode: "price_list",
  },
  "sales/price-lists": {
    kind: "price-list",
    prefix: "PRC",
    table: "price_list_entries",
    label: "価格表", // i18n-ignore
    permissionCode: "price_list",
  },
  "sales/quotes": {
    kind: "quote",
    prefix: "QOT",
    table: "quotes",
    label: "見積書", // i18n-ignore
    permissionCode: "quote",
  },
  "sales/order-acceptances": {
    kind: "order-acceptance",
    prefix: "ORD",
    table: "order_acceptances",
    label: "注文請書", // i18n-ignore
    permissionCode: "order_acceptance",
  },
  // 指示書の URL はロット番号（数字）でも開ける。ここが拾うのは書類番号
  // （WOR-…）で貼られたものだけ — ロット番号の URL は従来どおり対象外。
  "production/work-orders": {
    kind: "work-order",
    prefix: "WOR",
    table: "work_orders",
    label: "指示書", // i18n-ignore
    permissionCode: "work_order",
  },
  "shipping/delivery-orders": {
    kind: "delivery-order",
    prefix: "DOR",
    table: "delivery_orders",
    label: "出荷書", // i18n-ignore
    permissionCode: "delivery_order",
  },
  "shipping/delivery-notes": {
    kind: "delivery-note",
    prefix: "DRN",
    table: "delivery_notes",
    label: "納品書", // i18n-ignore
    permissionCode: "delivery_note",
  },
  "billing/invoices": {
    kind: "invoice",
    prefix: "INV",
    table: "invoices",
    label: "請求書", // i18n-ignore
    permissionCode: "invoice",
  },
  "purchase/purchase-orders": {
    kind: "purchase-order",
    prefix: "PO",
    table: "material_purchase_orders",
    label: "素材発注書", // i18n-ignore
    permissionCode: "purchase_order",
  },
  "purchase/purchase-requests": {
    kind: "purchase-request",
    prefix: "PRQ",
    table: "purchase_requests",
    label: "購買依頼", // i18n-ignore
    permissionCode: "purchase_order",
  },
  "sales/design-requests": {
    kind: "design-request",
    prefix: "DSG",
    table: "design_requests",
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
    // 法人コードは付いていてもいなくてもよい。番号は新しい形か旧番号で、
    // 接頭辞がその画面のものと合っていること。
    const { number } = parseDocId(id);
    if (
      !isNewDocNumber(number, doc.prefix) &&
      !isLegacyDocNumber(number, doc.prefix)
    ) {
      return null;
    }
    return {
      kind: doc.kind,
      permissionCode: doc.permissionCode,
      label: doc.label,
      table: doc.table,
      docNumber: number,
      docKey: parseDocKey(id, doc.prefix),
      rawId: id,
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
