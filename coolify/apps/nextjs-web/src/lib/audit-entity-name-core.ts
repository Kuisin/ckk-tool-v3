/**
 * audit-entity-name-core.ts — 履歴の「対象」を、番号ではなく**名前**で見せる。
 *
 * SY07 は「田中 が 製品「42」を更新しました」のように、マスタ系の表では
 * 内部 id をそのまま文に出していた — 読む人は id から製品名を思い出せない。
 * ここは「その表に人が読む名前があるか」の登録簿（純粋・DB に触れない）と、
 * 監査ペイロード（before/after）から名前を拾う共通ヘルパーを持つ。実際の
 * DB 参照は `audit-record-key-core.ts` と同じ分担で `audit-entity-name.ts`
 * （server-only）に置く。
 *
 * 対象は基本的に `audit-record-key-core.ts` の `identity` 形の表だけ —
 * 書類系（quotes / work_orders / order_lines …）は表示番号自体が既に読める
 * 識別子なので、ここでは扱わない（対象外は登録しない = 名前を探さない）。
 *
 * **例外 1 件: `users`。** 形としては `numberToUuid`（record_id が管理画面の
 * uuid とプロフィール画面の username の 2 通りあるため 1 クエリで解決する）
 * だが、`record_key` は解決後に必ず users.id（uuid）へ揃う。かつ
 * `User.displayName` という正真正銘の表示名を持つ、数少ない非 identity 表
 * なのでここに含める（下のテストが「identity ∪ {users}」で網羅性を確認する）。
 *
 * ★ 名前を持たない表は正直に「無い」と登録する — 推測して間違った名前を
 *   出すより、番号のまま出すほうが安全（audit-field-labels.ts と同じ約束）。
 */

/** 名前を持つ表 = true。持たない・対象外の表は false または未登録。 */
export const AUDIT_HAS_ENTITY_NAME: Record<string, boolean> = {
  // ── Json { ja, en } の name 列 ────────────────────────────────────────
  kiosk_devices: true,
  display_devices: true,
  approval_groups: true,
  inspection_templates: true,
  inspection_template_groups: true,
  products: true,
  materials: true,
  material_types: true,
  plants: true,
  regions: true,
  storage_shelves: true, // name は nullable — 無ければ code へ落ちる
  storage_locations: true,
  process_step_catalog: true,
  product_process_routes: true,
  defect_types: true,
  work_location_groups: true,
  tax_categories: true,
  // 率の行は「2026-10-01 から 10%」であって名前を持たない。推測で区分名を
  // 出すと、どの行が変わったのか却って分からなくなるので正直に「無い」。
  tax_category_rates: false,
  business_partners: true,
  material_manufacturers: true,
  material_manufacturer_grades: true, // 複合キー "parentCode/code"
  material_shapes: true,
  material_kinds: true, // 複合キー "parentCode/code"
  material_surface_finishes: true,
  material_diameters: true, // displayName（name ではない）。nullable
  material_length_variants: true, // displayName（name ではない）。nullable

  // ── 素の String 列 ───────────────────────────────────────────────────
  portal_accounts: true, // displayName
  api_clients: true, // name（外部システムの識別名）
  // トークンの身元は last4 で、label は任意入力。名前として出すと
  // 「label を書かなかったトークン」が全部無名で並ぶので、正直に「無い」にする。
  api_client_tokens: false,
  kiosk_floor_maps: true, // name
  users: true, // displayName
  // user_plants / user_role_relation の record_key は users.id そのもの
  // （ロール割当・所属拠点の変更依頼は「対象ユーザー」を指す設計 —
  // lib/audit-record-key-core.ts のコメント参照）。よって User.displayName を引く。
  user_plants: true,
  user_role_relation: true,
  link_blacklist: true, // pattern（id は uuid だが表示は pattern）
  portal_document_links: true, // label（任意入力 — 無いことも多い）

  // ── 名前を持たない（意図的に false — 探さない） ──────────────────────
  material_type_prices: false, // 材種×直径×黒皮研磨の価格行。単体の名前を持たない
  billing_closings: false, // 顧客×締日の処理行
  material_receipts: false, // 入荷イベント行
  privileged_access_requests: false, // 申請行（code は権限コード、対象者ではない）
  user_change_requests: false, // 変更依頼行（targetUserId はあるが自表の名前ではない）
  portal_grants: false, // 共有範囲の付与行
  portal_backup_codes: false, // 発番順の使い捨てコード
  product_inventory: false, // 在庫数量行
  material_inventory: false, // 在庫数量行
  login_attempts: false, // ログ行
  file_folder_grants: false, // 権限付与行（pathPrefix はパスであって名前ではない）
  kiosk_cards: false, // 物理カード id が識別子。名前を持たない
  // 既に人が読める識別子が主キーそのもの（キー = 表示名）— 探しに行く必要が無い。
  system_settings: false,
  feature_flags: false,
  approval_flows: false,
  system: false,
};

/** その表に名前を探しに行く価値があるか。 */
export function hasEntityName(tableName: string): boolean {
  return AUDIT_HAS_ENTITY_NAME[tableName] === true;
}

/** `{ ja, en }` / 素の文字列 → ja 優先の表示文字列。中身が無ければ undefined。 */
export function jaOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.ja === "string" && v.ja) return v.ja;
    if (typeof v.en === "string" && v.en) return v.en;
  }
  return undefined;
}

/**
 * 監査ペイロード（before/after のどちらか）から名前らしき値を拾う。
 *
 * 生きている行は DB を直接引く方が正確（改名されていれば最新の名前が
 * 出る）が、削除済みの行はもう引けない — その保険として、記録された
 * スナップショットに `name` 系のキーがあればそれを使う。あくまで
 * **手で選ばれた一部のフィールド**（audit.ts の注記どおり）なので、
 * 無くても失敗ではない。
 */
export function extractNameFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const o = payload as Record<string, unknown>;
  for (const key of ["name", "displayName", "nameJa", "label", "pattern"]) {
    const found = jaOf(o[key]);
    if (found) return found;
  }
  return undefined;
}

/** "parentCode/code" → [parentCode, code]。形が合わなければ null。 */
export function splitCompositeKey(
  id: string,
): { parent: string; code: string } | null {
  const idx = id.indexOf("/");
  if (idx <= 0 || idx === id.length - 1) return null;
  return { parent: id.slice(0, idx), code: id.slice(idx + 1) };
}
