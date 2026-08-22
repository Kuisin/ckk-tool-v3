-- 生成物: gen-business-ja.py が出力。手で編集しない（生成元を直す）。
-- Metabase「CKK 業務」データソース（app スキーマ）の表示名を日本語化する。
-- 適用先は Metabase アプリ DB（metabase-db）。冪等。
--   ssh 192.168.50.15 "docker exec -i metabase-db psql -U metabase -d metabase" < metabase-business-ja.sql

BEGIN;

-- ─── テーブル表示名 ─────────────────────────────
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務'),
m(tbl, ja) AS (VALUES
  ('approval_delegates', '承認代理設定'),
  ('approval_flow_steps', '承認フロー段'),
  ('approval_flows', '承認フロー定義'),
  ('approval_group_members', '承認グループメンバー'),
  ('approval_groups', '承認グループ'),
  ('approval_records', '承認記録'),
  ('approval_request_approvers', '承認依頼の承認者'),
  ('approval_requests', '承認依頼'),
  ('audit_logs', '監査ログ'),
  ('feature_flags', 'フィーチャーフラグ'),
  ('files', 'ファイル'),
  ('system_settings', 'システム設定'),
  ('numbering_sequences', '採番シーケンス'),
  ('match_aliases', '照合エイリアス（学習）'),
  ('notifications', '通知'),
  ('push_subscriptions', 'プッシュ購読'),
  ('user_notification_settings', '通知設定'),
  ('user_home_settings', 'ホーム画面設定'),
  ('link_blacklist', 'リンク除外'),
  ('link_index', 'リンク索引'),
  ('file_folder_grants', 'フォルダ権限'),
  ('document_attachments', '書類添付'),
  ('document_memos', '書類メモ'),
  ('document_memo_revisions', '書類メモ改訂'),
  ('users', 'ユーザー'),
  ('roles', 'ロール'),
  ('role_permission_relation', 'ロール権限割当'),
  ('user_role_relation', 'ユーザーロール割当'),
  ('permissions', '権限コード'),
  ('user_plants', 'ユーザー所属拠点'),
  ('business_partners', '取引先'),
  ('bp_contacts', '取引先担当者'),
  ('bp_customer_attrs', '顧客属性'),
  ('bp_end_user_attrs', '最終需要家属性'),
  ('bp_vendor_attrs', '仕入先・外注先属性'),
  ('bp_role_assignments', '取引先ロール割当'),
  ('bp_sales_reps', '営業担当'),
  ('plants', '拠点'),
  ('regions', '地域'),
  ('work_locations', '作業場所'),
  ('work_location_groups', '作業場所グループ'),
  ('storage_locations', '保管場所'),
  ('storage_shelves', '保管棚'),
  ('material_manufacturers', '素材メーカー'),
  ('material_manufacturer_grades', 'メーカー材種'),
  ('material_shapes', '素材形状'),
  ('material_kinds', '素材種類'),
  ('material_types', '材種'),
  ('material_diameters', '素材直径'),
  ('material_surface_finishes', '黒皮・研磨区分'),
  ('material_length_variants', '素材全長'),
  ('material_type_prices', '材種既定単価'),
  ('materials', '素材'),
  ('products', '製品'),
  ('currencies', '通貨マスタ'),
  ('process_step_catalog', '工程マスタ'),
  ('process_step_exec_dependencies', '工程実行依存'),
  ('process_step_use_dependencies', '工程使用依存'),
  ('product_process_routes', '製品工程ルート'),
  ('product_process_route_versions', '工程ルート版'),
  ('product_process_route_version_steps', '工程ルート版の工程'),
  ('inspection_templates', '検査表テンプレート'),
  ('inspection_template_items', '検査表テンプレート項目'),
  ('inspection_records', '検査記録'),
  ('inspection_record_items', '検査記録項目'),
  ('defect_types', '不良種類'),
  ('defect_records', '不良記録'),
  ('estimates', '試算'),
  ('price_list_entries', '価格表エントリ'),
  ('price_list_variants', '価格表バリアント'),
  ('price_list_tiers', '価格表数量段階'),
  ('price_list_discounts', '価格表値引き'),
  ('quotes', '見積書'),
  ('quote_items', '見積明細'),
  ('order_acceptances', '注文請書'),
  ('order_lines', '注文明細'),
  ('design_requests', '設計依頼'),
  ('design_files', '設計ファイル'),
  ('work_orders', '指示書'),
  ('work_order_order_lines', '指示書・注文明細割当'),
  ('work_order_steps', '指示書工程'),
  ('work_order_step_links', '工程分岐・合流'),
  ('work_order_step_plans', '工程作業計画'),
  ('work_order_step_actuals', '工程作業実績'),
  ('work_order_inspection_templates', '指示書検査表'),
  ('work_order_flow_changes', '工程フロー変更'),
  ('product_inventory', '製品在庫'),
  ('material_inventory', '素材在庫'),
  ('inventory_reservations', '在庫予約'),
  ('inventory_transactions', '在庫トランザクション'),
  ('purchase_requests', '購買依頼'),
  ('purchase_request_items', '購買依頼明細'),
  ('material_purchase_orders', '素材発注書'),
  ('material_purchase_order_items', '素材発注明細'),
  ('material_receipts', '素材入荷'),
  ('delivery_orders', '出荷書'),
  ('delivery_order_items', '出荷明細'),
  ('delivery_notes', '納品書'),
  ('delivery_note_items', '納品明細'),
  ('invoices', '請求書'),
  ('invoice_items', '請求明細'),
  ('billing_closings', '締日処理'),
  ('kiosk_cards', 'QRカード'),
  ('kiosk_devices', 'キオスク端末'),
  ('kiosk_device_locations', '端末フロア配置'),
  ('kiosk_device_logs', '端末ログ'),
  ('kiosk_floor_maps', 'フロアマップ'),
  ('kiosk_link_requests', '端末リンク要求'),
  ('kiosk_sessions', 'キオスクセッション')
)
UPDATE metabase_table t SET display_name = m.ja
FROM m, target
WHERE t.db_id = target.id AND t.schema = 'app' AND t.name = m.tbl
  AND t.display_name IS DISTINCT FROM m.ja;

