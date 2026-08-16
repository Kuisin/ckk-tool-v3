"use server";

/**
 * Server Actions — リンク管理（SY0B）。
 * 権限チェック・監査記録は lib/link-index.ts 側で行う。
 */

import { revalidatePath } from "next/cache";
import {
  addBlacklistEntry,
  deleteBlacklistEntry,
  setBlacklistActive,
} from "@/lib/link-index";
import type { ActionResult } from "@/lib/server-action";

const BASE_PATH = "/settings/links";

export async function addBlacklistAction(input: {
  pattern: string;
  reason?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const result = await addBlacklistEntry(input);
  if (result.ok) revalidatePath(BASE_PATH);
  return result;
}

export async function setBlacklistActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const result = await setBlacklistActive(id, isActive);
  if (result.ok) revalidatePath(BASE_PATH);
  return result;
}

export async function deleteBlacklistAction(id: string): Promise<ActionResult> {
  const result = await deleteBlacklistEntry(id);
  if (result.ok) revalidatePath(BASE_PATH);
  return result;
}
