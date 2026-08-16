/**
 * document-memos.ts — 文書メモ / コメント（app.document_memos）の読み書き。server-only.
 *
 * owner は attachments / audit_logs と同じ多態参照:
 *   ownerType = テーブル名（@@map 値。例: "quotes"）
 *   ownerId   = 業務キー文字列（QOT-… / EST-… / 指示書番号 / エントリキー）
 * 各詳細ページが `fetchAuditEntries` に渡しているのと**同じ値**を使うこと。
 *
 * 2 形態:
 *   MEMO    … 1 文書 1 件の共有欄。UPDATE 権限があれば誰でも編集できる
 *   COMMENT … 投稿スレッド（新しい順）。編集・削除・アーカイブは投稿者本人
 *             （または ADMIN）のみ
 *
 * 権限は操作ごとに分ける（同じ文書でも「直せるが消せない」を作れる）:
 *   投稿・編集     → <code>:UPDATE
 *   削除           → <code>:DELETE
 *   アーカイブ復元 → <code>:UPDATE（削除ではなく畳むだけなので UPDATE 側）
 *
 * 本文は ProseMirror JSON のまま保存し、保存前に必ず
 * `parseRichText`（lib/rich-text-core）の許可リスト検証を通す。
 */

import "server-only";

import { actorAvatarUrl, getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission, type PermissionAction } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  findBlockedLinks,
  mintShortLinks,
  resolveShortLinkTargets,
  type ShortLinkTarget,
} from "@/lib/link-index";
import {
  collectLinkHrefs,
  describeStructure,
  isEmptyDoc,
  isIndexableUrl,
  isShortLink,
  parseRichText,
  type RichTextDoc,
  rewriteLinkHrefs,
  SHORT_LINK_PREFIX,
} from "@/lib/rich-text-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

export type MemoKind = "MEMO" | "COMMENT";

/**
 * メモを持てる owner の登録簿 — ここが唯一の真実。
 * `permission` は各画面の actions.ts が使っている permission_code と揃える
 * （揃っていないと「文書は編集できないのにメモは書ける」等のズレが出る）。
 */
const MEMO_OWNERS: Record<string, { permission: string; kind: MemoKind }> = {
  quotes: { permission: "quote", kind: "MEMO" },
  sales_orders: { permission: "work_order", kind: "MEMO" },
  work_orders: { permission: "work_order", kind: "MEMO" },
  shipping_orders: { permission: "shipping_order", kind: "MEMO" },
  invoices: { permission: "invoice", kind: "MEMO" },
  price_list_entries: { permission: "price_list", kind: "COMMENT" },
  estimates: { permission: "price_list", kind: "COMMENT" },
};

/** owner の種別（MEMO / COMMENT）。未登録なら null。 */
export function memoKindFor(ownerType: string): MemoKind | null {
  return MEMO_OWNERS[ownerType]?.kind ?? null;
}

/** 投稿者情報（顔写真は履歴タブと同じ解決規則）。 */
const USER_SELECT = {
  select: {
    id: true,
    displayName: true,
    avatarFileId: true,
    avatarThumbFileId: true,
  },
} as const;

type UserRow = {
  id: string;
  displayName: string;
  avatarFileId: string | null;
  avatarThumbFileId: string | null;
};

/** クライアントへ渡す 1 件分の view model。 */
export interface MemoView {
  id: string;
  content: RichTextDoc;
  /** 投稿者の表示名（不明ならシステム）。 */
  authorName: string;
  /** 投稿者の顔写真（小）。未設定なら null → イニシャル表示。 */
  authorAvatarUrl: string | null;
  /** 最終更新者の表示名（作成者と同じなら null）。 */
  editorName: string | null;
  /** ISO タイムスタンプ。 */
  createdAt: string;
  updatedAt: string;
  /** アーカイブ日時（非 null = 折りたたみ表示）。 */
  archivedAt: string | null;
  /** アーカイブした人の表示名。 */
  archivedByName: string | null;
  /** 現在のユーザーがこの行を編集してよいか（<code>:UPDATE + 本人 or ADMIN）。 */
  canEdit: boolean;
  /** 現在のユーザーがこの行を削除してよいか（<code>:DELETE + 本人 or ADMIN）。 */
  canDelete: boolean;
  /** 現在のユーザーがこの行をアーカイブ / 復元してよいか（COMMENT のみ）。 */
  canArchive: boolean;
  /**
   * 本文中の短縮リンク（コード → 遷移先）。閲覧時にホバーで実 URL を
   * 見せるために持つ — クリックするまで行き先が分からないのは短縮リンクの
   * 弱点なので、表示側で補う。
   */
  linkTargets: Record<string, ShortLinkTarget>;
}

