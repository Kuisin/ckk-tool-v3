import "server-only";

/**
 * privileged-requests.ts — 特権アクセス（SY0G）の読み取り。server-only.
 *
 * 2 方式ぶんの申請を 1 つの画面に並べるので、行の形をここで揃える
 * （画面側で 2 種類の分岐を持たないため）。時刻は ISO 文字列にして渡す
 * — Date のままクライアントへ渡すと表示側で string と混ざる（kiosk-admin.ts と同じ規約）。
 */

import { getLocale, getTranslations } from "next-intl/server";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { type Locale, normalizeLocale } from "@/lib/i18n";
import {
  type GrantState,
  grantState,
  type PrivilegedRequestStatus,
  remainingMs,
} from "@/lib/privileged-access-core";
import {
  ELEVATION_CODE_LABEL,
  ELEVATION_CODES,
  type ElevationCode,
  operationLabel,
} from "@/lib/privileged-operations";
import {
  describeUserChange,
  type UserChangeKind,
  userChangeLabel,
} from "@/lib/user-change-core";
import { USER_ADMIN_CODE } from "@/lib/user-change-requests";

/** 画面に渡す 1 行。方式 A / B のどちらも同じ形にする。 */
export interface PrivilegedRequestRow {
  id: string;
  /** "elevation" = 時限昇格 / "user-change" = ユーザー変更依頼 */
  kind: "elevation" | "user-change";
  /** 承認に要る権限コード。 */
  code: string;
  /** 「何の申請か」の見出し。 */
  title: string;
  /** 中身の 1 行説明（承認者が読む）。 */
  detail: string;
  /** 方式 A: 選ばれた操作。承認済みなら granted だけが効く。 */
  operations: { key: string; label: string; granted: boolean }[];
  reason: string;
  status: PrivilegedRequestStatus;
  /** 方式 A の実効状態（時刻込み）。方式 B は null。 */
  state: GrantState | null;
  remainingMs: number | null;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  durationMinutes: number | null;
  activatedAt: string | null;
  useCount: number | null;
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  /** 方式 B: 適用の結果。 */
  appliedAt: string | null;
  applyError: string | null;
  /** 方式 B: 対象者。 */
  targetUserName: string | null;
}

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function elevationRow(
  r: {
    id: string;
    code: string;
    status: string;
    reason: string;
    windowStartsAt: Date;
    windowEndsAt: Date;
    durationMinutes: number;
    activatedAt: Date | null;
    useCount: number;
    requestedBy: string;
    requestedAt: Date;
    decidedAt: Date | null;
    decisionComment: string | null;
    revokedAt: Date | null;
    revokeReason: string | null;
    requestedByUser: { displayName: string } | null;
    decidedByUser: { displayName: string } | null;
    operations: { operation: string; granted: boolean }[];
  },
  now: Date,
  opLocale: Locale,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): PrivilegedRequestRow {
  const status = r.status as PrivilegedRequestStatus;
  const g = {
    status,
    windowStartsAt: r.windowStartsAt,
    windowEndsAt: r.windowEndsAt,
    durationMinutes: r.durationMinutes,
    activatedAt: r.activatedAt,
  };
  const ops = r.operations.map((o) => ({
    key: o.operation,
    label: operationLabel(o.operation, opLocale),
    granted: o.granted,
  }));
  // 承認済みなら「実際に使える操作」だけを数える — 承認者が外したものを
  // 件数に含めると、付与の広さを実際より大きく見せてしまう。
  const effective = status === "APPROVED" ? ops.filter((o) => o.granted) : ops;
  return {
    id: r.id,
    kind: "elevation",
    code: r.code,
    title: ELEVATION_CODE_LABEL[r.code as ElevationCode]?.[opLocale] ?? r.code,
    detail:
      effective.length === 0
        ? tr("common.noOperationsGranted")
        : effective.map((o) => o.label).join(" / "),
    operations: ops,
    reason: r.reason,
    status,
    state: grantState(g, now),
    remainingMs: remainingMs(g, now),
    windowStartsAt: iso(r.windowStartsAt),
    windowEndsAt: iso(r.windowEndsAt),
    durationMinutes: r.durationMinutes,
    activatedAt: iso(r.activatedAt),
    useCount: r.useCount,
    requestedById: r.requestedBy,
    requestedByName: r.requestedByUser?.displayName ?? "—",
    requestedAt: r.requestedAt.toISOString(),
    decidedByName: r.decidedByUser?.displayName ?? null,
    decidedAt: iso(r.decidedAt ?? r.revokedAt),
    decisionComment: r.decisionComment ?? r.revokeReason,
    appliedAt: null,
    applyError: null,
    targetUserName: null,
  };
}

