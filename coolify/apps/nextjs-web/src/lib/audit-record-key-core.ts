/**
 * audit-record-key-core.ts — 監査ログの「安定キー」を組み立てる純関数。
 *
 * `audit_logs.record_id` は表示用の業務識別子（`QOT-202608-00003` / ロット番号
 * `4711` / マスタの文字列 id）で、FK ではない。文書番号は
 * `app.numbering_sequences`（月次リセットの可変行 — Postgres の sequence では
 * ない）から払い出されるため、書類を削除して採番を戻すと同じ番号が再利用
 * される。`approval_requests`（同じ多態規約）で実際に起きた —
 * 削除済み書類の承認記録が新しい `ORD-202608-00003` に付いた
 * （[[approval-target-id-number-reuse]]）。
 *
 * そこで `record_id`（人が読む番号）とは別に `record_key`（テーブルの主キー）
 * を持つ。ここは **クエリを要しない形だけ** を解決する純関数 —
 * uuid / int / 文字列 PK はそのまま、複合 PK `(year_month, seq)` は
 * `"202608:3"`。1 クエリで解決する形（`numberToUuid`）は
 * `audit-record-key.ts`（server-only）が持つ。
 *
 * **340 箇所ある `recordAudit()` 呼び出し元は 1 つも変えない。** ここは
 * `recordAudit` / `fetchAuditEntries` の内側からだけ呼ばれる。
 */

import { parseDocKey } from "./doc-number";

/**
 * 表ごとの解決方法。
 *  - identity      … record_id がそのままキー（uuid / 連番 int / 文字列 PK）。
 *                    uuid・sequence 由来の int は再利用されない。
 *  - docKey        … `PFX-YYYYMM-NNNNN` ⇄ `"YYYYMM:seq"`（doc-number.ts と可逆）。
 *  - numberToUuid  … 保存済みの一意な番号 → uuid PK。1 クエリが要る
 *                    （audit-record-key.ts 側で解決）。
 *  - stripPrefix   … `"<enum>#<int>"` → 最後の `#` の後ろ。
 *  - uuidOnly      … uuid 形式のときだけ受理（不正な呼び出し元を無害化する）。
 *  - none          … このテーブル名には解決できるキーが無い（そもそも行が
 *                    無い / 別テーブルの鍵を書いてしまった旧コード）。
 */
export type AuditKeyShapeKind =
  | "identity"
  | "docKey"
  | "numberToUuid"
  | "stripPrefix"
  | "uuidOnly"
  | "none";

/**
 * 表名 → 解決方法の登録簿。**ここが唯一の真実** —
 * `src/lib/document-memos.ts` の `MEMO_OWNERS` と同じ形。
 *
 * `recordAudit` が書く `tableName` は 59 種（`src/lib/attachments.ts` /
 * `src/lib/document-memos.ts` の `ownerType` を含む）。ここに無い名前は
 * `undefined`（未登録）— 解決を試みず、`record_key` は null のまま。
 */
