import "server-only";

/**
 * internal-pages.ts — 社内文書 (CM03) の読み取り。書き込みは
 * app/(dashboard)/general/documents/actions.ts。
 *
 * 可視性は 2 段:
 *   - 権限コード `internal_page` … アプリを開けるか（CREATE = 新規作成可否）。
 *   - share_grants               … この 1 件を誰に見せるか（全社 / 拠点 / ロール / 個人）。
 * 共有行が 1 つも無ければ、作成者と system:ADMIN 以外には見えない。
 */

import { cache } from "react";
import { sessionUserId } from "./authz";
import { prisma } from "./db";
import {
  type ShareAccess,
  shareAccessFor,
  visibleOwnerIds,
} from "./share-grants";

export const PAGE_OWNER_TYPE = "internal_pages";

/**
 * 公開申請が「どの版を出したか」を approval_requests.notes に残す形（`rev:12`）。
 *
 * 承認は申請時点の版に対して下りるので、承認後に公開するのは latest ではなく
 * この版。CM01 の一覧には備考としてそのまま出るので、人が読めて機械でも
 * 読み戻せる短い形にしてある。読み戻せない（旧データ・空）ときは null。
 */
export function publishRevisionNote(revision: number): string {
  return `rev:${revision}`;
}

export function parsePublishRevisionNote(
  notes: string | null | undefined,
): number | null {
  const m = /^rev:(\d+)$/.exec(notes?.trim() ?? "");
  return m ? Number(m[1]) : null;
}

export interface PageRow {
  pageNumber: string;
  title: string;
  folder: string | null;
  status: string;
  publishedRevision: number | null;
  openComments: number;
  updatedAt: string;
}

export interface RevisionRow {
  revision: number;
  title: string;
  note: string | null;
  action: string;
  addedLines: number;
  removedLines: number;
  editedBy: string | null;
  editedAt: string;
}

export interface PageDetailView {
  id: string;
  pageNumber: string;
  title: string;
  summary: string | null;
  folder: string | null;
  status: "DRAFT" | "PENDING" | "PUBLISHED" | "ARCHIVED";
  approvalRequired: boolean;
  publishedRevision: number | null;
  /** 最新リビジョン（下書きを含む）。 */
  latestRevision: number;
  /** 最新の本文（編集・レビューはこれを見る）。 */
  draftBody: string;
  draftTitle: string;
  /** 公開中の本文（閲覧はこれを見る）。未公開なら null。 */
  publishedBody: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineCommentView {
  id: string;
  threadId: string;
  revision: number;
  anchorLine: number;
  anchorText: string;
  currentLine: number | null;
  body: string;
  status: "OPEN" | "RESOLVED";
  author: string | null;
  authorId: string | null;
  createdAt: string;
}

export interface BlameLine {
  line: number;
  revision: number;
  editedBy: string | null;
  editedAt: string;
}

/** 自分に見える文書の一覧。 */
export async function listPages(): Promise<PageRow[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  try {
    const rows = await prisma.internalPage.findMany({
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        pageNumber: true,
        title: true,
        folder: true,
        status: true,
        publishedRevision: true,
        updatedAt: true,
        createdBy: true,
        _count: { select: { comments: true } },
      },
    });
    const visible = await visibleOwnerIds(
      PAGE_OWNER_TYPE,
      rows.map((r) => ({ ownerId: r.pageNumber, createdBy: r.createdBy })),
    );
    // 未解決コメント数は一覧で出したいので、見える文書の分だけまとめて数える。
    const openCounts = await prisma.internalPageLineComment.groupBy({
      by: ["pageId"],
      where: { status: "OPEN" },
      _count: { _all: true },
    });
    const byPage = new Map(openCounts.map((c) => [c.pageId, c._count._all]));
    const ids = await prisma.internalPage.findMany({
      where: { pageNumber: { in: rows.map((r) => r.pageNumber) } },
      select: { id: true, pageNumber: true },
    });
    const pageIdOf = new Map(ids.map((i) => [i.pageNumber, i.id]));

    return rows
      .filter((r) => visible.has(r.pageNumber) || r.createdBy === userId)
      .map((r) => ({
        pageNumber: r.pageNumber,
        title: r.title,
        folder: r.folder,
        status: r.status,
        publishedRevision: r.publishedRevision,
        openComments: byPage.get(pageIdOf.get(r.pageNumber) ?? "") ?? 0,
        updatedAt: r.updatedAt.toISOString(),
      }));
  } catch {
    return [];
  }
}

