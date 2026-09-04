import "server-only";

/**
 * privileged-data.ts — 未処理一覧 (CM01) の「特権アクセス」セクションのデータソース。
 *
 * 中身は SY0G（/settings/privileged-access）の「承認する」タブと同じ行で、
 * 読み取りは listRequestsToApprove() 1 本に寄せてある。CM01 は**見えるようにする
 * ためだけ**の場所で、決裁そのものは SY0G で行う — 承認モーダル（方式 A の
 * 部分許可・方式 B の適用）を 2 か所に持つと、片方だけ直る事故になる。
 *
 * 申請時には決裁できる人へ通知も飛ぶ（lib/privileged-notify.ts）。通知は
 * 見落とすし、あとから「何が残っているか」を数えるのには使えない — 残って
 * いるものを数えられる場所として、毎日開くこの画面にも出す。
 */

import { ELEVATION_CODES } from "@/lib/privileged-operations";
import {
  approvableCodesFor,
  listRequestsToApprove,
  type PrivilegedRequestRow,
} from "@/lib/privileged-requests";
import { USER_ADMIN_CODE } from "@/lib/user-change-requests";

/**
 * 自分が決裁できる特権アクセスの申請（承認依頼中）。
 *
 * null = どの特権コードの APPROVE も持っていない = タブごと出さない。
 * 空配列（決裁できるが今は 0 件）とは区別する — 承認セクションと同じ規約で、
 * 「権限が無い」と「今は無い」を同じ空タブで表さないため。
 */
export async function fetchPrivilegedApprovals(): Promise<
  PrivilegedRequestRow[] | null
> {
  const codes = await approvableCodesFor([...ELEVATION_CODES, USER_ADMIN_CODE]);
  if (codes.length === 0) return null;
  // 権限チェックはリクエスト単位でメモ化されているので、この中で
  // approvableCodesFor をもう一度引いても DB へは行かない（lib/authz.ts）。
  return listRequestsToApprove();
}