-- ─── 列表示名 ───────────────────────────────────
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務'),
m(col, ja) AS (VALUES
  ('id', 'ID'),
  ('created_at', '作成日時'),
  ('updated_at', '更新日時'),
  ('created_by', '作成者'),
  ('updated_by', '更新者'),
  ('deactivated_at', '無効化日時'),
  ('deactivate_at', '無効化予定'),
  ('archived_at', 'アーカイブ日時'),
  ('archived_by', 'アーカイブ者'),
  ('edited_at', '編集日時'),
  ('edited_by', '編集者'),
  ('sort_order', '並び順'),
  ('is_active', '有効'),
  ('is_system', 'システム'),
  ('is_enabled', '有効'),
  ('is_locked', 'ロック中'),
  ('is_primary', '主'),
  ('is_required', '必須'),
  ('is_latest', '最新'),
  ('notes', '備考'),
  ('note', '備考'),
  ('description', '説明'),
  ('comment', 'コメント'),
  ('status', '状態'),
  ('type', '種別'),
  ('kind', '種別'),
  ('category', 'カテゴリ'),
  ('code', 'コード'),
  ('name', '名称'),
  ('name_kana', '名称カナ'),
  ('short_name', '略称'),
  ('display_name', '表示名'),
  ('label', 'ラベル'),
  ('title', '役職・タイトル'),
  ('value', '値'),
  ('content', '内容'),
  ('message', 'メッセージ'),
  ('reason', '理由'),
  ('history', '履歴'),
  ('settings', '設定'),
  ('options', '選択肢'),
  ('payload', 'ペイロード'),
  ('result', '結果'),
  ('input', '入力'),
  ('spec', '仕様'),
  ('error', 'エラー'),
  ('locale', 'ロケール'),
  ('url', 'URL'),
  ('path_prefix', 'パス接頭辞'),
  ('link_path', 'リンクパス'),
  ('legacy_key', '旧キー'),
  ('source', '取得元'),
  ('parent_id', '親ID'),
  ('key', 'キー'),
  ('type_key', '種別キー'),
  ('settings_code', '設定コード'),
  ('group', 'グループ'),
  ('groups', 'グループ'),
  ('starred', 'お気に入り'),
  ('record_style', '表示スタイル'),
  ('user_id', 'ユーザー'),
  ('username', 'ユーザー名'),
  ('employee_id', '従業員'),
  ('owner_id', '所有者'),
  ('owner_type', '所有者種別'),
  ('email', 'メールアドレス'),
  ('phone', '電話番号'),
  ('fax', 'FAX番号'),
  ('website', 'ウェブサイト'),
  ('department', '部署'),
  ('contact_person', '担当者'),
  ('address', '住所'),
  ('postal_code', '郵便番号'),
  ('country_code', '国コード'),
  ('region_id', '地域'),
  ('avatar_file_id', 'アバター画像'),
  ('avatar_thumb_file_id', 'アバターサムネイル'),
  ('last_login_at', '最終ログイン'),
  ('last_seen_at', '最終確認日時'),
  ('last_activity_at', '最終操作日時'),
  ('last_used_at', '最終使用日時'),
  ('last_ip_address', '最終IPアドレス'),
  ('user_agent', 'ユーザーエージェント'),
  ('hostname', 'ホスト名'),
  ('bp_id', '取引先'),
  ('bp_code', '取引先コード'),
  ('customer_bp_id', '顧客'),
  ('customer_branch_bp_id', '顧客支店'),
  ('supplier_bp_id', '仕入先'),
  ('ship_to_bp_id', '出荷先'),
  ('recipient_bp_id', '納品先'),
  ('recipient_branch_bp_id', '納品先支店'),
  ('end_user_bp_id', '最終需要家'),
  ('billing_bp_id', '請求先'),
  ('customer_code', '顧客コード'),
  ('vendor_code', '仕入先コード'),
  ('vendor_type', '仕入先種別'),
  ('sales_rep_id', '営業担当'),
  ('customer_order_ref', '顧客注文書番号'),
  ('credit_limit', '与信限度額'),
  ('closing_day', '締日'),
  ('payment_day', '支払日'),
  ('payment_terms_days', '支払サイト(日)'),
  ('invoice_method', '請求方法'),
  ('tax_type', '課税区分'),
  ('tax_number', '法人番号'),
  ('industry', '業種'),
  ('is_consignment', '委託先'),
  ('role', 'ロール'),
  ('bank_name', '銀行名'),
  ('bank_branch', '支店名'),
  ('bank_account_type', '口座種別'),
  ('bank_account_number', '口座番号'),
  ('lead_time_days', 'リードタイム(日)'),
  ('match_names', '照合名'),
  ('match_names_auto', '照合名(自動)'),
  ('alias', 'エイリアス'),
  ('alias_key', '照合キー'),
  ('hit_count', '自動確定回数'),
  ('use_count', '使用回数'),
  ('role_id', 'ロール'),
  ('rolename', 'ロール名'),
  ('permission_code', '権限コード'),
  ('action', 'アクション'),
  ('scope', 'スコープ'),
  ('scope_values', 'スコープ対象'),
  ('assigned_at', '割当日時'),
  ('assigned_by', '割当者'),
  ('approval_request_id', '承認依頼'),
  ('approver_id', '承認者'),
  ('acted_at', '実施日時'),
  ('acted_by', '実施者'),
  ('delegate_id', '代理者'),
  ('delegator_id', '被代理者'),
  ('delegate_for_id', '被代理者'),
  ('group_id', 'グループ'),
  ('step_no', '段番号'),
  ('step_count', '総段数'),
  ('mode', '承認モード'),
  ('flow_snapshot', 'フロースナップショット'),
  ('approval_status', '承認状態'),
  ('approval_min_rank', '必要役職'),
  ('is_approval_step', '承認工程'),
  ('requested_at', '依頼日時'),
  ('requested_by', '依頼者'),
  ('approved_at', '承認日時'),
  ('approved_by', '承認者'),
  ('rejected_at', '差戻日時'),
  ('rejected_by', '差戻者'),
  ('reject_reason', '差戻理由'),
  ('resolved_at', '解決日時'),
  ('resolved_by', '解決者'),
  ('table_name', 'テーブル名'),
  ('record_id', 'レコードID'),
  ('before_data', '変更前'),
  ('after_data', '変更後'),
  ('kiosk_device_id', 'キオスク端末'),
  ('target_type', '対象種別'),
  ('target_id', '対象ID'),
  ('reference_type', '参照種別'),
  ('reference_id', '参照ID'),
  ('source_file_id', '元ファイル'),
  ('material_id', '素材'),
  ('material_type_id', '材種'),
  ('manufacturer_code', 'メーカーコード'),
  ('grade_code', '材種コード'),
  ('shape_code', '形状コード'),
  ('kind_code', '種類コード'),
  ('diameter_code', '直径コード'),
  ('diameter_mm', '直径(mm)'),
  ('nominal_diameter_mm', '呼び径(mm)'),
  ('length_mm', '全長(mm)'),
  ('length_variant_code', '全長コード'),
  ('surface_finish_code', '黒皮研磨コード'),
  ('manufacturer_model', 'メーカー型式'),
  ('custom_label', 'カスタム識別'),
  ('product_id', '製品'),
  ('product_text', '製品(原文)'),
  ('unit', '単位'),
  ('design_file_id', '設計ファイル'),
  ('design_request_id', '設計依頼'),
  ('file_id', 'ファイル'),
  ('version', '版'),
  ('process_step_id', '工程'),
  ('depends_on_step_id', '依存工程'),
  ('related_process_step_id', '関連工程'),
  ('relation', '関係'),
  ('is_negation', '排他条件'),
  ('is_sync_capable', '同期可'),
  ('is_inspection', '検査工程'),
  ('execution_location', '実施場所区分'),
  ('route_id', '工程ルート'),
  ('route_version_id', '工程ルート版'),
  ('step_id', '工程'),
  ('quantity_tracking', '数量トラッキング'),
  ('default_work_hours', '既定作業時間'),
  ('inspection_template_id', '検査表テンプレート'),
  ('inspection_record_id', '検査記録'),
  ('template_id', 'テンプレート'),
  ('template_item_id', 'テンプレート項目'),
  ('item_name', '検査項目'),
  ('measured_value', '実測値'),
  ('measured_values', '実測値'),
  ('tolerance_min', '許容下限'),
  ('tolerance_max', '許容上限'),
  ('goal_value', '目標値'),
  ('accept_bool', '合否(真偽)'),
  ('accept_options', '合格条件'),
  ('is_pass', '合否'),
  ('input_type', '入力種別'),
  ('sampling_mode', '抜取方式'),
  ('sampling_value', '抜取値'),
  ('inspected_count', '検査数'),
  ('passed_count', '合格数'),
  ('defect_type_id', '不良種類'),
  ('defect_reasons', '不良理由'),
  ('recorded_at', '記録日時'),
  ('recorded_by', '記録者'),
  ('tool_type', '工具種'),
  ('year_month', '年月'),
  ('seq', '連番'),
  ('reference_unit_price', '参照単価'),
  ('reference_date', '参照日'),
  ('reference_overridden', '参照単価上書き'),
  ('registered_at', '登録日時'),
  ('entry_year_month', 'エントリ年月'),
  ('entry_seq', 'エントリ連番'),
  ('estimate_year_month', '試算年月'),
  ('estimate_seq', '試算連番'),
  ('base_unit_price', '基準単価'),
  ('order_type', '注文種別'),
  ('valid_from', '有効開始'),
  ('valid_until', '有効終了'),
  ('variant_id', 'バリアント'),
  ('min_quantity', '数量下限'),
  ('max_quantity', '数量上限'),
  ('multiplier', '倍率'),
  ('price_override', '上書き単価'),
  ('price_list_tier_id', '数量段階'),
  ('discount_type', '値引き種別'),
  ('discount_label', '値引きラベル'),
  ('discount_amount', '値引き額'),
  ('quote_year_month', '見積年月'),
  ('quote_seq', '見積連番'),
  ('quantity', '数量'),
  ('unit_price', '単価'),
  ('amount', '金額'),
  ('rate_per_100_jpy', 'レート(100円あたり)'),
  ('subtotal', '小計'),
  ('tax_amount', '消費税額'),
  ('total_amount', '合計金額'),
  ('currency', '通貨'),
  ('delivery_date', '納期'),
  ('valid_until_date', '有効期限'),
  ('acceptance_year_month', '注文請書年月'),
  ('acceptance_seq', '注文請書連番'),
  ('order_date', '注文日'),
  ('branch', '枝番'),
  ('assigned_plant_id', '担当拠点'),
  ('shipping_work_location_id', '出荷作業場所'),
  ('order_doc_file_id', '注文書PDF'),
  ('lot_number', 'ロット番号'),
  ('confirmed_at', '確定日時'),
  ('cancelled_at', 'キャンセル日時'),
  ('cancelled_by', 'キャンセル者'),
  ('cancel_reason', 'キャンセル理由'),
  ('trigger', 'トリガー'),
  ('request_number', '依頼番号'),
  ('extracted', '抽出済'),
  ('extract_error', '抽出エラー'),
  ('work_order_id', '指示書'),
  ('work_order_number', '指示書番号(ロット)'),
  ('work_order_step_id', '指示書工程'),
  ('order_line_id', '注文明細'),
  ('planned_quantity', '予定数量'),
  ('storage_location_id', '保管場所'),
  ('source_work_order_id', 'コピー元指示書'),
  ('started_at', '開始日時'),
  ('started_by', '開始者'),
  ('completed_at', '完了日時'),
  ('completed_by', '完了者'),
  ('input_quantity', '受入数'),
  ('output_success_quantity', '良品数'),
  ('output_defect_semi_finished', '半製品数'),
  ('output_defect_scrap', '廃棄数'),
  ('output_defect_rework', '工程分岐数'),
  ('received_quantity', '受入数量'),
  ('branch_stock_disposition', '分岐在庫区分'),
  ('is_semi_finished', '半製品'),
  ('session_locked_by', 'セッションロック者'),
  ('session_locked_at', 'セッションロック日時'),
  ('source_step_id', '分岐元工程'),
  ('target_step_id', '合流先工程'),
  ('routed_quantity', '経路数量'),
  ('plant_id', '拠点'),
  ('from_plant_id', '出荷元拠点'),
  ('work_location_id', '作業場所'),
  ('planned_date', '予定日'),
  ('planned_start_at', '予定開始'),
  ('planned_end_at', '予定終了'),
  ('planned_work_hours', '予定作業時間'),
  ('work_hours', '作業時間'),
  ('worked_date', '作業日'),
  ('outsource_requested_at', '外注依頼日'),
  ('outsource_expected_at', '外注入荷予定日'),
  ('outsource_received_at', '外注入荷日'),
  ('outsource_cost', '外注費'),
  ('inventory_type', '在庫種別'),
  ('inventory_id', '在庫'),
  ('reserved_quantity', '予約数量'),
  ('reserved_at', '予約日時'),
  ('released_at', '解除日時'),
  ('transaction_type', '取引種別'),
  ('location', 'ロケーション'),
  ('location_id', '場所'),
  ('shelf_id', '棚'),
  ('capacity', '収容数'),
  ('purchase_order_id', '発注書'),
  ('purchase_order_item_id', '発注明細'),
  ('po_number', '発注番号'),
  ('purchase_date', '発注日'),
  ('ordered_at', '発注日時'),
  ('ordered_by', '発注者'),
  ('received_at', '入荷日'),
  ('expected_at', '入荷予定日'),
  ('request_id', '依頼'),
  ('desired_at', '希望日'),
  ('delivery_order_id', '出荷書'),
  ('delivery_order_year_month', '出荷書年月'),
  ('delivery_order_seq', '出荷書連番'),
  ('shipped_at', '出荷日時'),
  ('delivery_method', '納品方法'),
  ('delivery_note_year_month', '納品書年月'),
  ('delivery_note_seq', '納品書連番'),
  ('include_price', '価格記載'),
  ('delivered_at', '納品日時'),
  ('invoice_year_month', '請求書年月'),
  ('invoice_seq', '請求書連番'),
  ('billing_period_from', '請求期間(自)'),
  ('billing_period_to', '請求期間(至)'),
  ('issued_at', '発行日時'),
  ('due_date', '支払期限'),
  ('sent_at', '送付日時'),
  ('pdf_file_id', 'PDF'),
  ('yayoi_exported_at', '弥生出力日時'),
  ('closing_date', '締日'),
  ('processed_at', '処理日時'),
  ('processed_by', '処理者'),
  ('storage_key', 'ストレージキー'),
  ('filename', 'ファイル名'),
  ('mime_type', 'MIMEタイプ'),
  ('size_bytes', 'サイズ(バイト)'),
  ('uploaded_by', 'アップロード者'),
  ('prefix', '接頭辞'),
  ('last_year_month', '最終年月'),
  ('last_sequence', '最終連番'),
  ('is_read', '既読'),
  ('read_at', '既読日時'),
  ('email_enabled', 'メール通知'),
  ('push_enabled', 'プッシュ通知'),
  ('endpoint', 'エンドポイント'),
  ('p256dh', '公開鍵(p256dh)'),
  ('auth', '認証キー'),
  ('purpose', '用途'),
  ('expires_at', '有効期限'),
  ('card_id', 'カード'),
  ('device_id', '端末'),
  ('device_public_key', '端末公開鍵'),
  ('device_token_hash', '端末トークンハッシュ'),
  ('device_token_expires_at', '端末トークン期限'),
  ('fingerprint', 'フィンガープリント'),
  ('pin_hash', 'PINハッシュ'),
  ('pin_set_at', 'PIN設定日時'),
  ('pin_last_verified_at', 'PIN最終確認'),
  ('pin_failed_attempts', 'PIN失敗回数'),
  ('pin_locked_until', 'PINロック解除'),
  ('max_active_sessions', '最大同時セッション'),
  ('activated_at', '有効化日時'),
  ('activated_by', '有効化者'),
  ('linked_at', 'リンク日時'),
  ('revoked_at', '失効日時'),
  ('revoked_by', '失効者'),
  ('floor_map_id', 'フロアマップ'),
  ('map_x', 'マップX'),
  ('map_y', 'マップY'),
  ('latitude', '緯度'),
  ('longitude', '経度'),
  ('accuracy_m', '精度(m)'),
  ('ended_at', '終了日時'),
  ('password_hash', 'パスワードハッシュ'),
  ('date_format', '日付書式'),
  ('time_format', '時刻書式'),
  ('time_zone', 'タイムゾーン'),
  ('allow_manual_override', '手動上書き許可'),
  ('can_write', '書込可'),
  ('pattern', 'パターン'),
  ('plain_text', '本文'),
  ('memo_id', 'メモ')
)
UPDATE metabase_field f SET display_name = m.ja
FROM m, metabase_table t, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'app'
  AND f.name = m.col AND f.display_name IS DISTINCT FROM m.ja;

