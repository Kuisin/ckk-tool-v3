/**
 * doc-key.ts — route handler が受け取った書類の id → 鍵（server-only）。
 *
 * 画面は id（`CKK~QOT-2026-00001`）を渡すので {@link parseDocKey} だけで決まる。
 * 外から来る値（古いメールのリンク・手で打った URL）は番号だけ・旧番号の
 * ことがあるので、そのときだけ DB を引く（lib/doc-ref.ts resolveDocId）。
 *
 * 同じ番号が複数の法人にあるときは **null**（＝見つからない）。黙ってどれかの
 * 法人の書類を返さない。
 *
 * route.ts ではないので口にはならない。
 */

import { type DocKey, type DocPrefix, parseDocKey } from "@/lib/doc-number";
import { resolveDocId } from "@/lib/doc-ref";

export async function docKeyFromRequest(
  type: string,
  prefix: DocPrefix,
  id: string,
): Promise<DocKey | null> {
  const key = parseDocKey(id, prefix);
  if (key) return key;
  const resolved = await resolveDocId(type, id).catch(() => null);
  return resolved?.status === "ok" ? { docRef: resolved.docRef } : null;
}