export const AUDIT_KEY_SHAPES: Record<string, AuditKeyShapeKind> = {
  // ── identity（クエリ不要。uuid / 連番 int / 文字列 PK） ──────────────
  kiosk_devices: "identity",
  display_devices: "identity",
  approval_groups: "identity",
  inspection_templates: "identity",
  inspection_template_groups: "identity",
  products: "identity",
  materials: "identity",
  material_types: "identity",
  material_type_prices: "identity",
  plants: "identity",
  regions: "identity",
  storage_shelves: "identity",
  storage_locations: "identity",
  process_step_catalog: "identity",
  product_process_routes: "identity",
  defect_types: "identity",
  work_location_groups: "identity",
  business_partners: "identity",
  billing_closings: "identity",
  material_receipts: "identity",
  privileged_access_requests: "identity",
  user_change_requests: "identity",
  portal_accounts: "identity",
  portal_grants: "identity",
  portal_document_links: "identity",
  portal_backup_codes: "identity",
  kiosk_floor_maps: "identity",
  product_inventory: "identity",
  material_inventory: "identity",
  login_attempts: "identity",
  file_folder_grants: "identity",
  system_settings: "identity",
  feature_flags: "identity",
  approval_flows: "identity",
  link_blacklist: "identity",
  design_files: "uuidOnly",
  // bug-report-actions.ts の唯一の直書き。`bug-report:<uuid>` はそれ自体が
  // 一意で不変なので identity で足りる。
  system: "identity",
  // user_change_requests.ts が書く record_id は既に app.users.id（対象者）—
  // user_plants / user_role_relation は複合 PK の半分だけ記録しているが、
  // その半分（targetUserId）自体が解決したいキーなので identity で足りる。
  user_plants: "identity",
  user_role_relation: "identity",
  // カードごとに 1 行へ直す（1.5）。直った後は record_id = カードの物理 ID
  // = kiosk_cards.id そのもの。
  kiosk_cards: "identity",
  // 材種番号の部品マスタ（採番構成 MS07）。record_id は "code" または
  // "parentCode/code" — どちらも複合 PK の文字列表現そのもの。
  material_manufacturers: "identity",
  material_manufacturer_grades: "identity",
  material_shapes: "identity",
  material_kinds: "identity",
  material_surface_finishes: "identity",
  material_diameters: "identity",
  material_length_variants: "identity",

  // ── docKey（クエリ不要。複合 PK (year_month, seq)） ──────────────────
  quotes: "docKey",
  estimates: "docKey",
  price_list_entries: "docKey",
  order_acceptances: "docKey",
  delivery_orders: "docKey",
  delivery_notes: "docKey",
  invoices: "docKey",

  // ── numberToUuid（1 クエリ。audit-record-key.ts が処理） ─────────────
  material_purchase_orders: "numberToUuid",
  purchase_requests: "numberToUuid",
  design_requests: "numberToUuid",
  form_responses: "numberToUuid",
  internal_pages: "numberToUuid",
  forms: "numberToUuid",
  work_orders: "numberToUuid",
  order_lines: "numberToUuid",
  users: "numberToUuid",

  // ── stripPrefix ──────────────────────────────────────────────────────
  approval_flow_rules: "stripPrefix",

  // ── none（解決できるキーが無い。null のまま残す） ────────────────────
  intake_folder: "none",
  kiosk_unlock_pins: "none",
};

/** 表名 → 解決方法。未登録なら undefined。 */
export function auditKeyShape(
  tableName: string,
): AuditKeyShapeKind | undefined {
  return AUDIT_KEY_SHAPES[tableName];
}

/** (yearMonth, seq) → "202608:3"。seq は padding しない。 */
export function compositeKey(yearMonth: string, seq: number): string {
  return `${yearMonth}:${seq}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** uuid 形式かどうか（design_files の uuidOnly 判定にも使う）。 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * クエリを要しない形だけをその場で解決する。
 *
 * 戻り値:
 *  - `string` … 解決したキー
 *  - `null`   … このテーブル名は「解決できるキーが無い」と確定している
 *               （none 形 / 未登録 / 不正な record_id）
 *  - `undefined` … 1 クエリが要る（numberToUuid 形）。呼び出し側
 *               （audit-record-key.ts）に委ねる。
 */
export function resolveAuditRecordKeySync(
  tableName: string,
  recordId: string | null,
): string | null | undefined {
  if (recordId == null || recordId.length === 0) return null;
  const shape = AUDIT_KEY_SHAPES[tableName];
  if (!shape) return null;
  switch (shape) {
    case "identity":
      return recordId;
    case "docKey": {
      const key = parseDocKey(recordId);
      return key ? compositeKey(key.yearMonth, key.seq) : null;
    }
    case "stripPrefix": {
      const idx = recordId.lastIndexOf("#");
      if (idx < 0) return null;
      const tail = recordId.slice(idx + 1);
      return /^[0-9]+$/.test(tail) ? tail : null;
    }
    case "uuidOnly":
      return isUuid(recordId) ? recordId : null;
    case "none":
      return null;
    case "numberToUuid":
      return undefined;
  }
}
