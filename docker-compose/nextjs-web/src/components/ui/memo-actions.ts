"use server";

/**
 * Server Actions — 文書メモ / コメント（MemoPanel から呼ぶ）。
 *
 * 権限チェック・入力検証・監査記録はすべて lib/document-memos.ts 側で行う
 * （このファイルは "use server" の境界を作るだけの薄いラッパ）。
 *
 * 本文は ProseMirror JSON なので Server Action の 1MB ボディ上限には収まる
 * （平文 20,000 文字上限 — lib/rich-text-core.MAX_PLAIN_TEXT_LENGTH）。
 */

import {
  deleteMemo,
  type SaveMemoInput,
  saveMemo,
  setMemoArchived,
} from "@/lib/document-memos";
import type { ActionResult } from "@/lib/server-action";

export async function saveMemoAction(
  input: SaveMemoInput,
): Promise<ActionResult<{ id: string }>> {
  return saveMemo(input);
}

export async function deleteMemoAction(id: string): Promise<ActionResult> {
  return deleteMemo(id);
}

export async function setMemoArchivedAction(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  return setMemoArchived(id, archived);
}
