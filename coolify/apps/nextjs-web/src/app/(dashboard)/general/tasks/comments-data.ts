/**
 * comments-data.ts — 承認・予定 (CM01) の「自分宛の未解決コメント」。
 *
 * 自分が作った・直した文書に付いた未解決の行コメントを集める。GitHub の
 * 「レビュー待ち」相当で、自分が書いたものへの指摘を取りこぼさないためのもの。
 * 自分で自分に付けたコメントは出さない。
 */

import { sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";

export interface InboxCommentRow {
  pageNumber: string;
  pageTitle: string;
  line: number | null;
  anchorLine: number;
  body: string;
  author: string | null;
  createdAt: string;
}

export async function fetchInboxComments(): Promise<InboxCommentRow[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  try {
    const rows = await prisma.internalPageLineComment.findMany({
      where: {
        status: "OPEN",
        // 自分の独り言は「やること」ではない。
        createdBy: { not: userId },
        page: {
          OR: [{ createdBy: userId }, { updatedBy: userId }],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        anchorLine: true,
        currentLine: true,
        body: true,
        createdAt: true,
        page: { select: { pageNumber: true, title: true } },
        createdByUser: { select: { displayName: true, username: true } },
      },
    });
    return rows.map((r) => ({
      pageNumber: r.page.pageNumber,
      pageTitle: r.page.title,
      line: r.currentLine,
      anchorLine: r.anchorLine,
      body: r.body,
      author: r.createdByUser
        ? r.createdByUser.displayName || r.createdByUser.username
        : null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
