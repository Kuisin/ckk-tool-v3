/**
 * 未処理一覧 (CM01)「承認依頼中」タブの絞り込み条件（純粋・試験あり）。
 *
 * このタブは**自分が承認する番の依頼だけ**を並べる受信箱（マニュアル
 * operations/general/my-tasks）。以前は PENDING の依頼を全件出していて、
 * `approve:READ` を持つ人なら他部門の依頼まで全部見えていた。
 *
 * 「承認できる」の定義は承認を実際に押すときの判定 `resolveApprover`
 * （lib/approvals.ts）と同じにする — ずれると「一覧には出るのに押せない」
 * 「押せるのに一覧に出ない」が生まれる:
 *
 *   - グループ宛の段: 自分がそのグループの実効メンバー、または実効メンバーの
 *     期間内代理（= `groupIds`。呼び出し側が DB から解決して渡す）
 *   - 個人宛の段（group_id が null）: 依頼時に張った承認枠
 *     （approval_request_approvers）に自分が居る
 *
 * 加えて「全員」の段で自分の枠をもう押してあるものは、もう自分の番ではないので
 * 外す（残りの人を待っているだけ）。
 *
 * 書類の閲覧権限では絞らない。承認者に指名されたのに書類を読めない状態は
 * 「閲覧権限なし」バッジで知らせる設計（canReadTarget）で、一覧から消すと
 * 承認が止まっていることに誰も気づけなくなる。
 */

export interface ApprovalInboxWhere {
  status: "PENDING";
  OR: (
    | { groupId: { in: number[] } }
    | { groupId: null; approvers: { some: { userId: string } } }
  )[];
  NOT: {
    mode: "ALL";
    approvers: { some: { userId: string; actedAt: { not: null } } };
  };
}

export function approvalInboxWhere(
  userId: string,
  groupIds: readonly number[],
): ApprovalInboxWhere {
  return {
    status: "PENDING",
    OR: [
      { groupId: { in: [...new Set(groupIds)] } },
      { groupId: null, approvers: { some: { userId } } },
    ],
    NOT: {
      mode: "ALL",
      approvers: { some: { userId, actedAt: { not: null } } },
    },
  };
}
