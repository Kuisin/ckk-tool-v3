/**
 * link-preview.ts — アプリ URL → プレビュー対象の解決（pure・unit test 対象）。
 *
 * Nextcloud 等の外部ツールに貼られたアプリ URL から「何の画面か」を解決し、
 * RBAC 判定に使う permission_code（user_permissions view の列）を返す。
 * リッチ内容の取得と権限チェックは /api/preview/resolve（server）側で行う —
 * ここは URL 解析と表示ラベルのみで DB に触れない。
 */

import { type DocKey, parseDocKey } from "@/lib/doc-number";

/** 文書（採番番号 URL）プレビュー対象。 */
export interface DocPreviewTarget {
  kind: "trial-estimate" | "price-list" | "quote";
  /** user_permissions.permission_code（READ を要求）。 */
  permissionCode: string;
  /** 文書種別の表示ラベル（ja）。 */
  label: string;
  docNumber: string;
  docKey: DocKey;
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
    prefix: "EST" | "PRC" | "QOT";
    label: string;
  }
> = {
  "sales/trial-estimates": {
    kind: "trial-estimate",
    prefix: "EST",
    label: "試算",
  },
  "sales/price-lists": { kind: "price-list", prefix: "PRC", label: "価格表" },
  "sales/quotes": { kind: "quote", prefix: "QOT", label: "見積書" },
};

const MASTER_ROUTES: Record<
  string,
  { kind: MasterPreviewTarget["kind"]; label: string }
> = {
  "master/material-types": { kind: "material-type", label: "材種" },
  "master/materials": { kind: "material", label: "素材" },
  "master/products": { kind: "product", label: "製品" },
};

/** permission_code — _specs/tables.md の permissions（invoice, sales …）に対応。 */
const PERMISSION_BY_SECTION: Record<string, string> = {
  sales: "sales",
  master: "master",
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
      permissionCode: PERMISSION_BY_SECTION[segments[0]],
      label: doc.label,
      docNumber: id,
      docKey: key,
    };
  }

  const master = MASTER_ROUTES[route];
  if (master) {
    const num = Number(id);
    if (!/^\d+$/.test(id) || !Number.isInteger(num) || num < 1) return null;
    return {
      kind: master.kind,
      permissionCode: PERMISSION_BY_SECTION[segments[0]],
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
