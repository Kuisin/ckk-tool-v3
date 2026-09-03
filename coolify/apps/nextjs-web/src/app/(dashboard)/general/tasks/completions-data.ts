/**
 * completions-data.ts — 承認・予定 (CM01)「完了した申請」のデータソース。
 *
 * 出すのは **自分宛に届いた完了通知**（form_completion_notices）だけ。
 * 「完了した申請ぜんぶ」ではない — 誰に知らせるかはフォームの共有設定
 * （完了通知を付けた共有行）が決めていて、その宛先がそのままこの一覧になる。
 *
 * 未読の印は notifications 側ではなくこの表の read_at を読む。ベルの通知は
 * 対象書類を指す列を持たないので、回答ごとの既読を引けない。
 */

import { getTranslations } from "next-intl/server";
import { sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type FormAnswerValue,
  fieldsFromSchema,
  titleTextOf,
} from "@/lib/form-schema";

/** 一覧に出す件数。古いものは通知の控えとしての役目を終えているので切る。 */
const LIMIT = 100;

export interface CompletedRequestRow {
  responseNumber: string;
  formCode: string;
  formTitle: string;
  /** 見出し項目（isTitle）の値。未設定・未回答なら null。 */
  recordTitle: string | null;
  recordNo: number;
  /** 回答者を表示しないフォームでは null。 */
  respondent: string | null;
  status: string;
  notifiedAt: string;
  readAt: string | null;
}

export async function fetchCompletedRequests(): Promise<CompletedRequestRow[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  const tr = await getTranslations();

  try {
    const rows = await prisma.formCompletionNotice.findMany({
      where: { userId },
      orderBy: { notifiedAt: "desc" },
      take: LIMIT,
      select: {
        responseNumber: true,
        notifiedAt: true,
        readAt: true,
        response: {
          select: {
            recordNo: true,
            status: true,
            answers: true,
            submittedByUser: { select: { displayName: true, username: true } },
            form: {
              select: {
                code: true,
                title: true,
                respondentVisibility: true,
                versions: {
                  orderBy: { version: "desc" },
                  take: 1,
                  select: { schema: true },
                },
              },
            },
          },
        },
      },
    });

    return rows.map((r) => ({
      responseNumber: r.responseNumber,
      formCode: r.response.form.code,
      formTitle: r.response.form.title,
      recordTitle:
        titleTextOf(
          fieldsFromSchema(r.response.form.versions[0]?.schema ?? [], tr),
          (r.response.answers ?? {}) as Record<string, FormAnswerValue>,
        ) || null,
      recordNo: r.response.recordNo,
      // 「回答者を表示しない」フォームでは props に載せない（画面で隠すのでは
      // なく送らない — 回答詳細と同じ扱い）。
      respondent:
        r.response.form.respondentVisibility === "HIDDEN"
          ? null
          : r.response.submittedByUser.displayName ||
            r.response.submittedByUser.username,
      status: r.response.status,
      notifiedAt: r.notifiedAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    }));
  } catch {
    // CM01 はホームの次によく開く画面 — 1 セクションが読めなくても他は出す。
    return [];
  }
}