export const fetchPage = cache(
  async (pageNumber: string): Promise<PageDetailView | null> => {
    const row = await prisma.internalPage.findUnique({
      where: { pageNumber },
      include: { revisions: { orderBy: { revision: "desc" }, take: 1 } },
    });
    if (!row) return null;

    const latest = row.revisions[0] ?? null;
    const published = row.publishedRevision
      ? await prisma.internalPageRevision.findUnique({
          where: {
            pageId_revision: {
              pageId: row.id,
              revision: row.publishedRevision,
            },
          },
          select: { body: true },
        })
      : null;

    return {
      id: row.id,
      pageNumber: row.pageNumber,
      title: row.title,
      summary: row.summary,
      folder: row.folder,
      status: row.status,
      approvalRequired: row.approvalRequired,
      publishedRevision: row.publishedRevision,
      latestRevision: latest?.revision ?? 0,
      draftBody: latest?.body ?? "",
      draftTitle: latest?.title ?? row.title,
      publishedBody: published?.body ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
);

export async function pageAccess(page: {
  pageNumber: string;
  createdBy: string | null;
}): Promise<ShareAccess> {
  return shareAccessFor(PAGE_OWNER_TYPE, page.pageNumber, page.createdBy);
}

export async function listRevisions(pageId: string): Promise<RevisionRow[]> {
  try {
    const rows = await prisma.internalPageRevision.findMany({
      where: { pageId },
      orderBy: { revision: "desc" },
      take: 200,
      select: {
        revision: true,
        title: true,
        note: true,
        action: true,
        addedLines: true,
        removedLines: true,
        editedAt: true,
        editedByUser: { select: { displayName: true, username: true } },
      },
    });
    return rows.map((r) => ({
      revision: r.revision,
      title: r.title,
      note: r.note,
      action: r.action,
      addedLines: r.addedLines,
      removedLines: r.removedLines,
      editedBy: r.editedByUser
        ? r.editedByUser.displayName || r.editedByUser.username
        : null,
      editedAt: r.editedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function fetchRevisionBody(
  pageId: string,
  revision: number,
): Promise<string | null> {
  const row = await prisma.internalPageRevision.findUnique({
    where: { pageId_revision: { pageId, revision } },
    select: { body: true },
  });
  return row?.body ?? null;
}

/** 行コメント。**レビュー画面からだけ呼ぶこと** — 公開版の閲覧では出さない。 */
export async function listLineComments(
  pageId: string,
): Promise<LineCommentView[]> {
  try {
    const rows = await prisma.internalPageLineComment.findMany({
      where: { pageId },
      orderBy: [{ anchorLine: "asc" }, { createdAt: "asc" }],
      take: 500,
      select: {
        id: true,
        threadId: true,
        revision: true,
        anchorLine: true,
        anchorText: true,
        currentLine: true,
        body: true,
        status: true,
        createdBy: true,
        createdAt: true,
        createdByUser: { select: { displayName: true, username: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      threadId: r.threadId,
      revision: r.revision,
      anchorLine: r.anchorLine,
      anchorText: r.anchorText,
      currentLine: r.currentLine,
      body: r.body,
      status: r.status,
      author: r.createdByUser
        ? r.createdByUser.displayName || r.createdByUser.username
        : null,
      authorId: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

/** 行ごとの最終更新者（レビュー画面のガターに出す）。 */
export async function fetchBlame(pageId: string): Promise<BlameLine[]> {
  try {
    const rows = await prisma.internalPageLineBlame.findMany({
      where: { pageId },
      orderBy: { line: "asc" },
      select: {
        line: true,
        revision: true,
        editedAt: true,
        editedByUser: { select: { displayName: true, username: true } },
      },
    });
    return rows.map((r) => ({
      line: r.line,
      revision: r.revision,
      editedBy: r.editedByUser
        ? r.editedByUser.displayName || r.editedByUser.username
        : null,
      editedAt: r.editedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

/** 未解決コメントの件数（公開前の警告に使う）。 */
export async function countOpenComments(pageId: string): Promise<number> {
  try {
    return await prisma.internalPageLineComment.count({
      where: { pageId, status: "OPEN" },
    });
  } catch {
    return 0;
  }
}
