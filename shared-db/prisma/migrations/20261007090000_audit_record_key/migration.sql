-- 監査ログに「安定キー」の列を足す。
--
-- record_id は表示用の業務識別子（QOT-202608-00003 / ロット番号 4711 /
-- マスタの文字列 id）で、FK ではない。文書番号は app.numbering_sequences の
-- **月次リセット**で払い出されるので、書類を消して採番を戻すと同じ番号が
-- 再利用される。approval_requests で実際に起きた（削除済み書類の承認記録が
-- 新しい ORD-202608-00003 に付いた）。
--
-- そこで「人が読む番号」と「機械が突き合わせるキー」を分ける。
--   record_id  … 従来どおり。画面の表示・検索・リンクはこちらのまま。
--   record_key … テーブルの主キー。uuid / int / 文字列 PK はそのまま、
--                複合 PK (year_month, seq) は "202608:3"。
--
-- null 可 — 解決できない行は null で残す（読み出しは record_id へ落ちる）。
--   * intake_folder のファイル名のように、そもそも行が無いもの
--   * 削除済み書類の孤児行（下の created_at ガードで弾かれる）
--   * この migration と新コードの間に旧コードが書いた行
--
-- 解決方法（表名 → 形）の唯一の定義元は nextjs-web の
-- lib/audit-record-key-core.ts。ここでの backfill は同じ形をなぞる。
--
-- 併せて SY07（操作履歴）のサーバー側絞り込み・並べ替え用の索引も足す
-- （user_id, created_at）(table_name, created_at) — 監査ログは全ミューテー
-- ションで書かれる表なので、書き込みコストが増える索引は最小限にする
-- （action 列は distinct 値が 7 しかなく、索引を足すほどの選択性がない）。
-- AlterTable
ALTER TABLE "app"."audit_logs" ADD COLUMN     "record_key" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_key_idx" ON "app"."audit_logs"("table_name", "record_key");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "app"."audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_created_at_idx" ON "app"."audit_logs"("table_name", "created_at");

-- ============================================================
-- Backfill（全文 record_key IS NULL ガード付き = 再実行しても安全）
-- ============================================================

-- ── Shape A: 複合 PK (year_month, seq) の書類（7 表） ──────────────────
-- キー自体は文字列変換だけで決まる。JOIN するのは created_at ガードのため
-- だけ — 採番リセットで番号が再利用されていた場合、いまの書類より古い行は
-- 「前の世代」なので触らない（null のまま = 履歴タブに出さない）。
UPDATE app.audit_logs a
   SET record_key = q.year_month || ':' || q.seq
  FROM app.quotes q
 WHERE a.table_name = 'quotes'
   AND a.record_key IS NULL
   AND a.record_id  = 'QOT-' || q.year_month || '-' || lpad(q.seq::text, 5, '0')
   AND a.created_at >= q.created_at;

UPDATE app.audit_logs a
   SET record_key = e.year_month || ':' || e.seq
  FROM app.estimates e
 WHERE a.table_name = 'estimates'
   AND a.record_key IS NULL
   AND a.record_id  = 'EST-' || e.year_month || '-' || lpad(e.seq::text, 5, '0')
   AND a.created_at >= e.created_at;

UPDATE app.audit_logs a
   SET record_key = p.year_month || ':' || p.seq
  FROM app.price_list_entries p
 WHERE a.table_name = 'price_list_entries'
   AND a.record_key IS NULL
   AND a.record_id  = 'PRC-' || p.year_month || '-' || lpad(p.seq::text, 5, '0')
   AND a.created_at >= p.created_at;

UPDATE app.audit_logs a
   SET record_key = o.year_month || ':' || o.seq
  FROM app.order_acceptances o
 WHERE a.table_name = 'order_acceptances'
   AND a.record_key IS NULL
   AND a.record_id  = 'ORD-' || o.year_month || '-' || lpad(o.seq::text, 5, '0')
   AND a.created_at >= o.created_at;

UPDATE app.audit_logs a
   SET record_key = d.year_month || ':' || d.seq
  FROM app.delivery_orders d
 WHERE a.table_name = 'delivery_orders'
   AND a.record_key IS NULL
   AND a.record_id  = 'DOR-' || d.year_month || '-' || lpad(d.seq::text, 5, '0')
   AND a.created_at >= d.created_at;

UPDATE app.audit_logs a
   SET record_key = n.year_month || ':' || n.seq
  FROM app.delivery_notes n
 WHERE a.table_name = 'delivery_notes'
   AND a.record_key IS NULL
   AND a.record_id  = 'DRN-' || n.year_month || '-' || lpad(n.seq::text, 5, '0')
   AND a.created_at >= n.created_at;

UPDATE app.audit_logs a
   SET record_key = i.year_month || ':' || i.seq
  FROM app.invoices i
 WHERE a.table_name = 'invoices'
   AND a.record_key IS NULL
   AND a.record_id  = 'INV-' || i.year_month || '-' || lpad(i.seq::text, 5, '0')
   AND a.created_at >= i.created_at;

-- ── Shape B: uuid PK + 保存済みの一意な番号（6 表） ─────────────────────
-- 番号が再利用されても uuid は別物なので、created_at ガードで前の世代の
-- 行は null のまま残る（＝新しい書類に付かない）。
UPDATE app.audit_logs a
   SET record_key = p.id::text
  FROM app.material_purchase_orders p
 WHERE a.table_name = 'material_purchase_orders'
   AND a.record_key IS NULL
   AND a.record_id  = p.po_number
   AND a.created_at >= p.created_at;