-- ─── 多言語 { ja, en } 列の葉に和名 ────────────────
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET display_name = CASE f.name WHEN 'ja' THEN '日本語' ELSE '英語' END
FROM metabase_table t, metabase_field p, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'app'
  AND f.parent_id = p.id AND p.name NOT IN ('after_data', 'before_data', 'input', 'result', 'spec', 'history', 'payload', 'flow_snapshot', 'options', 'settings', 'content', 'measured_values', 'defect_reasons')
  AND f.name IN ('ja','en')
  AND f.display_name IS DISTINCT FROM (CASE f.name WHEN 'ja' THEN '日本語' ELSE '英語' END);

-- ─── フリーフォーム JSON 列は展開しない ────────────
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET json_unfolding = false
FROM metabase_table t, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'app'
  AND f.parent_id IS NULL AND f.name IN ('after_data', 'before_data', 'input', 'result', 'spec', 'history', 'payload', 'flow_snapshot', 'options', 'settings', 'content', 'measured_values', 'defect_reasons')
  AND f.json_unfolding IS DISTINCT FROM false;

-- ─── analytics ビューのテーブル表示名 ──────────────
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務'),
m(tbl, ja) AS (VALUES
  ('v_estimates', '試算'),
  ('v_price_list_entries', '価格表'),
  ('v_price_list_variants', '価格表バリアント'),
  ('v_quotes', '見積書'),
  ('v_quote_items', '見積明細'),
  ('v_order_acceptances', '注文請書'),
  ('v_order_lines', '注文明細'),
  ('v_design_requests', '設計依頼'),
  ('v_purchase_requests', '購買依頼'),
  ('v_purchase_request_items', '購買依頼明細'),
  ('v_material_purchase_orders', '素材発注書'),
  ('v_material_purchase_order_items', '素材発注明細'),
  ('v_material_receipts', '素材入荷'),
  ('v_work_orders', '指示書'),
  ('v_work_order_steps', '指示書工程'),
  ('v_work_order_step_plans', '工程作業計画'),
  ('v_work_order_step_actuals', '工程作業実績'),
  ('v_inspection_records', '検査記録'),
  ('v_defect_records', '不良記録'),
  ('v_product_inventory', '製品在庫'),
  ('v_material_inventory', '素材在庫'),
  ('v_inventory_reservations', '在庫予約'),
  ('v_inventory_transactions', '在庫取引'),
  ('v_delivery_orders', '出荷書'),
  ('v_delivery_order_items', '出荷明細'),
  ('v_delivery_notes', '納品書'),
  ('v_delivery_note_items', '納品明細'),
  ('v_invoices', '請求書'),
  ('v_invoice_items', '請求明細'),
  ('v_billing_closings', '締日処理'),
  ('v_approval_requests', '承認依頼'),
  ('v_approval_records', '承認記録'),
  ('v_business_partners', '取引先'),
  ('v_products', '製品'),
  ('v_materials', '素材'),
  ('v_material_types', '材種'),
  ('v_plants', '拠点'),
  ('v_users', '従業員'),
  ('v_process_step_catalog', '工程マスタ'),
  ('v_inspection_templates', '検査表テンプレート'),
  ('v_defect_types', '不良種類'),
  ('v_currencies', '通貨マスタ')
)
UPDATE metabase_table t SET display_name = m.ja
FROM m, target
WHERE t.db_id = target.id AND t.schema = 'analytics' AND t.name = m.tbl
  AND t.display_name IS DISTINCT FROM m.ja;

