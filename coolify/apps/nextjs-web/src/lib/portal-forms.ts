/**
 * portal-forms.ts — 社外へ出すフォーム回答（CM02）。server-only.
 *
 * ■ v1 は**読むだけ**
 * 社外の人に回答させるのは別の話。form_responses.submitted_by が users.id への
 * FK なので、非 users 主体を受けるには爆発半径の広いスキーマ変更が要る。
 * ここで見せるのは「自社に関して社内が入力した回答」（検査報告・クレーム記録など）。
 *
 * ■ 絞り込みは share_grants と同じ突合方式を**再利用する**
 * portal_grants の condition_field_key / condition_values は
 * share-grants-core.ts の ShareCondition と同じ規約なので、判定は
 * responseInScope をそのまま使う（lookup は id 一致 — 改名で範囲が変わらない）。
 * 規則を二重に書かない。
 *
 * ■ 出さないもの
 * 提出者（submittedBy）・承認の履歴・却下理由は社内の情報。
 * 回答本文（answers）は**共有された項目だけ**を出す。
 */

import "server-only";

import { prisma } from "./db";
import { portalGrantsFor } from "./portal-access";
import type { PortalSession } from "./portal-auth";
import { responseInScope } from "./share-grants-core";

/**
 * 社外に出す回答の状態。
 * DRAFT（本人だけ）・REQUESTED（承認依頼中）・REJECTED（差し戻し）は
 * どれも社内の途中経過なので出さない。
 */
const VISIBLE_RESPONSE_STATUS = ["SUBMITTED", "APPROVED"] as const;

export interface PortalFormSummary {
  code: string;
  title: string;
  responseCount: number;
}

export interface PortalFormResponseRow {
  responseNumber: string;
  submittedOn: string | null;
  /** 共有条件に使われた項目の値だけ（見出し代わり）。 */
  answers: Record<string, unknown>;
}

export const PORTAL_FORM_RESPONSE_KEYS: readonly (keyof PortalFormResponseRow)[] =
  ["answers", "responseNumber", "submittedOn"];

/**
 * 共有されているフォームの一覧。
 * portal_grants の kind=FORM だけが対象（BP スコープではフォームは出ない）。
 */
export async function listPortalForms(
  session: PortalSession,
): Promise<PortalFormSummary[]> {
  if (session.linkId || !session.accountId) return [];
  const grants = await portalGrantsFor(session.accountId);
  const now = new Date();
  const codes = grants
    .filter(
      (g) =>
        g.kind === "FORM" &&
        g.resourceId &&
        !g.revokedAt &&
        (!g.expiresAt || g.expiresAt > now),
    )
    .map((g) => g.resourceId as string);
  if (codes.length === 0) return [];

  const forms = await prisma.form.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, title: true },
  });

  // 件数は「見せてよい状態のもの」だけ数える（下書きを数に含めない）。
  const counts = await prisma.formResponse.groupBy({
    by: ["formId"],
    where: {
      formId: { in: forms.map((f) => f.id) },
      status: { in: [...VISIBLE_RESPONSE_STATUS] },
    },
    _count: { _all: true },
  });
  const byForm = new Map(counts.map((c) => [c.formId, c._count._all]));

  return forms.map((f) => ({
    code: f.code,
    title: f.title,
    responseCount: byForm.get(f.id) ?? 0,
  }));
}

/**
 * 1 つのフォームの回答。**共有条件に当たる回答だけ**を返す。
 * 条件は share-grants-core.ts の responseInScope が判定する（規則を二重に書かない）。
 */
export async function listPortalFormResponses(
  session: PortalSession,
  code: string,
): Promise<PortalFormResponseRow[] | null> {
  if (session.linkId || !session.accountId) return null;
  const grants = await portalGrantsFor(session.accountId);
  const now = new Date();
  const matching = grants.filter(
    (g) =>
      g.kind === "FORM" &&
      g.resourceId === code &&
      !g.revokedAt &&
      (!g.expiresAt || g.expiresAt > now),
  );
  if (matching.length === 0) return null;

  // 条件なしの行が 1 つでもあれば全件（share_grants の widen と同じ規則）。
  const scope = matching.some((g) => !g.condition?.values?.length)
    ? { all: true, conditions: [] }
    : {
        all: false,
        conditions: matching
          .map((g) => g.condition)
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => ({ fieldKey: c.fieldKey, values: [...c.values] })),
      };

  const form = await prisma.form.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!form) return null;

  const rows = await prisma.formResponse.findMany({
    where: {
      formId: form.id,
      status: { in: [...VISIBLE_RESPONSE_STATUS] },
    },
    // 許可リスト。submittedBy / history / rejectReason は取らない。
    select: {
      responseNumber: true,
      submittedAt: true,
      createdAt: true,
      answers: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows
    .filter((r) =>
      responseInScope(scope, (r.answers ?? {}) as Record<string, unknown>),
    )
    .map((r) => ({
      responseNumber: r.responseNumber,
      submittedOn: (r.submittedAt ?? r.createdAt).toISOString().slice(0, 10),
      answers: (r.answers ?? {}) as Record<string, unknown>,
    }));
}
