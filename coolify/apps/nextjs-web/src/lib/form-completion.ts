import "server-only";

/**
 * form-completion.ts — 申請・報告（フォーム CM02 の REQUEST）が完了したときの
 * 通知。server-only.
 *
 * 完了の定義は `isCompletedRequest`（lib/form-schema.ts）が唯一の判定元 —
 * 承認フローを使うフォームは全段承認、使わないフォームは提出そのもの。
 *
 * **宛先は共有設定の行**（share_grants.notify_on_complete）。専用の宛先表を
 * 作らないのは、通知を開いたら notFound という行き止まりを構造として作れない
 * ようにするため（読める人にしか印を付けられない）。条件付き共有もそのまま
 * 効くので「拠点 A の回答が完了したときだけ拠点 A の課長へ」が 1 行で書ける。
 *
 * 届けた記録は form_completion_notices に残す。notifications 行（ベル・メール・
 * プッシュ）は対象書類を指す列を持たないので、CM01「完了した申請」の一覧と
 * 未読の印はこちらの表だけを読む。1 回答 1 人 1 行の unique が二重送信の
 * 最終防衛線で、**新しく作れた行の相手にだけ**通知を送る。
 */

import { getTranslations } from "next-intl/server";
import { recordAudit } from "./audit";
import { prisma } from "./db";
import { isCompletedRequest } from "./form-schema";
import { notify } from "./notifications";
import type { ShareGrantRow } from "./share-grants-core";
import { completionNotifyGrants } from "./share-grants-core";

const FORM_OWNER_TYPE = "forms";

/**
 * 1 回の完了で通知する人数の上限。全社共有 + 完了通知の組み合わせで、
 * 1 件の申請が全従業員のベルを鳴らし得る。超えたぶんは切って記録に残す
 * （黙って全員に送るより、送らなかったことが分かるほうがよい）。
 */
const MAX_RECIPIENTS = 200;

export function responsePath(formCode: string, responseNumber: string): string {
  return `/general/forms/${formCode}/responses/${responseNumber}`;
}

/** 共有先（全社・拠点・ロール・個人）を実際のユーザー id へ展開する。 */
async function expandSubjects(
  grants: readonly { subjectType: string; subjectId: string | null }[],
): Promise<Set<string>> {
  const userIds = new Set<string>();
  const plantIds: number[] = [];
  const roleIds: number[] = [];
  let everyone = false;

  for (const g of grants) {
    switch (g.subjectType) {
      case "EVERYONE":
        everyone = true;
        break;
      case "PLANT":
        if (g.subjectId && Number.isInteger(Number(g.subjectId)))
          plantIds.push(Number(g.subjectId));
        break;
      case "ROLE":
        if (g.subjectId && Number.isInteger(Number(g.subjectId)))
          roleIds.push(Number(g.subjectId));
        break;
      case "USER":
        if (g.subjectId) userIds.add(g.subjectId);
        break;
    }
  }

  if (everyone) {
    const all = await prisma.user.findMany({
      where: { isActive: true, group: "EMPLOYEE" },
      select: { id: true },
      take: MAX_RECIPIENTS + 1,
    });
    for (const u of all) userIds.add(u.id);
  }
  if (plantIds.length > 0) {
    const rows = await prisma.userPlant.findMany({
      where: { plantId: { in: plantIds } },
      select: { userId: true },
    });
    for (const r of rows) userIds.add(r.userId);
  }
  if (roleIds.length > 0) {
    const rows = await prisma.userRoleRelation.findMany({
      where: { roleId: { in: roleIds }, isActive: true },
      select: { userId: true },
    });
    for (const r of rows) userIds.add(r.userId);
  }
  return userIds;
}

/**
 * 完了を知らせる。**ベストエフォート** — 失敗しても承認・提出は成立させる
 * （呼び出し側は結果を待つが、例外はここで畳む）。
 */
