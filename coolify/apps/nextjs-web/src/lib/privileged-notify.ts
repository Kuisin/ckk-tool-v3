import "server-only";

/**
 * privileged-notify.ts — 特権アクセス（SY0G）の通知。
 *
 * 方式 A（時限昇格）と方式 B（変更依頼）で申請の形は違うが、**誰に何を知らせ
 * たいか**は同じなので 1 本にまとめる:
 *   申請したとき → **決裁できる人へ**（`<code>:APPROVE` の保持者。申請者は外す）
 *   決裁したとき → **申請した人へ**（承認 / 差し戻し / 取り消し）
 *
 * 宛先は承認グループ（MS0B）ではなく **RBAC の APPROVE 保持者**である点が
 * 書類の承認と違う。特権アクセスは承認フローを通らず、コードごとの APPROVE を
 * 持つ人だけが決裁するため、宛先の定義もそこに合わせる（authz-core の
 * findUserIdsWithPermission は decide と同じ規則 — action or code:ADMIN or
 * system:ADMIN）。管理者は素通しで決裁できるので、宛先に入るのが正しい。
 *
 * **通知の失敗で申請・決裁を落とさない。** ここで送れなくても申請は成立して
 * いて、SY0G と CM01 の一覧には出る。通知は気づく手段の 1 つであって、
 * 記録そのものではない。
 */

import { findUserIdsWithPermission } from "@ckk/authz-core";
import { getTranslations } from "next-intl/server";
import { prisma } from "./db";
import { notify } from "./notifications";

const PRIVILEGED_PATH = "/settings/privileged-access";

/** 申請者の表示名（引けなければ null — 通知は名前無しでも送る）。 */
async function displayName(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  return u?.displayName ?? null;
}

/**
 * 申請が出たことを、決裁できる人へ知らせる。
 *
 * `subject` は「何の申請か」の 1 行（方式 A = 権限コードの表示名 /
 * 方式 B = 変更の種類 + 対象者）。理由は本文に載せる — 承認者が最初に読むのは
 * 「誰が、なぜ」なので、件名より本文に置くほうが端末の通知でも切れにくい。
 */
export async function notifyPrivilegedRequested(input: {
  /** 決裁に要る権限コード（kiosk_card / user_admin …）。 */
  code: string;
  requestedBy: string;
  subject: string;
  reason: string;
}): Promise<void> {
  try {
    const tr = await getTranslations();
    const approvers = await findUserIdsWithPermission(
      prisma,
      input.code,
      "APPROVE",
    );
    const userIds = approvers.filter((id) => id !== input.requestedBy);
    if (userIds.length === 0) return;

    const name = await displayName(input.requestedBy);
    await notify({
      userIds,
      type: "APPROVAL_REQUEST",
      title: tr("privilegedNotify.requestTitle", { subject: input.subject }),
      message: name
        ? tr("privilegedNotify.requestMessage", { name, reason: input.reason })
        : input.reason,
      linkPath: PRIVILEGED_PATH,
    });
  } catch (e) {
    console.error("[privileged] 申請通知に失敗:", e); // i18n-ignore — サーバーログのみ
  }
}

/** 決裁の結果を申請者へ返す。 */
export async function notifyPrivilegedDecided(input: {
  requestedBy: string;
  /** 決裁した人。自分の申請を自分で決裁する道は無いが、通知の自己送信は防ぐ。 */
  decidedBy: string;
  subject: string;
  outcome: "APPROVED" | "REJECTED" | "REVOKED";
  /** 承認コメント / 差し戻し理由 / 取り消し理由。 */
  comment?: string | null;
}): Promise<void> {
  try {
    if (input.requestedBy === input.decidedBy) return;
    const tr = await getTranslations();
    const title =
      input.outcome === "APPROVED"
        ? tr("privilegedNotify.approvedTitle", { subject: input.subject })
        : input.outcome === "REJECTED"
          ? tr("privilegedNotify.rejectedTitle", { subject: input.subject })
          : tr("privilegedNotify.revokedTitle", { subject: input.subject });
    await notify({
      userIds: [input.requestedBy],
      type: "APPROVAL_RESULT",
      title,
      message: input.comment?.trim() || undefined,
      linkPath: PRIVILEGED_PATH,
    });
  } catch (e) {
    console.error("[privileged] 決裁通知に失敗:", e); // i18n-ignore — サーバーログのみ
  }
}