/**
 * 変更依頼の要約に出す名前の対応表（拠点 / ロール）。
 *
 * payload は id しか持たないので、これが無いと決裁画面に `#12 / #7` と並ぶ。
 * 承認者は「何になるのか」を読んで判断するのだから、id では判断できない。
 * どちらもマスタで数十件なので、件数を絞らず 1 回ずつ引いて Map にする。
 */
async function loadChangeNames(): Promise<ChangeNames> {
  const locale = await getLocale();
  const [plants, roles] = await Promise.all([
    prisma.plant.findMany({ select: { id: true, code: true, name: true } }),
    prisma.role.findMany({
      select: { id: true, rolename: true, displayName: true },
    }),
  ]);
  return {
    plants: new Map(
      plants.map((p) => [
        p.id,
        `${p.code} ${localized(p.name as LocalizedText | null, locale)}`,
      ]),
    ),
    roles: new Map(
      roles.map((r) => {
        const label = localized(r.displayName as LocalizedText | null, locale);
        return [r.id, label === "—" ? r.rolename : label];
      }),
    ),
  };
}

interface ChangeNames {
  plants: ReadonlyMap<number, string>;
  roles: ReadonlyMap<number, string>;
}

function userChangeRow(
  r: {
    id: string;
    kind: string;
    payload: unknown;
    reason: string;
    status: string;
    requestedBy: string;
    requestedAt: Date;
    decidedAt: Date | null;
    decisionComment: string | null;
    appliedAt: Date | null;
    applyError: string | null;
    targetUser: { displayName: string; username: string };
    requestedByUser: { displayName: string } | null;
    decidedByUser: { displayName: string } | null;
  },
  tr: Awaited<ReturnType<typeof getTranslations>>,
  names: ChangeNames,
): PrivilegedRequestRow {
  const kind = r.kind as UserChangeKind;
  return {
    id: r.id,
    kind: "user-change",
    code: USER_ADMIN_CODE,
    title: `${userChangeLabel(kind, tr)}: ${r.targetUser.displayName}`,
    detail: describeUserChange(kind, r.payload, tr, names),
    operations: [],
    reason: r.reason,
    status: r.status as PrivilegedRequestStatus,
    state: null,
    remainingMs: null,
    windowStartsAt: null,
    windowEndsAt: null,
    durationMinutes: null,
    activatedAt: null,
    useCount: null,
    requestedById: r.requestedBy,
    requestedByName: r.requestedByUser?.displayName ?? "—",
    requestedAt: r.requestedAt.toISOString(),
    decidedByName: r.decidedByUser?.displayName ?? null,
    decidedAt: iso(r.decidedAt),
    decisionComment: r.decisionComment,
    appliedAt: iso(r.appliedAt),
    applyError: r.applyError,
    targetUserName: `${r.targetUser.displayName}（${r.targetUser.username}）`,
  };
}

const ELEVATION_INCLUDE = {
  requestedByUser: { select: { displayName: true } },
  decidedByUser: { select: { displayName: true } },
  operations: { select: { operation: true, granted: true } },
} as const;

const CHANGE_INCLUDE = {
  targetUser: { select: { displayName: true, username: true } },
  requestedByUser: { select: { displayName: true } },
  decidedByUser: { select: { displayName: true } },
} as const;

const OPEN: PrivilegedRequestStatus[] = ["PENDING", "APPROVED"];