-- ─── analytics ビューの列表示名（COLS ∪ ANALYTICS_COLS） ──
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務'),
m(col, ja) AS (VALUES
  ('id', 'ID'),
  ('created_at', '作成日時'),
  ('updated_at', '更新日時'),
  ('created_by', '作成者'),
  ('updated_by', '更新者'),
  ('deactivated_at', '無効化日時'),
  ('deactivate_at', '無効化予定'),
  ('archived_at', 'アーカイブ日時'),
  ('archived_by', 'アーカイブ者'),
  ('edited_at', '編集日時'),
  ('edited_by', '編集者'),
  ('sort_order', '並び順'),
  ('is_active', '有効'),
  ('is_system', 'システム'),
  ('is_enabled', '有効'),
  ('is_locked', 'ロック中'),
  ('is_primary', '主'),
  ('is_required', '必須'),
  ('is_latest', '最新'),
  ('notes', '備考'),
  ('note', '備考'),
  ('description', '説明'),
  ('comment', 'コメント'),
  ('status', '状態'),
  ('type', '種別'),
  ('kind', '種別'),
  ('category', 'カテゴリ'),
  ('code', 'コード'),
  ('name', '名称'),
  ('name_kana', '名称カナ'),
  ('short_name', '略称'),
  ('display_name', '表示名'),
  ('label', 'ラベル'),
  ('title', '役職・タイトル'),
  ('value', '値'),
  ('content', '内容'),
  ('message', 'メッセージ'),
  ('reason', '理由'),
  ('history', '履歴'),
  ('settings', '設定'),
  ('options', '選択肢'),
  ('payload', 'ペイロード'),
  ('result', '結果'),
  ('input', '入力'),
  ('spec', '仕様'),
  ('error', 'エラー'),
  ('locale', 'ロケール'),
  ('url', 'URL'),
  ('path_prefix', 'パス接頭辞'),
  ('link_path', 'リンクパス'),
  ('legacy_key', '旧キー'),
  ('source', '取得元'),
  ('parent_id', '親ID'),
  ('key', 'キー'),
  ('type_key', '種別キー'),
  ('settings_code', '設定コード'),
  ('group', 'グループ'),
  ('groups', 'グループ'),
  ('starred', 'お気に入り'),
  ('record_style', '表示スタイル'),
  ('user_id', 'ユーザー'),
  ('username', 'ユーザー名'),
  ('employee_id', '従業員'),
  ('owner_id', '所有者'),
  ('owner_type', '所有者種別'),
  ('email', 'メールアドレス'),
  ('phone', '電話番号'),
  ('fax', 'FAX番号'),
  ('website', 'ウェブサイト'),
  ('department', '部署'),
  ('contact_person', '担当者'),
  ('address', '住所'),
  ('postal_code', '郵便番号'),
  ('country_code', '国コード'),
  ('region_id', '地域'),
  ('avatar_file_id', 'アバター画像'),
  ('avatar_thumb_file_id', 'アバターサムネイル'),
  ('last_login_at', '最終ログイン'),
  ('last_seen_at', '最終確認日時'),
  ('last_activity_at', '最終操作日時'),
  ('last_used_at', '最終使用日時'),
  ('last_ip_address', '最終IPアドレス'),
  ('user_agent', 'ユーザーエージェント'),
  ('hostname', 'ホスト名'),
  ('bp_id', '取引先'),
  ('bp_code', '取引先コード'),
  ('customer_bp_id', '顧客'),
  ('customer_branch_bp_id', '顧客支店'),
  ('supplier_bp_id', '仕入先'),
  ('ship_to_bp_id', '出荷先'),
  ('recipient_bp_id', '納品先'),
  ('recipient_branch_bp_id', '納品先支店'),
  ('end_user_bp_id', '最終需要家'),
  ('billing_bp_id', '請求先'),
  ('customer_code', '顧客コード'),
  ('vendor_code', '仕入先コード'),
  ('vendor_type', '仕入先種別'),
  ('sales_rep_id', '営業担当'),
  ('customer_order_ref', '顧客注文書番号'),
  ('credit_limit', '与信限度額'),
  ('closing_day', '締日'),
  ('payment_day', '支払日'),
  ('payment_terms_days', '支払サイト(日)'),
  ('invoice_method', '請求方法'),
  ('tax_type', '課税区分'),
  ('tax_number', '法人番号'),
  ('industry', '業種'),
  ('is_consignment', '委託先'),
  ('role', 'ロール'),
  ('bank_name', '銀行名'),
  ('bank_branch', '支店名'),
  ('bank_account_type', '口座種別'),
  ('bank_account_number', '口座番号'),
  ('lead_time_days', 'リードタイム(日)'),
  ('match_names', '照合名'),
  ('match_names_auto', '照合名(自動)'),
  ('alias', 'エイリアス'),
  ('alias_key', '照合キー'),
  ('hit_count', '自動確定回数'),
  ('use_count', '使用回数'),
  ('role_id', 'ロール'),
  ('rolename', 'ロール名'),
  ('permission_code', '権限コード'),
  ('action', 'アクション'),
  ('scope', 'スコープ'),
  ('scope_values', 'スコープ対象'),
  ('assigned_at', '割当日時'),
  ('assigned_by', '割当者'),
  ('approval_request_id', '承認依頼'),
  ('approver_id', '承認者'),
  ('acted_at', '実施日時'),
  ('acted_by', '実施者'),
  ('delegate_id', '代理者'),
  ('delegator_id', '被代理者'),
  ('delegate_for_id', '被代理者'),
  ('group_id', 'グループ'),
  ('step_no', '段番号'),
  ('step_count', '総段数'),
  ('mode', '承認モード'),
  ('flow_snapshot', 'フロースナップショット'),
  ('approval_status', '承認状態'),
  ('approval_min_rank', '必要役職'),
  ('is_approval_step', '承認工程'),
  ('requested_at', '依頼日時'),
  ('requested_by', '依頼者'),
  ('approved_at', '承認日時'),
  ('approved_by', '承認者'),
  ('rejected_at', '差戻日時'),
  ('rejected_by', '差戻者'),
  ('reject_reason', '差戻理由'),
  ('resolved_at', '解決日時'),
  ('resolved_by', '解決者'),
  ('table_name', 'テーブル名'),
  ('record_id', 'レコードID'),
  ('before_data', '変更前'),
  ('after_data', '変更後'),
  ('kiosk_device_id', 'キオスク端末'),
  ('target_type', '対象種別'),
  ('target_id', '対象ID'),
  ('reference_type', '参照種別'),
  ('reference_id', '参照ID'),
  ('source_file_id', '元ファイル'),
  ('material_id', '素材'),
  ('material_type_id', '材種'),
  ('manufacturer_code', 'メーカーコード'),
  ('grade_code', '材種コード'),
  ('shape_code', '形状コード'),
  ('kind_code', '種類コード'),
  ('diameter_code', '直径コード'),
  ('diameter_mm', '直径(mm)'),
  ('nominal_diameter_mm', '呼び径(mm)'),
  ('length_mm', '全長(mm)'),
  ('length_variant_code', '全長コード'),
  ('surface_finish_code', '黒皮研磨コード'),
  ('manufacturer_model', 'メーカー型式'),
  ('custom_label', 'カスタム識別'),
  ('product_id', '製品'),
  ('product_text', '製品(原文)'),
  ('unit', '単位'),
  ('design_file_id', '設計ファイル'),
  ('design_request_id', '設計依頼'),
  ('file_id', 'ファイル'),
  ('version', '版'),
  ('process_step_id', '工程'),
  ('depends_on_step_id', '依存工程'),
  ('related_process_step_id', '関連工程'),
  ('relation', '関係'),
  ('is_negation', '排他条件'),
  ('is_sync_capable', '同期可'),
  ('is_inspection', '検査工程'),
  ('execution_location', '実施場所区分'),
  ('route_id', '工程ルート'),
  ('route_version_id', '工程ルート版'),
  ('step_id', '工程'),
  ('quantity_tracking', '数量トラッキング'),
  ('default_work_hours', '既定作業時間'),
  ('inspection_template_id', '検査表テンプレート'),
  ('inspection_record_id', '検査記録'),
  ('template_id', 'テンプレート'),
  ('template_item_id', 'テンプレート項目'),
  ('item_name', '検査項目'),
  ('measured_value', '実測値'),
  ('measured_values', '実測値'),
  ('tolerance_min', '許容下限'),
  ('tolerance_max', '許容上限'),
  ('goal_value', '目標値'),
  ('accept_bool', '合否(真偽)'),
  ('accept_options', '合格条件'),
  ('is_pass', '合否'),
  ('input_type', '入力種別'),
  ('sampling_mode', '抜取方式'),
  ('sampling_value', '抜取値'),
  ('inspected_count', '検査数'),
  ('passed_count', '合格数'),
  ('defect_type_id', '不良種類'),
  ('defect_reasons', '不良理由'),
  ('recorded_at', '記録日時'),
  ('recorded_by', '記録者'),
  ('tool_type', '工具種'),
  ('year_month', '年月'),
  ('seq', '連番'),
  ('reference_unit_price', '参照単価'),
  ('reference_date', '参照日'),
  ('reference_overridden', '参照単価上書き'),
  ('registered_at', '登録日時'),
  ('entry_year_month', 'エントリ年月'),
  ('entry_seq', 'エントリ連番'),
  ('estimate_year_month', '試算年月'),
  ('estimate_seq', '試算連番'),
  ('base_unit_price', '基準単価'),
  ('order_type', '注文種別'),
  ('valid_from', '有効開始'),
  ('valid_until', '有効終了'),
  ('variant_id', 'バリアント'),
  ('min_quantity', '数量下限'),
  ('max_quantity', '数量上限'),
  ('multiplier', '倍率'),
  ('price_override', '上書き単価'),
  ('price_list_tier_id', '数量段階'),
  ('discount_type', '値引き種別'),
  ('discount_label', '値引きラベル'),
  ('discount_amount', '値引き額'),
  ('quote_year_month', '見積年月'),
  ('quote_seq', '見積連番'),
  ('quantity', '数量'),
  ('unit_price', '単価'),
  ('amount', '金額'),
  ('rate_per_100_jpy', 'レート(100円あたり)'),
  ('subtotal', '小計'),
  ('tax_amount', '消費税額'),
  ('total_amount', '合計金額'),
  ('currency', '通貨'),
  ('delivery_date', '納期'),
  ('valid_until_date', '有効期限'),
  ('acceptance_year_month', '注文請書年月'),
  ('acceptance_seq', '注文請書連番'),
  ('order_date', '注文日'),
  ('branch', '枝番'),
  ('assigned_plant_id', '担当拠点'),
  ('shipping_work_location_id', '出荷作業場所'),
  ('order_doc_file_id', '注文書PDF'),
  ('lot_number', 'ロット番号'),
  ('confirmed_at', '確定日時'),
  ('cancelled_at', 'キャンセル日時'),
  ('cancelled_by', 'キャンセル者'),
  ('cancel_reason', 'キャンセル理由'),
  ('trigger', 'トリガー'),
  ('request_number', '依頼番号'),
  ('extracted', '抽出済'),
  ('extract_error', '抽出エラー'),
  ('work_order_id', '指示書'),
  ('work_order_number', '指示書番号(ロット)'),
  ('work_order_step_id', '指示書工程'),
  ('order_line_id', '注文明細'),
  ('planned_quantity', '予定数量'),
  ('storage_location_id', '保管場所'),
  ('source_work_order_id', 'コピー元指示書'),
  ('started_at', '開始日時'),
  ('started_by', '開始者'),
  ('completed_at', '完了日時'),
  ('completed_by', '完了者'),
  ('input_quantity', '受入数'),
  ('output_success_quantity', '良品数'),
  ('output_defect_semi_finished', '半製品数'),
  ('output_defect_scrap', '廃棄数'),
  ('output_defect_rework', '工程分岐数'),
  ('received_quantity', '受入数量'),
  ('branch_stock_disposition', '分岐在庫区分'),
  ('is_semi_finished', '半製品'),
  ('session_locked_by', 'セッションロック者'),
  ('session_locked_at', 'セッションロック日時'),
  ('source_step_id', '分岐元工程'),
  ('target_step_id', '合流先工程'),
  ('routed_quantity', '経路数量'),
  ('plant_id', '拠点'),
  ('from_plant_id', '出荷元拠点'),
  ('work_location_id', '作業場所'),
  ('planned_date', '予定日'),
  ('planned_start_at', '予定開始'),
  ('planned_end_at', '予定終了'),
  ('planned_work_hours', '予定作業時間'),
  ('work_hours', '作業時間'),
  ('worked_date', '作業日'),
  ('outsource_requested_at', '外注依頼日'),
  ('outsource_expected_at', '外注入荷予定日'),
  ('outsource_received_at', '外注入荷日'),
  ('outsource_cost', '外注費'),
  ('inventory_type', '在庫種別'),
  ('inventory_id', '在庫'),
  ('reserved_quantity', '予約数量'),
  ('reserved_at', '予約日時'),
  ('released_at', '解除日時'),
  ('transaction_type', '取引種別'),
  ('location', 'ロケーション'),
  ('location_id', '場所'),
  ('shelf_id', '棚'),
  ('capacity', '収容数'),
  ('purchase_order_id', '発注書'),
  ('purchase_order_item_id', '発注明細'),
  ('po_number', '発注番号'),
  ('purchase_date', '発注日'),
  ('ordered_at', '発注日時'),
  ('ordered_by', '発注者'),
  ('received_at', '入荷日'),
  ('expected_at', '入荷予定日'),
  ('request_id', '依頼'),
  ('desired_at', '希望日'),
  ('delivery_order_id', '出荷書'),
  ('delivery_order_year_month', '出荷書年月'),
  ('delivery_order_seq', '出荷書連番'),
  ('shipped_at', '出荷日時'),
  ('delivery_method', '納品方法'),
  ('delivery_note_year_month', '納品書年月'),
  ('delivery_note_seq', '納品書連番'),
  ('include_price', '価格記載'),
  ('delivered_at', '納品日時'),
  ('invoice_year_month', '請求書年月'),
  ('invoice_seq', '請求書連番'),
  ('billing_period_from', '請求期間(自)'),
  ('billing_period_to', '請求期間(至)'),
  ('issued_at', '発行日時'),
  ('due_date', '支払期限'),
  ('sent_at', '送付日時'),
  ('pdf_file_id', 'PDF'),
  ('yayoi_exported_at', '弥生出力日時'),
  ('closing_date', '締日'),
  ('processed_at', '処理日時'),
  ('processed_by', '処理者'),
  ('storage_key', 'ストレージキー'),
  ('filename', 'ファイル名'),
  ('mime_type', 'MIMEタイプ'),
  ('size_bytes', 'サイズ(バイト)'),
  ('uploaded_by', 'アップロード者'),
  ('prefix', '接頭辞'),
  ('last_year_month', '最終年月'),
  ('last_sequence', '最終連番'),
  ('is_read', '既読'),
  ('read_at', '既読日時'),
  ('email_enabled', 'メール通知'),
  ('push_enabled', 'プッシュ通知'),
  ('endpoint', 'エンドポイント'),
  ('p256dh', '公開鍵(p256dh)'),
  ('auth', '認証キー'),
  ('purpose', '用途'),
  ('expires_at', '有効期限'),
  ('card_id', 'カード'),
  ('device_id', '端末'),
  ('device_public_key', '端末公開鍵'),
  ('device_token_hash', '端末トークンハッシュ'),
  ('device_token_expires_at', '端末トークン期限'),
  ('fingerprint', 'フィンガープリント'),
  ('pin_hash', 'PINハッシュ'),
  ('pin_set_at', 'PIN設定日時'),
  ('pin_last_verified_at', 'PIN最終確認'),
  ('pin_failed_attempts', 'PIN失敗回数'),
  ('pin_locked_until', 'PINロック解除'),
  ('max_active_sessions', '最大同時セッション'),
  ('activated_at', '有効化日時'),
  ('activated_by', '有効化者'),
  ('linked_at', 'リンク日時'),
  ('revoked_at', '失効日時'),
  ('revoked_by', '失効者'),
  ('floor_map_id', 'フロアマップ'),
  ('map_x', 'マップX'),
  ('map_y', 'マップY'),
  ('latitude', '緯度'),
  ('longitude', '経度'),
  ('accuracy_m', '精度(m)'),
  ('ended_at', '終了日時'),
  ('password_hash', 'パスワードハッシュ'),
  ('date_format', '日付書式'),
  ('time_format', '時刻書式'),
  ('time_zone', 'タイムゾーン'),
  ('allow_manual_override', '手動上書き許可'),
  ('can_write', '書込可'),
  ('pattern', 'パターン'),
  ('plain_text', '本文'),
  ('memo_id', 'メモ'),
  ('estimate_no', '試算番号'),
  ('price_list_no', '価格表番号'),
  ('quote_no', '見積番号'),
  ('order_no', '注文番号'),
  ('order_line_no', '注文明細番号'),
  ('order_line_nos', '注文明細番号(一覧)'),
  ('work_order_no', '指示書番号'),
  ('delivery_order_no', '出荷書番号'),
  ('delivery_no', '納品番号'),
  ('invoice_no', '請求番号'),
  ('sales_staff', '営業担当'),
  ('created_by_name', '作成者'),
  ('approved_by_name', '承認者'),
  ('requested_by_name', '依頼者'),
  ('ordered_by_name', '発注者'),
  ('processed_by_name', '処理者'),
  ('recorded_by_name', '記録者'),
  ('worker_name', '作業者'),
  ('assignee_name', '担当者'),
  ('approver_name', '承認者'),
  ('delegate_for_name', '被代理者'),
  ('customer_name', '顧客名'),
  ('customer_branch_name', '顧客支店名'),
  ('ship_to_name', '出荷先名'),
  ('end_user_name', '需要家名'),
  ('recipient_name', '納品先名'),
  ('recipient_branch_name', '納品先支店名'),
  ('supplier_name', '仕入先名'),
  ('product_name', '製品名'),
  ('material_name', '素材名'),
  ('material_type_name', '材種名'),
  ('process_step_name', '工程名'),
  ('process_category', '工程カテゴリ'),
  ('plant_name', '拠点名'),
  ('from_plant_name', '出荷元拠点'),
  ('assigned_plant_name', '担当拠点'),
  ('storage_location_name', '保管場所'),
  ('work_location_name', '作業場所'),
  ('template_name', '検査表'),
  ('related_process_step_name', '関連工程'),
  ('defect_type_name', '不良種類'),
  ('approval_group_name', '承認グループ'),
  ('manufacturer_name', 'メーカー'),
  ('grade_name', '材種グレード'),
  ('shape_name', '形状'),
  ('surface_finish_name', '黒皮研磨'),
  ('region_name', '地域'),
  ('name_ja', '名称(日本語)'),
  ('name_en', '名称(英語)'),
  ('acceptance_status', '請書状態'),
  ('roles', 'ロール'),
  ('unit_price_jpy', '単価(JPY)'),
  ('unit_price_usd', '単価(USD)'),
  ('amount_jpy', '金額(JPY)'),
  ('amount_usd', '金額(USD)'),
  ('base_unit_price_jpy', '基準単価(JPY)'),
  ('base_unit_price_usd', '基準単価(USD)'),
  ('total_amount_jpy', '合計金額(JPY)'),
  ('total_amount_usd', '合計金額(USD)')
)
UPDATE metabase_field f SET display_name = m.ja
FROM m, metabase_table t, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND f.name = m.col AND f.display_name IS DISTINCT FROM m.ja;

