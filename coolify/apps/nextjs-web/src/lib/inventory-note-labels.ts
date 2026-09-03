/**
 * inventory-note-labels.ts — inventory-note-core.ts で符号化した notes を
 * 読み出し側（いま開いている人）の言語で解決する。**web 専用・twin ではない。**
 *
 * kiosk は書き込む側（inventory.ts 経由）だけで、これらを画面に出す機能を
 * 持たないので読み出し側の対応は web だけでよい。
 */

import type { Tr } from "./i18n";
import { decodeInventoryNote } from "./inventory-note-core";

/**
 * notes 列（またはそれに準ずる自由記入文字列）を表示用に解決する。
 * 構造化ノートでなければ（旧データ・人が書いた備考）そのまま返す。
 */
export function inventoryNoteLabel(
  tr: Tr,
  notes: string | null | undefined,
): string | null {
  if (!notes) return null;
  const decoded = decodeInventoryNote(notes);
  if (!decoded) return notes;
  return tr(`inventoryNote.${decoded.key}`, decoded.params ?? {});
}
