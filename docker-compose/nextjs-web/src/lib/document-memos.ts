/**
 * document-memos.ts — 文書メモ / コメント（app.document_memos）の読み書き。server-only.
 *
 * owner は attachments / audit_logs と同じ多態参照:
 *   ownerType = テーブル名（@@map 値。例: "quotes"）
 *   ownerId   = 業務キー文字列（QOT-… / EST-… / 指示書番号 / エントリキー）
 * 各詳細ページが `fetchAuditEntries` に渡しているのと**同じ値**を使うこと。
 *
 * 2 形態:
 *   MEMO    … 1 文書 1 件。誰でも編集できる共有の申し送り欄
 *   COMMENT … 投稿スレッド。編集・削除は投稿者本人（または ADMIN）のみ
 *
 * 本文は ProseMirror JSON のまま保存し、保存前に必ず
 * `parseRichText`（lib/rich-text-core）の許可リスト検証を通す。
 */

import "server-only";

import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  isEmptyDoc,
  parseRichText,
  type RichTextDoc,
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

/** クライアントへ渡す 1 件分の view model。 */
export interface MemoView {
  id: string;
  content: RichTextDoc;
  /** 投稿者の表示名（不明ならシステム）。 */
  authorName: string;
  /** 最終更新者の表示名（作成者と同じなら null）。 */
  editorName: string | null;
  /** ISO タイムスタンプ。 */
  createdAt: string;
  updatedAt: string;
  /** 現在のユーザーがこの行を編集・削除してよいか。 */
  canEdit: boolean;
}

export interface SaveMemoInput {
  ownerType: string;
  ownerId: string;
  /** 既存行の更新なら指定。COMMENT の新規投稿では省略する。 */
  id?: string;
  content: unknown;
}

/** 権限判定に使う「現在のユーザー + 管理者か」。 */
async function actorFor(
  permission: string,
): Promise<
  { ok: true; userId: string; isAdmin: boolean } | { ok: false; error: string }
> {
  const authz = await checkPermission(permission, "UPDATE");
  if (!authz.ok) return { ok: false, error: authz.error };
  const admin = await checkPermission(permission, "ADMIN");
  return { ok: true, userId: authz.userId, isAdmin: admin.ok };
}

/**
 * メモ一覧（古い順 — スレッドは読み進める向きに並べる）。
 * MEMO の owner では 0 件または 1 件になる。
 * 失敗時は空配列（詳細画面を壊さない — attachments と同じ方針）。
 */
export async function listMemos(
  ownerType: string,
  ownerId: string,
): Promise<MemoView[]> {
  if (!MEMO_OWNERS[ownerType]) return [];
  try {
    const [rows, actor] = await Promise.all([
      prisma.documentMemo.findMany({
        where: { ownerType, ownerId },
        orderBy: { createdAt: "asc" },
        include: {
          createdByUser: { select: { displayName: true } },
          updatedByUser: { select: { displayName: true } },
        },
      }),
      getCurrentActorId(),
    ]);
    const { kind, permission } = MEMO_OWNERS[ownerType];
    // MEMO は共有欄なので誰でも編集可、COMMENT は投稿者本人（+ADMIN）のみ。
    const isAdmin =
      kind === "COMMENT"
        ? (await checkPermission(permission, "ADMIN")).ok
        : false;

    return rows.map((r) => ({
      id: r.id,
      // 保存時に parseRichText を通した doc のみが入る。万一壊れた行があっても
      // RichTextView / isEmptyDoc は未知の形を無視するので表示は壊れない。
      content: r.content as unknown as RichTextDoc,
      authorName: r.createdByUser?.displayName ?? "システム",
      editorName:
        r.updatedBy && r.updatedBy !== r.createdBy
          ? (r.updatedByUser?.displayName ?? "システム")
          : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      canEdit:
        kind === "MEMO"
          ? true
          : isAdmin || (actor != null && r.createdBy === actor),
    }));
  } catch (e) {
    console.error("listMemos failed", e);
    return [];
  }
}

/**
 * メモ / コメントを保存する。
 *
 * MEMO は owner ごとに 1 件へ寄せる（`findFirst` → update / create）。
 * 単一性を DB の部分 UNIQUE で縛らないのは、Prisma がそれを表現できず
 * migration.sql に手書きすると `migrate diff` が濁るため。
 */
export async function saveMemo(
  input: SaveMemoInput,
): Promise<ActionResult<{ id: string }>> {
  const ownerType = input.ownerType.trim();
  const ownerId = input.ownerId.trim();
  const owner = MEMO_OWNERS[ownerType];
  if (!owner || !ownerId) return actionError("メモの対象が不正です");

  const actor = await actorFor(owner.permission);
  if (!actor.ok) return actionError(actor.error);

  const parsed = parseRichText(input.content);
  if (!parsed.ok) return actionError(parsed.error);
  if (isEmptyDoc(parsed.doc)) return actionError("本文を入力してください");

  const label = owner.kind === "MEMO" ? "メモ" : "コメント";
  const content = parsed.doc as unknown as object;

  try {
    // 更新対象の決定: 明示 id > MEMO の既存行 > 新規。
    const existing = input.id
      ? await prisma.documentMemo.findUnique({ where: { id: input.id } })
      : owner.kind === "MEMO"
        ? await prisma.documentMemo.findFirst({
            where: { ownerType, ownerId, kind: "MEMO" },
            orderBy: { createdAt: "asc" },
          })
        : null;

    if (existing) {
      if (existing.ownerType !== ownerType || existing.ownerId !== ownerId) {
        return actionError("メモの対象が一致しません");
      }
      // COMMENT の編集は投稿者本人（または ADMIN）のみ。
      if (
        existing.kind === "COMMENT" &&
        !actor.isAdmin &&
        existing.createdBy !== actor.userId
      ) {
        return actionError("他のユーザーの投稿は編集できません");
      }
      const row = await prisma.documentMemo.update({
        where: { id: existing.id },
        data: {
          content,
          plainText: parsed.plainText,
          updatedBy: actor.userId,
        },
        select: { id: true },
      });
      await recordAudit({
        action: "UPDATE",
        tableName: ownerType,
        recordId: ownerId,
        before: { note: `${label}を更新（変更前）`, text: existing.plainText },
        after: { note: `${label}を更新`, text: parsed.plainText },
      });
      return actionOk({ id: row.id });
    }

    const row = await prisma.documentMemo.create({
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
    await recordAudit({
      action: "UPDATE",
      tableName: ownerType,
      recordId: ownerId,
      after: { note: `${label}を追加`, text: parsed.plainText },
    });
    return actionOk({ id: row.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, `${label}の保存に失敗しました`));
  }
}

/** メモ / コメントを削除する（COMMENT は投稿者本人または ADMIN のみ）。 */
export async function deleteMemo(id: string): Promise<ActionResult> {
  try {
    const row = await prisma.documentMemo.findUnique({ where: { id } });
    if (!row) return actionError("対象が見つかりません");

    const owner = MEMO_OWNERS[row.ownerType];
    if (!owner) return actionError("メモの対象が不正です");

    const actor = await actorFor(owner.permission);
    if (!actor.ok) return actionError(actor.error);
    if (
      row.kind === "COMMENT" &&
      !actor.isAdmin &&
      row.createdBy !== actor.userId
    ) {
      return actionError("他のユーザーの投稿は削除できません");
    }

    await prisma.documentMemo.delete({ where: { id } });
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
