/**
 * api-deletions-core.ts — `GET /api/v1/deletions` が返す「消えた行の `id`」を
 * 監査行から組み立てる純関数。
 *
 * 一覧・詳細の口は行の主キーを `id` として返す（書類は uuid、マスタは int /
 * uuid）。連携先はそれで行を突き合わせるので、削除の通知にも**同じ `id`**が
 * 載っていないと、どの行を消せばよいか決められない（番号は法人をまたいで
 * 重なり、`key` は書類では `CKK/DOR-…` の参照で `id` とは別物）。
 *
 * 出どころは 2 通り:
 *  - マスタ（監査の解決方法が identity の表）… `record_key` がそのまま主キー。
 *    数字だけなら一覧と同じく数値で返す（int PK）。
 *  - 書類 … 番号で記録されるので `record_key` は参照。削除のときに
 *    `before_data.id`（uuid）を残してもらい、それを返す
 *    （`deleteDeliveryOrder` が書く）。残っていない古い行は `null`。
 */

import { AUDIT_KEY_SHAPES } from "./audit-record-key-core";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deletedRowId(
  tableName: string,
  recordKey: string | null,
  beforeData: unknown,
): string | number | null {
  if (AUDIT_KEY_SHAPES[tableName] === "identity") {
    if (!recordKey) return null;
    return /^\d+$/.test(recordKey) ? Number(recordKey) : recordKey;
  }
  const id =
    beforeData && typeof beforeData === "object" && !Array.isArray(beforeData)
      ? (beforeData as Record<string, unknown>).id
      : undefined;
  return typeof id === "string" && UUID_RE.test(id) ? id : null;
}