export interface SaveMemoInput {
  ownerType: string;
  ownerId: string;
  /** 既存行の更新なら指定。COMMENT の新規投稿では省略する。 */
  id?: string;
  content: unknown;
}

interface Actor {
  userId: string;
  isAdmin: boolean;
}

/** 指定アクションの権限を確認し、実行者（+ADMIN か）を返す。 */
async function actorFor(
  permission: string,
  action: PermissionAction,
): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const authz = await checkPermission(permission, action);
  if (!authz.ok) return { ok: false, error: authz.error };
  const admin = await checkPermission(permission, "ADMIN");
  return { ok: true, actor: { userId: authz.userId, isAdmin: admin.ok } };
}

/** 本文中の短縮リンク（`/l/<code>`）のコードを取り出す。 */
function shortLinkCodesIn(doc: RichTextDoc | null): string[] {
  if (!doc) return [];
  return collectLinkHrefs(doc)
    .filter(isShortLink)
    .map((href) => href.slice(SHORT_LINK_PREFIX.length));
}

/** doc に出てくるコードぶんだけを抜き出す（行ごとの view model 用）。 */
function pickTargets(
  doc: RichTextDoc | null,
  all: Record<string, ShortLinkTarget>,
): Record<string, ShortLinkTarget> {
  const picked: Record<string, ShortLinkTarget> = {};
  for (const code of shortLinkCodesIn(doc)) {
    if (all[code]) picked[code] = all[code];
  }
  return picked;
}

/** COMMENT は投稿者本人（or ADMIN）だけが触れる。MEMO は共有欄なので誰でも可。 */
function mayMutate(
  kind: string,
  createdBy: string | null,
  actor: Actor,
): boolean {
  if (kind === "MEMO") return true;
  return actor.isAdmin || createdBy === actor.userId;
}

/**
 * メモ一覧。COMMENT は**新しい順**（チャット履歴と同じ向き）、MEMO は 0 件か 1 件。
 * 失敗時は空配列（詳細画面を壊さない — attachments と同じ方針）。
 */
export async function listMemos(
  ownerType: string,
  ownerId: string,
): Promise<MemoView[]> {
  const owner = MEMO_OWNERS[ownerType];
  if (!owner) return [];
  try {
    const [rows, actorId, canUpdate, canDelete, isAdmin] = await Promise.all([
      prisma.documentMemo.findMany({
        where: { ownerType, ownerId },
        // COMMENT は新しい順。MEMO は 1 件なので実質どちらでも同じ。
        orderBy: { createdAt: "desc" },
        include: {
          createdByUser: USER_SELECT,
          updatedByUser: { select: { displayName: true } },
          archivedByUser: { select: { displayName: true } },
        },
      }),
      getCurrentActorId(),
      checkPermission(owner.permission, "UPDATE").then((r) => r.ok),
      checkPermission(owner.permission, "DELETE").then((r) => r.ok),
      checkPermission(owner.permission, "ADMIN").then((r) => r.ok),
    ]);
    const actor: Actor = { userId: actorId ?? "", isAdmin };

    // 本文中の短縮リンクをまとめて解決する（行ごとに引くと N+1 になる）。
    const targets = await resolveShortLinkTargets(
      rows.flatMap((r) =>
        shortLinkCodesIn(r.content as unknown as RichTextDoc),
      ),
    );

    return rows.map((r) => {
      const mine = mayMutate(r.kind, r.createdBy, actor);
      const doc = r.content as unknown as RichTextDoc;
      return {
        id: r.id,
        // 保存時に parseRichText を通した doc のみが入る。万一壊れた行があっても
        // RichTextView / isEmptyDoc は未知の形を無視するので表示は壊れない。
        content: r.content as unknown as RichTextDoc,
        authorName: r.createdByUser?.displayName ?? "システム",
        authorAvatarUrl: r.createdByUser
          ? actorAvatarUrl(r.createdByUser as UserRow)
          : null,
        editorName:
          r.updatedBy && r.updatedBy !== r.createdBy
            ? (r.updatedByUser?.displayName ?? "システム")
            : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        archivedAt: r.archivedAt?.toISOString() ?? null,
        archivedByName: r.archivedByUser?.displayName ?? null,
        canEdit: canUpdate && mine,
        canDelete: canDelete && mine,
        canArchive: r.kind === "COMMENT" && canUpdate && mine,
        linkTargets: pickTargets(doc, targets),
      };
    });
  } catch (e) {
    console.error("listMemos failed", e);
    return [];
  }
}