UPDATE app.audit_logs a
   SET record_key = r.id::text
  FROM app.purchase_requests r
 WHERE a.table_name = 'purchase_requests'
   AND a.record_key IS NULL
   AND a.record_id  = r.request_number
   AND a.created_at >= r.created_at;

UPDATE app.audit_logs a
   SET record_key = d.id::text
  FROM app.design_requests d
 WHERE a.table_name = 'design_requests'
   AND a.record_key IS NULL
   AND a.record_id  = d.request_number
   AND a.created_at >= d.created_at;

UPDATE app.audit_logs a
   SET record_key = f.id::text
  FROM app.form_responses f
 WHERE a.table_name = 'form_responses'
   AND a.record_key IS NULL
   AND a.record_id  = f.response_number
   AND a.created_at >= f.created_at;

UPDATE app.audit_logs a
   SET record_key = p.id::text
  FROM app.internal_pages p
 WHERE a.table_name = 'internal_pages'
   AND a.record_key IS NULL
   AND a.record_id  = p.page_number
   AND a.created_at >= p.created_at;

UPDATE app.audit_logs a
   SET record_key = f.id::text
  FROM app.forms f
 WHERE a.table_name = 'forms'
   AND a.record_key IS NULL
   AND a.record_id  = f.code
   AND a.created_at >= f.created_at;

-- ── Shape C: work_orders（uuid PK + int 通し連番） ──────────────────────
-- ロット番号（int）で記録している。record_id を int にキャストしない —
-- 'self' のような非数値行が 1 つでもあれば実行時エラーになるため、
-- 逆向き（int → text）で突き合わせる。
UPDATE app.audit_logs a
   SET record_key = w.id::text
  FROM app.work_orders w
 WHERE a.table_name = 'work_orders'
   AND a.record_key IS NULL
   AND a.record_id  = w.work_order_number::text
   AND a.created_at >= w.created_at;

-- ── Shape D: order_lines（複合 unique → uuid） ──────────────────────────
-- 未確定（branch = null）の明細は公開番号を持たないので対象外
-- （app.purge_document_children() の 'line' モードと同じ組み立て方）。
UPDATE app.audit_logs a
   SET record_key = l.id::text
  FROM app.order_lines l
 WHERE a.table_name = 'order_lines'
   AND a.record_key IS NULL
   AND l.branch IS NOT NULL
   AND a.record_id  = 'ORD-' || l.acceptance_year_month || '-'
                    || lpad(l.acceptance_seq::text, 5, '0') || '-'
                    || lpad(l.branch::text, 2, '0')
   AND a.created_at >= l.created_at;

-- ── Shape E: identity 一括（uuid / 連番 int / 文字列 PK は再利用されない
-- ので、created_at ガードは不要） ───────────────────────────────────────
UPDATE app.audit_logs
   SET record_key = record_id
 WHERE record_key IS NULL
   AND record_id IS NOT NULL
   AND table_name IN (
     'kiosk_devices','display_devices','approval_groups','inspection_templates',
     'inspection_template_groups','products','materials','material_types',
     'material_type_prices','plants','regions','storage_shelves','storage_locations',
     'process_step_catalog','product_process_routes','defect_types',
     'work_location_groups','business_partners','billing_closings','material_receipts',
     'privileged_access_requests','user_change_requests','portal_accounts','portal_grants',
     'portal_document_links','portal_backup_codes','kiosk_floor_maps','product_inventory',
     'material_inventory','login_attempts','file_folder_grants','system_settings',
     'feature_flags','approval_flows','link_blacklist','system',
     -- user_plants / user_role_relation は複合 PK の半分（targetUserId =
     -- app.users.id）だけを record_id に記録している。それ自体が解決したい
     -- キーなので identity で足りる。
     'user_plants','user_role_relation',
     -- kiosk_cards はカード ID（物理カードの id）そのものを記録している
     -- 呼び出し元のみが対象（複数枚まとめた 'ids.join(",")' 行は解決しない）。
     'kiosk_cards',
     -- 材種番号の部品マスタ（採番構成 MS07）。record_id は "code" または
     -- "parentCode/code" — どちらも複合 PK の文字列表現そのもの。
     'material_manufacturers','material_manufacturer_grades','material_shapes',
     'material_kinds','material_surface_finishes','material_diameters',
     'material_length_variants'
   );

-- ── Shape F: 残り（表ごとに規約が割れているもの） ───────────────────────

-- users: 管理画面は uuid、プロフィール/アバターは username で書いている。
-- 'self' センチネル（1.5 で修正する呼び出し元のバグ）は解決せず null のまま。
UPDATE app.audit_logs a
   SET record_key = a.record_id
 WHERE a.table_name = 'users' AND a.record_key IS NULL
   AND a.record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE app.audit_logs a
   SET record_key = u.id::text
  FROM app.users u
 WHERE a.table_name = 'users' AND a.record_key IS NULL
   AND a.record_id = u.username
   AND a.created_at >= u.created_at;

-- design_files: uuid で書かれた行だけ拾う（productId で書かれた行は
-- lib/design-files.ts の呼び出し元バグ — 1.5 で直すまで解決しない）。
UPDATE app.audit_logs
   SET record_key = record_id
 WHERE table_name = 'design_files' AND record_key IS NULL
   AND record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- approval_flow_rules: "<targetType>#<ruleId>" → ruleId。
UPDATE app.audit_logs
   SET record_key = split_part(record_id, '#', 2)
 WHERE table_name = 'approval_flow_rules' AND record_key IS NULL
   AND split_part(record_id, '#', 2) ~ '^[0-9]+$';

-- intake_folder（ファイル名。行が存在しない）と kiosk_unlock_pins
-- （system_settings.key を誤って記録した旧コード。1.5 で直す）は
-- 意図的に手を付けない — record_key は null のまま。
