/**
 * portal-share.ts — 書類詳細の「ポータル共有」（PortalShareCard）に渡す材料。
 * server-only.
 *
 * 出すのは次の 3 つが揃ったときだけ（どれかが欠ければ null = カードを出さない）:
 *   1. 取引先ポータルがこの環境で有効（dev-features の `portal`）
 *   2. 閲覧者が `portal_admin:CREATE` を持つ（書類リンクを発行できる人）
 *   3. 書類が社外に見せてよい状態（isPortalVisibleStatus — 下書きに出しても
 *      リンクは開けない）
 *
 * 発行・失効そのものの判定は SY0H の Server Action（settings/portal/actions.ts）
 * が持つ。ここは画面に出すかどうかを決めるだけで、**承認は peek しかしない**
 * （画面を開いただけで特権アクセスの持ち時間を動かさない）。
 */

import "server-only";

import { checkPermission } from "./authz";
import { isDevFeatureEnabled } from "./dev-features";
import {
  isPortalVisibleStatus,
  type PortalDocumentType,
} from "./portal-documents-core";
import { listPortalLinks, type PortalLinkRow } from "./portal-links";
import { peekElevation } from "./privileged-access";

export interface PortalShareProps {
  resourceType: PortalDocumentType;
  /** 書類の参照（docRef）。発行・一覧はこの値で引く。 */
  resourceId: string;
  links: PortalLinkRow[];
  canMintLinkOnly: boolean;
}

export async function loadPortalShare(
  resourceType: PortalDocumentType,
  resourceId: string,
  status: string,
): Promise<PortalShareProps | null> {
  if (!isDevFeatureEnabled("portal")) return null;
  if (!isPortalVisibleStatus(resourceType, status)) return null;
  const authz = await checkPermission("portal_admin", "CREATE");
  if (!authz.ok) return null;
  const [links, linkOnly] = await Promise.all([
    listPortalLinks({ resourceType, resourceId }),
    peekElevation("portal_admin.mint_link_only"),
  ]);
  return {
    resourceType,
    resourceId,
    links,
    canMintLinkOnly: linkOnly.allowed,
  };
}