/**
 * メモ / コメントを保存する（<code>:UPDATE）。
 *
 * MEMO は owner ごとに **1 件**へ寄せる（`findFirst` → update / create）。
 * 単一性を DB の部分 UNIQUE で縛らないのは、Prisma がそれを表現できず
 * migration.sql に手書きすると `migrate diff` が濁るため。同時実行で二重作成
 * されないよう、探索と作成は 1 トランザクションにまとめる。
 */
export async function saveMemo(
  input: SaveMemoInput,
): Promise<ActionResult<{ id: string }>> {
  const ownerType = input.ownerType.trim();
  const ownerId = input.ownerId.trim();
  const owner = MEMO_OWNERS[ownerType];
  if (!owner || !ownerId) return actionError("メモの対象が不正です");

  const auth = await actorFor(owner.permission, "UPDATE");
  if (!auth.ok) return actionError(auth.error);
  const actor = auth.actor;

  const parsed = parseRichText(input.content);
  if (!parsed.ok) {
    // 弾かれた本文はサーバーログにも残す（利用者のトーストだけでは
    // どのノードが原因か追えないため）。本文そのものは出さない。
    console.error("saveMemo: rejected content", {
      ownerType,
      ownerId,
      detail: parsed.detail ?? parsed.error,
      // 構造だけ（本文は出さない）。zod のメッセージだけでは
      // 「どの型の値が来たのか」まで辿れないことがある。
      structure: describeStructure(input.content),
    });
    return actionError(parsed.error);
  }
  if (isEmptyDoc(parsed.doc)) return actionError("本文を入力してください");

  const label = owner.kind === "MEMO" ? "メモ" : "コメント";

  // 外部 URL は索引に登録して `/l/<code>` へ置き換える。ブロック対象は
  // ここで弾く（クリック時にも再判定するので、後から足したルールも効く）。
  const externalUrls = collectLinkHrefs(parsed.doc).filter(isIndexableUrl);
  let doc = parsed.doc;
  if (externalUrls.length > 0) {
    const blocked = await findBlockedLinks(externalUrls);
    if (blocked.length > 0) {
      const first = blocked[0];
      return actionError(
        `このリンクは登録できません（${first.hostname}）${
          first.reason ? `: ${first.reason}` : ""
        }`,
      );
    }
    doc = rewriteLinkHrefs(parsed.doc, await mintShortLinks(externalUrls));
  }

  const content = doc as unknown as object;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // 更新対象の決定: 明示 id > MEMO の既存行 > 新規。
      const existing = input.id
        ? await tx.documentMemo.findUnique({ where: { id: input.id } })
        : owner.kind === "MEMO"
          ? await tx.documentMemo.findFirst({
              where: { ownerType, ownerId, kind: "MEMO" },
              orderBy: { createdAt: "asc" },
            })
          : null;

      if (!existing) {
        const row = await tx.documentMemo.create({
          data: {
            ownerType,
            ownerId,
            kind: owner.kind,
            content,
            plainText: parsed.plainText,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          select: { id: true },
        });
        // 証跡は本体と同一トランザクションで積む（片方だけ残らないように）。
        await tx.documentMemoRevision.create({
          data: {
            memoId: row.id,
            ownerType,
            ownerId,
            kind: owner.kind,
            action: "CREATE",
            content,
            plainText: parsed.plainText,
            editedBy: actor.userId,
          },
        });
        return { created: true as const, id: row.id, before: null };
      }

      if (existing.ownerType !== ownerType || existing.ownerId !== ownerId) {
        throw new MemoError("メモの対象が一致しません");
      }
      if (!mayMutate(existing.kind, existing.createdBy, actor)) {
        throw new MemoError("他のユーザーの投稿は編集できません");
      }
      const row = await tx.documentMemo.update({
        where: { id: existing.id },
        data: { content, plainText: parsed.plainText, updatedBy: actor.userId },
        select: { id: true },
      });
      await tx.documentMemoRevision.create({
        data: {
          memoId: row.id,
          ownerType,
          ownerId,
          kind: existing.kind,
          action: "UPDATE",
          content,
          plainText: parsed.plainText,
          editedBy: actor.userId,
        },
      });
      return {
        created: false as const,
        id: row.id,
        before: existing.plainText,
      };
    });

    await recordAudit({
      action: "UPDATE",
      tableName: ownerType,
      recordId: ownerId,
      before: outcome.created
        ? undefined
        : { note: `${label}を更新（変更前）`, text: outcome.before },
      after: {
        note: `${label}を${outcome.created ? "追加" : "更新"}`,
        text: parsed.plainText,
      },
    });
    return actionOk({ id: outcome.id });
  } catch (e) {
    if (e instanceof MemoError) return actionError(e.message);
    return actionError(prismaErrorMessage(e, `${label}の保存に失敗しました`));
  }
}

