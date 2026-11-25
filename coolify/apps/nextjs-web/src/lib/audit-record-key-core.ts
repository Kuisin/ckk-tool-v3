/**
 * audit-record-key-core.ts — 監査ログの「安定キー」を組み立てる純関数。
 *
 * `audit_logs.record_id` は表示用の業務識別子（`QOT-2026-00003` / ロット番号
 * `4711` / マスタの文字列 id）で、FK ではない。書類番号は「自社法人 × 会計年度」
 * ごとの連番（番号設計 PR-C）なので、**同じ番号が 2 つの法人に存在し得る** —
 * 番号だけでは履歴がどの書類のものか決まらない。
 *
 * そこで `record_id`（人が読む番号）とは別に `record_key`（一意な指し先）を
 * 持つ。書類は法人コード付きの参照 `CKK/QOT-2026-00003`（= doc_ref）、それ以外は
 * テーブルの主キー。ここは **クエリを要しない形だけ** を解決する純関数 —
 * uuid / int / 文字列 PK はそのまま。法人コード付きの新しい番号（id / 参照）も
 * その場で参照に直せる。番号だけ・旧番号（docKey 形）と、1 クエリで解決する形
 * （`numberToUuid`）は `audit-record-key.ts`（server-only）が持つ。
 *
 * **340 箇所ある `recordAudit()` 呼び出し元は 1 つも変えない。** ここは
 * `recordAudit` / `fetchAuditEntries` の内側からだけ呼ばれる。
 */

import { parseDocKey, parseOrderLineKey } from "./doc-number";
import { docRefNumber, isDocNumber } from "./doc-ref-core";

/**
 * 表ごとの解決方法。
 *  - identity      … record_id がそのままキー（uuid / 連番 int / 文字列 PK）。
 *                    uuid・sequence 由来の int は再利用されない。
 *  - docKey        … 書類番号 `PFX-FFFF-NNNNN`（注文明細は `-NN` 付き）で指す
 *                    書類。キーは法人コード付きの参照 `"<法人コード>/<番号>"`
 *                    （lib/doc-ref-core.ts = 行の doc_ref / line_ref）。
 *                    法人コード付きの id / 参照で渡されればその場で決まる。
 *                    番号だけ・旧番号は法人を引く 1 クエリが要る
 *                    （audit-record-key.ts 側で解決）。
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
  // 再研磨品目 (MS0H)。**実表名そのまま** — products / materials が旧名のまま
  // なのは移行の履歴（あの 2 つも中身は app.items）で、あとから作った
  // 再研磨品目は名乗り直す必要が無い。いま `items` を書くのはこの 1 画面だけ。
  items: "identity",
  charge_items: "identity",
  materials: "identity",
  material_types: "identity",
  material_type_prices: "identity",
  plants: "identity",
  // 自社法人 (MS0I)。連番 int PK をそのまま record_id に入れる。
  own_companies: "identity",
  regions: "identity",
  storage_shelves: "identity",
  storage_locations: "identity",
  process_step_catalog: "identity",
  product_process_routes: "identity",
  defect_types: "identity",
  work_location_groups: "identity",
  // 税区分マスタ (MS0F)。どちらも連番 int PK をそのまま record_id に入れる。
  tax_categories: "identity",
  tax_category_rates: "identity",
  business_partners: "identity",
  billing_closings: "identity",
  material_receipts: "identity",
  privileged_access_requests: "identity",
  user_change_requests: "identity",
  portal_accounts: "identity",
  // 外部 API（api.prisma）。どちらも uuid PK をそのまま record_id に入れる。
  api_clients: "identity",
  webhook_endpoints: "identity",
  api_client_tokens: "identity",
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
  // 設計図の版 — record_id は design_versions.id（版には業務キーが無い）。
  design_versions: "uuidOnly",
  // 設計図の系列メモ — record_id は `<品目 id>:<受注元 id | generic>`
  // （design-files-core designSeriesOwnerId）。それ自体が系列の鍵。
  design_series: "identity",
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

  // ── docKey（書類番号で指す書類。キーは参照 doc_ref） ────────────────
  quotes: "docKey",
  estimates: "docKey",
  price_list_entries: "docKey",
  order_acceptances: "docKey",
  delivery_orders: "docKey",
  // 入出庫伝票 MOV-… / 棚卸 STK-… — どちらも表示番号がそのまま詳細 URL の id。
  inventory_movements: "docKey",
  // 在庫バケット（uuid）と移動タイプ（連番）— どちらも id がそのまま record_id。
  item_inventory: "identity",
  movement_types: "identity",
  // 加工状態（仕掛品）— 連番の id がそのまま record_id。
  wip_states: "identity",
  stock_takes: "docKey",
  delivery_notes: "docKey",
  invoices: "docKey",
  // 会計文書（転記・反対仕訳）。record_id は ACC-FFFF-NNNNN（DB の PK は uuid）。
  accounting_documents: "docKey",
  // 素材発注書 PO-… / 購買依頼 PRQ-… / 設計依頼書 DSG-…。番号設計 PR-C までは
  // 番号が全社で一意だったので uuid PK をキーにしていた（numberToUuid）。番号が
  // 法人ごとの連番になったので、ほかの書類と同じ参照に揃える。旧い行の uuid
  // キーは読み出し側が一緒に拾う（audit-record-key.ts の `legacyKeys`）。
  material_purchase_orders: "docKey",
  purchase_requests: "docKey",
  design_requests: "docKey",
  // 注文明細 ORD-FFFF-NNNNN-NN。キーは line_ref。
  order_lines: "docKey",

  // ── numberToUuid（1 クエリ。audit-record-key.ts が処理） ─────────────
  form_responses: "numberToUuid",
  internal_pages: "numberToUuid",
  forms: "numberToUuid",
  work_orders: "numberToUuid",
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
 *  - `undefined` … 1 クエリが要る（numberToUuid 形、docKey 形の番号だけ・
 *               旧番号）。呼び出し側（audit-record-key.ts）に委ねる。
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
      // 法人コード付きの新しい番号（id / 参照）はそのまま参照になる。
      const ref =
        tableName === "order_lines"
          ? parseOrderLineKey(recordId)?.lineRef
          : parseDocKey(recordId)?.docRef;
      if (ref) return ref;
      // 番号の形でなければ解決できない。形が合えば法人を引きに行く。
      return isDocNumber(docRefNumber(recordId)) ? undefined : null;
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