export async function notifyFormCompletion(
  responseNumber: string,
): Promise<void> {
  try {
    const response = await prisma.formResponse.findUnique({
      where: { responseNumber },
      select: {
        recordNo: true,
        status: true,
        answers: true,
        submittedBy: true,
        submittedByUser: { select: { displayName: true, username: true } },
        form: {
          select: {
            code: true,
            title: true,
            kind: true,
            approvalEnabled: true,
            respondentVisibility: true,
          },
        },
      },
    });
    if (!response) return;
    if (!isCompletedRequest(response.form, response.status)) return;

    const grants = await prisma.shareGrant.findMany({
      where: {
        ownerType: FORM_OWNER_TYPE,
        ownerId: response.form.code,
        notifyOnComplete: true,
      },
      select: {
        subjectType: true,
        subjectId: true,
        level: true,
        notifyOnComplete: true,
        conditionFieldKey: true,
        conditionValues: true,
      },
    });
    if (grants.length === 0) return;

    const answers = (response.answers ?? {}) as Record<string, unknown>;
    const matched = completionNotifyGrants(
      grants.map(
        (g): ShareGrantRow => ({
          subjectType: g.subjectType as ShareGrantRow["subjectType"],
          subjectId: g.subjectId,
          level: g.level as ShareGrantRow["level"],
          notifyOnComplete: g.notifyOnComplete,
          condition:
            g.conditionFieldKey && g.conditionValues.length > 0
              ? { fieldKey: g.conditionFieldKey, values: g.conditionValues }
              : null,
        }),
      ),
      answers,
    );
    if (matched.length === 0) return;

    const subjects = await expandSubjects(
      matched.map((g) => ({
        subjectType: g.subjectType,
        subjectId: g.subjectId,
      })),
    );
    // 提出した本人には送らない — 承認結果は APPROVAL_RESULT で別に届くし、
    // 承認を使わないフォームでは「自分が今出した」ことを知らせても意味がない。
    subjects.delete(response.submittedBy);
    if (subjects.size === 0) return;

    const active = await prisma.user.findMany({
      where: { id: { in: [...subjects] }, isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const recipients = active.slice(0, MAX_RECIPIENTS).map((u) => u.id);
    if (recipients.length === 0) return;
    if (active.length > MAX_RECIPIENTS) {
      console.warn(
        `[form-completion] 通知先が多すぎるため ${active.length - MAX_RECIPIENTS} 人を送らず: ${responseNumber}`, // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
      );
    }

    // 作れた行の相手にだけ送る（既にある = もう知らせた）。
    const created = await prisma.formCompletionNotice.createManyAndReturn({
      data: recipients.map((userId) => ({ responseNumber, userId })),
      skipDuplicates: true,
      select: { userId: true },
    });
    if (created.length === 0) return;

    const respondent =
      response.form.respondentVisibility === "HIDDEN"
        ? null
        : response.submittedByUser.displayName ||
          response.submittedByUser.username;

    const tr = await getTranslations();
    await notify({
      userIds: created.map((c) => c.userId),
      type: "FORM_COMPLETED",
      title: tr("general.formCompletion.completedTitle", {
        title: response.form.title,
        recordNo: response.recordNo,
      }),
      message: respondent
        ? tr("general.formCompletion.applicantMessage", { name: respondent })
        : undefined,
      linkPath: responsePath(response.form.code, responseNumber),
    });

    // 「通知したはずなのに来ていない」を後から調べられるように残す。
    // 誰に送ったかは form_completion_notices が持つので、ここは件数だけ。
    await recordAudit({
      action: "UPDATE",
      tableName: "form_responses",
      recordId: responseNumber,
      after: {
        note: tr("general.formCompletion.notifiedNote", {
          count: created.length,
        }),
      },
    });
  } catch (e) {
    console.error("[form-completion] 完了通知に失敗:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  }
}

/**
 * 自分宛の完了通知を既読にする（回答を開いた時点）。
 * 「確認しました」ボタンではないので、押させずに記録する。
 */
export async function markFormCompletionRead(
  userId: string | null | undefined,
  responseNumber: string,
): Promise<void> {
  if (!userId) return;
  try {
    await prisma.formCompletionNotice.updateMany({
      where: { userId, responseNumber, readAt: null },
      data: { readAt: new Date() },
    });
  } catch (e) {
    console.error("[form-completion] 既読の記録に失敗:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  }
}
