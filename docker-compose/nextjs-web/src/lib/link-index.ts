/**
 * link-index.ts — 外部リンクの索引（短縮リンク）とブロック指定。server-only.
 *
 * リッチテキスト中の外部 URL は保存時に `/l/<code>` へ置き換え、実 URL は
 * `app.link_index` だけが持つ。閲覧者はいきなり外部へ飛ばされず、
 * `/l/<code>` の確認ページで遷移先を見てから続行する。
 *
 * **ブロックはクリック時にも判定する**（`resolveShortLink`）。保存時だけの
 * 判定にすると、後からブラックリストへ足したドメインが既存のリンクに効かない。
 */

import "server-only";

import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { generateCode, normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import {
  hostnameOf,
  matchBlacklist,
  normalizeBlacklistPattern,
  normalizeUrl,
} from "@/lib/link-index-core";
import { SHORT_LINK_PREFIX } from "@/lib/rich-text-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

/** 短縮コードの長さ（32 文字アルファベット ⇒ 8 文字で約 10^12 通り）。 */
const CODE_LENGTH = 8;

/** コード衝突時の再試行回数。 */
const MAX_CODE_ATTEMPTS = 5;

/** ブラックリスト管理に必要な権限コード（システム管理者向け）。 */
const BLACKLIST_PERMISSION = "system";

/** 有効なブロックパターン一覧（判定用）。 */
async function activePatterns(): Promise<string[]> {
  const rows = await prisma.linkBlacklist.findMany({
    where: { isActive: true },
    select: { pattern: true },
  });
  return rows.map((r) => r.pattern);
}

export interface BlockedLink {
  url: string;
  hostname: string;
  pattern: string;
  reason: string | null;
}

/** URL 群のうちブロック対象を返す（保存前チェック用）。 */
export async function findBlockedLinks(
  urls: readonly string[],
): Promise<BlockedLink[]> {
  if (urls.length === 0) return [];
  const rows = await prisma.linkBlacklist.findMany({
    where: { isActive: true },
    select: { pattern: true, reason: true },
  });
  if (rows.length === 0) return [];
  const patterns = rows.map((r) => r.pattern);

  const blocked: BlockedLink[] = [];
  for (const url of urls) {
    const host = hostnameOf(url);
    if (!host) continue;
    const hit = matchBlacklist(host, patterns);
    if (hit) {
      blocked.push({
        url,
        hostname: host,
        pattern: hit,
        reason: rows.find((r) => r.pattern === hit)?.reason ?? null,
      });
    }
  }
  return blocked;
}

/**
 * URL 群を索引に登録し、`元URL → /l/<code>` の対応表を返す。
 * 同じ URL には同じコードを再利用する（url は UNIQUE）。
 *
 * 呼び出し側は事前に `findBlockedLinks` でブロック判定を済ませること。
 */
export async function mintShortLinks(
  urls: readonly string[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const actor = await getCurrentActorId();

  for (const raw of urls) {
    const url = normalizeUrl(raw);
    if (!url) continue; // http(s) 以外（mailto 等）は短縮しない
    const hostname = hostnameOf(url);
    if (!hostname) continue;

    const existing = await prisma.linkIndex.findUnique({
      where: { url },
      select: { code: true },
    });
    if (existing) {
      map[raw] = `${SHORT_LINK_PREFIX}${existing.code}`;
      continue;
    }

    // コードは乱数なので、まれな衝突は数回まで再試行する。
    let created: { code: string } | null = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !created; attempt++) {
      const code = generateCode(CODE_LENGTH);
      try {
        created = await prisma.linkIndex.create({
          data: { code, url, hostname, createdBy: actor },
          select: { code: true },
        });
      } catch (e) {
        // P2002 = unique 制約違反。url 側の競合なら既存を拾い直す。
        const conflict = await prisma.linkIndex.findUnique({
          where: { url },
          select: { code: true },
        });
        if (conflict) {
          created = conflict;
          break;
        }
        if (attempt === MAX_CODE_ATTEMPTS - 1) throw e;
      }
    }
    if (created) map[raw] = `${SHORT_LINK_PREFIX}${created.code}`;
  }
  return map;
}

export type ResolvedLink =
  | { status: "ok"; url: string; hostname: string }
  | { status: "blocked"; url: string; hostname: string; reason: string | null }
  | { status: "not-found" };

/**
 * 短縮コードを実 URL に解決する（確認ページ用）。
 * **ここでブロック判定を行う**ので、後から追加したルールも既存リンクに効く。
 */
export async function resolveShortLink(rawCode: string): Promise<ResolvedLink> {
  const code = normalizeCode(rawCode);
  if (!code) return { status: "not-found" };

  const row = await prisma.linkIndex.findUnique({
    where: { code },
    select: { url: true, hostname: true },
  });
  if (!row) return { status: "not-found" };

  const rows = await prisma.linkBlacklist.findMany({
    where: { isActive: true },
    select: { pattern: true, reason: true },
  });
  const hit = matchBlacklist(
    row.hostname,
    rows.map((r) => r.pattern),
  );
  if (hit) {
    return {
      status: "blocked",
      url: row.url,
      hostname: row.hostname,
      reason: rows.find((r) => r.pattern === hit)?.reason ?? null,
    };
  }
  return { status: "ok", url: row.url, hostname: row.hostname };
}

/** 「続行」が押されたときの利用記録（ベストエフォート — 失敗しても遷移は妨げない）。 */
export async function recordShortLinkHit(rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode);
  if (!code) return;
  try {
    await prisma.linkIndex.update({
      where: { code },
      data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  } catch (e) {
    console.error("recordShortLinkHit failed", e);
  }
}

// ── ブラックリスト管理（システム管理者） ───────────────────────────────

export interface BlacklistRow {
  id: string;
  pattern: string;
  reason: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  /** この指定に一致する索引済みリンク数（影響範囲の目安）。 */
  matchCount: number;
}

/** ブロック指定一覧（管理画面）。失敗時は空配列。 */
export async function listBlacklist(): Promise<BlacklistRow[]> {
  try {
    const [rows, links] = await Promise.all([
      prisma.linkBlacklist.findMany({
        orderBy: { pattern: "asc" },
        include: { createdByUser: { select: { displayName: true } } },
      }),
      prisma.linkIndex.findMany({ select: { hostname: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      reason: r.reason,
      isActive: r.isActive,
      createdBy: r.createdByUser?.displayName ?? "システム",
      createdAt: r.createdAt.toISOString(),
      matchCount: links.filter((l) => matchBlacklist(l.hostname, [r.pattern]))
        .length,
    }));
  } catch (e) {
    console.error("listBlacklist failed", e);
    return [];
  }
}

/** ブロック指定を追加する。 */
export async function addBlacklistEntry(input: {
  pattern: string;
  reason?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const authz = await checkPermission(BLACKLIST_PERMISSION, "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const pattern = normalizeBlacklistPattern(input.pattern);
  if (!pattern) {
    return actionError("ホスト名の形式で入力してください（例: evil.example）");
  }
  try {
    const row = await prisma.linkBlacklist.create({
      data: {
        pattern,
        reason: input.reason?.trim() || null,
        createdBy: authz.userId,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "link_blacklist",
      recordId: pattern,
      after: { note: `リンクをブロック: ${pattern}` },
    });
    return actionOk({ id: row.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "追加に失敗しました"));
  }
}

/** ブロック指定の有効 / 無効を切り替える。 */
export async function setBlacklistActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission(BLACKLIST_PERMISSION, "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const row = await prisma.linkBlacklist.update({
      where: { id },
      data: { isActive },
      select: { pattern: true },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "link_blacklist",
      recordId: row.pattern,
      after: {
        note: `リンクブロックを${isActive ? "有効化" : "無効化"}: ${row.pattern}`,
      },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "更新に失敗しました"));
  }
}

/** ブロック指定を削除する。 */
export async function deleteBlacklistEntry(id: string): Promise<ActionResult> {
  const authz = await checkPermission(BLACKLIST_PERMISSION, "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const row = await prisma.linkBlacklist.delete({
      where: { id },
      select: { pattern: true },
    });
    await recordAudit({
      action: "DELETE",
      tableName: "link_blacklist",
      recordId: row.pattern,
      before: { note: `リンクブロックを削除: ${row.pattern}` },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "削除に失敗しました"));
  }
}

export interface LinkIndexRow {
  code: string;
  url: string;
  hostname: string;
  hitCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  blocked: boolean;
}

/** 索引済みリンク一覧（管理画面。新しい順・上限つき）。 */
export async function listIndexedLinks(limit = 200): Promise<LinkIndexRow[]> {
  try {
    const [rows, patterns] = await Promise.all([
      prisma.linkIndex.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      activePatterns(),
    ]);
    return rows.map((r) => ({
      code: r.code,
      url: r.url,
      hostname: r.hostname,
      hitCount: r.hitCount,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      blocked: matchBlacklist(r.hostname, patterns) !== null,
    }));
  } catch (e) {
    console.error("listIndexedLinks failed", e);
    return [];
  }
}