-- ─── ビュー間 PK/FK メタデータ（結合キーの自動提案・暗黙結合用） ──
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務'),
m(tbl, col) AS (VALUES
  ('v_currencies', 'code'),
  ('v_order_acceptances', 'order_no'),
  ('v_order_lines', 'order_line_no'),
  ('v_quotes', 'quote_no'),
  ('v_work_orders', 'work_order_no'),
  ('v_material_purchase_orders', 'po_number'),
  ('v_purchase_requests', 'request_number'),
  ('v_invoices', 'invoice_no'),
  ('v_delivery_orders', 'delivery_order_no'),
  ('v_delivery_notes', 'delivery_no'),
  ('v_price_list_entries', 'price_list_no'),
  ('v_estimates', 'estimate_no')
)
UPDATE metabase_field f SET semantic_type = 'type/PK'
FROM m, metabase_table t, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = m.tbl AND f.name = m.col
  AND f.semantic_type IS DISTINCT FROM 'type/PK';

WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_order_acceptances' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_order_lines' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_quotes' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_quote_items' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_invoices' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_material_purchase_orders' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_material_purchase_order_items' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_price_list_entries' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_price_list_variants' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_work_orders' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_product_inventory' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_products' AND f.name = 'currency'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_currencies'
  AND tf.table_id = tt.id AND tf.name = 'code'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_order_lines' AND f.name = 'order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_order_acceptances'
  AND tf.table_id = tt.id AND tf.name = 'order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_delivery_order_items' AND f.name = 'order_line_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_order_lines'
  AND tf.table_id = tt.id AND tf.name = 'order_line_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_invoice_items' AND f.name = 'order_line_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_order_lines'
  AND tf.table_id = tt.id AND tf.name = 'order_line_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_design_requests' AND f.name = 'order_line_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_order_lines'
  AND tf.table_id = tt.id AND tf.name = 'order_line_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_inventory_reservations' AND f.name = 'order_line_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_order_lines'
  AND tf.table_id = tt.id AND tf.name = 'order_line_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_quote_items' AND f.name = 'quote_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_quotes'
  AND tf.table_id = tt.id AND tf.name = 'quote_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_order_acceptances' AND f.name = 'quote_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_quotes'
  AND tf.table_id = tt.id AND tf.name = 'quote_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_order_lines' AND f.name = 'quote_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_quotes'
  AND tf.table_id = tt.id AND tf.name = 'quote_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_design_requests' AND f.name = 'quote_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_quotes'
  AND tf.table_id = tt.id AND tf.name = 'quote_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_work_order_steps' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_work_order_step_plans' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_work_order_step_actuals' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_inspection_records' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_defect_records' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_delivery_orders' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_product_inventory' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_inventory_reservations' AND f.name = 'work_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_work_orders'
  AND tf.table_id = tt.id AND tf.name = 'work_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_material_purchase_order_items' AND f.name = 'po_number'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_material_purchase_orders'
  AND tf.table_id = tt.id AND tf.name = 'po_number'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_material_receipts' AND f.name = 'po_number'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_material_purchase_orders'
  AND tf.table_id = tt.id AND tf.name = 'po_number'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_purchase_requests' AND f.name = 'po_number'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_material_purchase_orders'
  AND tf.table_id = tt.id AND tf.name = 'po_number'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_purchase_request_items' AND f.name = 'request_number'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_purchase_requests'
  AND tf.table_id = tt.id AND tf.name = 'request_number'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_delivery_order_items' AND f.name = 'delivery_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_delivery_orders'
  AND tf.table_id = tt.id AND tf.name = 'delivery_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_delivery_notes' AND f.name = 'delivery_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_delivery_orders'
  AND tf.table_id = tt.id AND tf.name = 'delivery_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_invoice_items' AND f.name = 'delivery_order_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_delivery_orders'
  AND tf.table_id = tt.id AND tf.name = 'delivery_order_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_delivery_note_items' AND f.name = 'delivery_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_delivery_notes'
  AND tf.table_id = tt.id AND tf.name = 'delivery_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_invoice_items' AND f.name = 'delivery_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_delivery_notes'
  AND tf.table_id = tt.id AND tf.name = 'delivery_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_invoice_items' AND f.name = 'invoice_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_invoices'
  AND tf.table_id = tt.id AND tf.name = 'invoice_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_price_list_variants' AND f.name = 'price_list_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_price_list_entries'
  AND tf.table_id = tt.id AND tf.name = 'price_list_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);
WITH target AS (SELECT id FROM metabase_database WHERE name = 'CKK 業務')
UPDATE metabase_field f SET semantic_type = 'type/FK', fk_target_field_id = tf.id
FROM metabase_table t, metabase_table tt, metabase_field tf, target
WHERE f.table_id = t.id AND t.db_id = target.id AND t.schema = 'analytics'
  AND t.name = 'v_price_list_variants' AND f.name = 'estimate_no'
  AND tt.db_id = target.id AND tt.schema = 'analytics' AND tt.name = 'v_estimates'
  AND tf.table_id = tt.id AND tf.name = 'estimate_no'
  AND (f.semantic_type IS DISTINCT FROM 'type/FK' OR f.fk_target_field_id IS DISTINCT FROM tf.id);

COMMIT;