/** 自分が出した申請（進行中を上に、新しい順）。 */
export async function listMyRequests(): Promise<PrivilegedRequestRow[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  const now = new Date();
  const [elevations, changes, locale, tr, names] = await Promise.all([
    prisma.privilegedAccessRequest.findMany({
      where: { requestedBy: userId },
      include: ELEVATION_INCLUDE,
      orderBy: { requestedAt: "desc" },
      take: 100,
    }),
    prisma.userChangeRequest.findMany({
      where: { requestedBy: userId },
      include: CHANGE_INCLUDE,
      orderBy: { requestedAt: "desc" },
      take: 100,
    }),
    getLocale(),
    getTranslations(),
    loadChangeNames(),
  ]);
  const opLocale = normalizeLocale(locale);
  return sortRows([
    ...elevations.map((r) => elevationRow(r, now, opLocale, tr)),
    ...changes.map((r) => userChangeRow(r, tr, names)),
  ]);
}

/**
 * 自分が決裁できる申請（承認依頼中のみ）。
 * **自分が出したものは除く** — 申請と承認は別の人でなければならないので、
 * 押せないものを一覧に並べない。
 */
export async function listRequestsToApprove(): Promise<PrivilegedRequestRow[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  const codes = await approvableCodesFor([...ELEVATION_CODES, USER_ADMIN_CODE]);
  if (codes.length === 0) return [];
  const now = new Date();

  const [elevations, changes, locale, tr, names] = await Promise.all([
    codes.some((c) => (ELEVATION_CODES as readonly string[]).includes(c))
      ? prisma.privilegedAccessRequest.findMany({
          where: {
            status: "PENDING",
            code: { in: codes },
            requestedBy: { not: userId },
          },
          include: ELEVATION_INCLUDE,
          orderBy: { requestedAt: "asc" },
        })
      : [],
    codes.includes(USER_ADMIN_CODE)
      ? prisma.userChangeRequest.findMany({
          where: { status: "PENDING", requestedBy: { not: userId } },
          include: CHANGE_INCLUDE,
          orderBy: { requestedAt: "asc" },
        })
      : [],
    getLocale(),
    getTranslations(),
    loadChangeNames(),
  ]);
  const opLocale = normalizeLocale(locale);
  return [
    ...elevations.map((r) => elevationRow(r, now, opLocale, tr)),
    ...changes.map((r) => userChangeRow(r, tr, names)),
  ].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

/** 決裁済み・終了したもの（履歴タブ）。 */
export async function listDecidedRequests(): Promise<PrivilegedRequestRow[]> {
  const codes = await approvableCodesFor([...ELEVATION_CODES, USER_ADMIN_CODE]);
  if (codes.length === 0) return [];
  const now = new Date();
  const [elevations, changes, locale, tr, names] = await Promise.all([
    prisma.privilegedAccessRequest.findMany({
      where: { status: { notIn: ["PENDING"] }, code: { in: codes } },
      include: ELEVATION_INCLUDE,
      orderBy: { requestedAt: "desc" },
      take: 200,
    }),
    codes.includes(USER_ADMIN_CODE)
      ? prisma.userChangeRequest.findMany({
          where: { status: { notIn: ["PENDING"] } },
          include: CHANGE_INCLUDE,
          orderBy: { requestedAt: "desc" },
          take: 200,
        })
      : [],
    getLocale(),
    getTranslations(),
    loadChangeNames(),
  ]);
  const opLocale = normalizeLocale(locale);
  return [
    ...elevations.map((r) => elevationRow(r, now, opLocale, tr)),
    ...changes.map((r) => userChangeRow(r, tr, names)),
  ].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

/** その人が APPROVE を持つコード。 */
export async function approvableCodesFor(
  codes: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const code of codes) {
    const r = await checkPermission(code, "APPROVE");
    if (r.ok) out.push(code);
  }
  return out;
}

/** 進行中（承認依頼中・有効）を上に、そのあと新しい順。 */
function sortRows(rows: PrivilegedRequestRow[]): PrivilegedRequestRow[] {
  return rows.sort((a, b) => {
    const ao = OPEN.includes(a.status) ? 0 : 1;
    const bo = OPEN.includes(b.status) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return b.requestedAt.localeCompare(a.requestedAt);
  });
}