/** トランザクション内から利用者向けメッセージを返すための内部エラー。 */
class MemoError extends Error {}

/** 改訂履歴 1 件（証跡ビュー）。 */
export interface MemoRevisionView {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "ARCHIVE" | "RESTORE";
  content: RichTextDoc;
  editorName: string;
  editorAvatarUrl: string | null;
  editedAt: string;
}

/**
 * 1 件のメモ / コメントの改訂履歴（新しい順）。
 *
 * 閲覧はその文書の READ 権限で足りる（書き換えの証跡は、その文書を読める人が
 * 確認できるべきもの）。本体が削除済みでも履歴は残るため、memoId で引く。
 */
export async function listMemoRevisions(
  ownerType: string,
  memoId: string,
): Promise<MemoRevisionView[]> {
  const owner = MEMO_OWNERS[ownerType];
  if (!owner) return [];
  const authz = await checkPermission(owner.permission, "READ");
  if (!authz.ok) return [];

  try {
    const rows = await prisma.documentMemoRevision.findMany({
      where: { memoId },
      orderBy: { editedAt: "desc" },
      include: { editedByUser: USER_SELECT },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action as MemoRevisionView["action"],
      content: r.content as unknown as RichTextDoc,
      editorName: r.editedByUser?.displayName ?? "システム",
      editorAvatarUrl: r.editedByUser
        ? actorAvatarUrl(r.editedByUser as UserRow)
        : null,
      editedAt: r.editedAt.toISOString(),
    }));
  } catch (e) {
    console.error("listMemoRevisions failed", e);
    return [];
  }
}

/** メモ / コメントを削除する（<code>:DELETE、COMMENT は本人 or ADMIN のみ）。 */
export async function deleteMemo(id: string): Promise<ActionResult> {
  try {
    const row = await prisma.documentMemo.findUnique({ where: { id } });
    if (!row) return actionError("対象が見つかりません");

    const owner = MEMO_OWNERS[row.ownerType];
    if (!owner) return actionError("メモの対象が不正です");

    const auth = await actorFor(owner.permission, "DELETE");
    if (!auth.ok) return actionError(auth.error);
    if (!mayMutate(row.kind, row.createdBy, auth.actor)) {
      return actionError("他のユーザーの投稿は削除できません");
    }

    // 削除の証跡を先に積んでから本体を消す（memo_id は ON DELETE SET NULL
    // なので、行は残り memo_id だけが外れる）。content は削除直前の本文。
    await prisma.$transaction(async (tx) => {
      await tx.documentMemoRevision.create({
        data: {
          memoId: row.id,
          ownerType: row.ownerType,
          ownerId: row.ownerId,
          kind: row.kind,
          action: "DELETE",
          content: row.content as object,
          plainText: row.plainText,
          editedBy: auth.actor.userId,
        },
      });
      await tx.documentMemo.delete({ where: { id } });
    });

    await recordAudit({
      action: "UPDATE",
      tableName: row.ownerType,
      recordId: row.ownerId,
      before: {
        note: `${row.kind === "MEMO" ? "メモ" : "コメント"}を削除`,
        text: row.plainText,
      },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "削除に失敗しました"));
  }
}

/**
 * コメントをアーカイブ / 復元する（<code>:UPDATE、本人 or ADMIN のみ）。
 * 削除ではなく「畳む」— 本文は残り、展開すれば読める。
 */
export async function setMemoArchived(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  try {
    const row = await prisma.documentMemo.findUnique({ where: { id } });
    if (!row) return actionError("対象が見つかりません");
    if (row.kind !== "COMMENT") {
      return actionError("メモはアーカイブできません");
    }

    const owner = MEMO_OWNERS[row.ownerType];
    if (!owner) return actionError("メモの対象が不正です");

    const auth = await actorFor(owner.permission, "UPDATE");
    if (!auth.ok) return actionError(auth.error);
    if (!mayMutate(row.kind, row.createdBy, auth.actor)) {
      return actionError("他のユーザーの投稿は操作できません");
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentMemo.update({
        where: { id },
        data: {
          archivedAt: archived ? new Date() : null,
          archivedBy: archived ? auth.actor.userId : null,
        },
      });
      await tx.documentMemoRevision.create({
        data: {
          memoId: row.id,
          ownerType: row.ownerType,
          ownerId: row.ownerId,
          kind: row.kind,
          action: archived ? "ARCHIVE" : "RESTORE",
          content: row.content as object,
          plainText: row.plainText,
          editedBy: auth.actor.userId,
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: row.ownerType,
      recordId: row.ownerId,
      after: {
        note: `コメントを${archived ? "アーカイブ" : "復元"}`,
        text: row.plainText,
      },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "操作に失敗しました"));
  }
}
