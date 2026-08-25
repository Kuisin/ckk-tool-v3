/**
 * forms-data.ts — 承認・予定 (CM01) のフォームセクションのデータソース。
 *
 * 2 つ出す:
 *   - 未回答のフォーム … 自分に共有されていて（回答できて）、まだ出していない、
 *     いま受付中のもの。締切が近い順。
 *   - 回答済みのフォーム … 自分が出した回答。回答者を表示しないフォームでも
 *     **自分の分は自分に見える**（他人には出ない）。編集期限内なら直せる。
 */

import { sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  canEditResponse,
  editDeadlineOf,
  type FormAvailability,
  formAvailability,
} from "@/lib/form-schema";
import { visibleOwnerIds } from "@/lib/share-grants";

export interface PendingFormRow {
  code: string;
  title: string;
  kind: string;
  closesAt: string | null;
}

export interface MyResponseRow {
  responseNumber: string;
  formCode: string;
  formTitle: string;
  recordNo: number;
  status: string;
  submittedAt: string | null;
  canEdit: boolean;
  editDeadline: string | null;
}

export interface FormTasks {
  pending: PendingFormRow[];
  mine: MyResponseRow[];
}

export async function fetchFormTasks(): Promise<FormTasks> {
  const userId = await sessionUserId();
  if (!userId) return { pending: [], mine: [] };

  try {
    const now = new Date();

    const [forms, myResponses] = await Promise.all([
      prisma.form.findMany({
        where: { status: "PUBLISHED", currentVersion: { gt: 0 } },
        select: {
          code: true,
          title: true,
          kind: true,
          status: true,
          opensAt: true,
          closesAt: true,
          createdBy: true,
        },
        take: 300,
      }),
      prisma.formResponse.findMany({
        where: { submittedBy: userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          responseNumber: true,
          recordNo: true,
          status: true,
          submittedAt: true,
          form: true,
        },
      }),
    ]);

    // 受付中のものだけを候補にしてから、共有設定で絞る。
    const open = forms.filter(
      (f) => formAvailability(f, now) === ("OPEN" satisfies FormAvailability),
    );
    const visible = await visibleOwnerIds(
      "forms",
      open.map((f) => ({ ownerId: f.code, createdBy: f.createdBy })),
    );
    const answered = new Set(
      myResponses.filter((r) => r.status !== "DRAFT").map((r) => r.form.code),
    );

    const pending = open
      .filter((f) => visible.has(f.code) && !answered.has(f.code))
      .sort((a, b) => {
        // 締切が近い順。無期限は後ろへ。
        const ax = a.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bx = b.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
        return ax - bx;
      })
      .map((f) => ({
        code: f.code,
        title: f.title,
        kind: f.kind,
        closesAt: f.closesAt?.toISOString() ?? null,
      }));

    const mine = myResponses.map((r) => ({
      responseNumber: r.responseNumber,
      formCode: r.form.code,
      formTitle: r.form.title,
      recordNo: r.recordNo,
      status: r.status,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      canEdit: canEditResponse(
        r.form,
        { submittedBy: userId, status: r.status },
        userId,
        now,
      ),
      editDeadline: editDeadlineOf(r.form)?.toISOString() ?? null,
    }));

    return { pending, mine };
  } catch {
    // CM01 はホームの次によく開く画面 — フォームが読めなくても他は出す。
    return { pending: [], mine: [] };
  }
}
