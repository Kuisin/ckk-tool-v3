-- Baseline 6/6 — views, functions, triggers, comments.

SET check_function_bodies = false;

-- app.purge_document_children() (FUNCTION)
CREATE FUNCTION app.purge_document_children() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_owner_type text  := TG_ARGV[0];
  v_mode       text  := TG_ARGV[1];
  v_arg        text  := TG_ARGV[2];
  v_row        jsonb := to_jsonb(OLD);
  v_owner_id   text;
BEGIN
  IF v_mode = 'doc' THEN
    v_owner_id := v_arg || '-' || (v_row ->> 'year_month')
                       || '-' || lpad(v_row ->> 'seq', 5, '0');
  ELSIF v_mode = 'line' THEN
    IF (v_row ->> 'branch') IS NULL THEN
      RETURN OLD;  -- 未確定の明細は公開番号を持たない
    END IF;
    v_owner_id := 'ORD-' || (v_row ->> 'acceptance_year_month')
                         || '-' || lpad(v_row ->> 'acceptance_seq', 5, '0')
                         || '-' || lpad(v_row ->> 'branch', 2, '0');
  ELSE
    v_owner_id := v_row ->> v_arg;
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM app.approval_requests
   WHERE target_type = v_owner_type AND target_id = v_owner_id;

  DELETE FROM app.document_memos
   WHERE owner_type = v_owner_type AND owner_id = v_owner_id;

  -- memo_id は ON DELETE SET NULL なので、上の削除では消えない
  DELETE FROM app.document_memo_revisions
   WHERE owner_type = v_owner_type AND owner_id = v_owner_id;

  DELETE FROM app.document_attachments
   WHERE owner_type = v_owner_type AND owner_id = v_owner_id;

  RETURN OLD;
END;
$$;

-- app.FUNCTION purge_document_children() (COMMENT)
COMMENT ON FUNCTION app.purge_document_children() IS '書類の AFTER DELETE で、業務キー文字列で紐づく子行（承認依頼・メモ・改訂・添付）を消す。owner_type と業務キーの作り方を TG_ARGV で受ける。';

SET default_tablespace = '';

SET default_table_access_method = heap;

-- app.COLUMN business_partners.match_names_auto (COMMENT)
COMMENT ON COLUMN app.business_partners.match_names_auto IS 'フリガナ等から自動生成した照合名（カタカナ/ひらがな/ローマ字）。UI では編集しない。';

-- app.COLUMN document_attachments.is_locked (COMMENT)
COMMENT ON COLUMN app.document_attachments.is_locked IS 'システムが付けた添付（取込元の原本など）。削除・差し替え不可。';

-- app.TABLE match_aliases (COMMENT)
COMMENT ON TABLE app.match_aliases IS '学習した照合名（人が手で結び付けた「印字された表記 → マスタ」）。1 表記 = 1 マスタ。';

-- app.COLUMN materials.match_names (COMMENT)
COMMENT ON COLUMN app.materials.match_names IS '検索・AI 突合用のキーワード（別名・略称・読み・英字表記）。';

-- app.TABLE order_acceptance_cancel_requests (COMMENT)
COMMENT ON TABLE app.order_acceptance_cancel_requests IS '承認されるまで適用しない注文請書キャンセル依頼。承認設定が未設定なら作られず即適用される。';

-- app.COLUMN products.match_names (COMMENT)
COMMENT ON COLUMN app.products.match_names IS '検索・AI 突合用のキーワード（別名・略称・読み・英字表記）。';

-- app.COLUMN users.date_format (COMMENT)
COMMENT ON COLUMN app.users.date_format IS '日付の並び（YYYY/MM/DD | YYYY-MM-DD | DD/MM/YYYY | MM/DD/YYYY）。表示のみ。';

-- app.COLUMN users.time_format (COMMENT)
COMMENT ON COLUMN app.users.time_format IS '時刻表記（24h | 12h）。表示のみ。';

-- app.COLUMN users.time_zone (COMMENT)
COMMENT ON COLUMN app.users.time_zone IS '表示タイムゾーン（IANA 名）。保存は常に UTC で、読み替えだけを決める。';

-- app.user_permissions (VIEW)
CREATE VIEW app.user_permissions AS
 SELECT urr.user_id,
    rpr.action,
    rpr.permission_code,
    rpr.scope,
    rpr.scope_values
   FROM ((app.user_role_relation urr
     JOIN app.users u ON (((u.id = urr.user_id) AND u.is_active)))
     JOIN app.role_permission_relation rpr ON ((rpr.role_id = urr.role_id)))
  WHERE (urr.is_active AND ((urr.deactivate_at IS NULL) OR (urr.deactivate_at > now())));

-- app.TABLE work_order_flow_changes (COMMENT)
COMMENT ON TABLE app.work_order_flow_changes IS '承認されるまで適用しない工程フロー変更（分岐の追加/更新/削除）。承認設定が未設定なら作られず即適用される。';

-- app.delivery_orders purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.delivery_orders FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('delivery_orders', 'doc', 'DOR');

-- app.design_requests purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.design_requests FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('design_requests', 'col', 'request_number');

-- app.estimates purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.estimates FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('estimates', 'doc', 'EST');

-- app.invoices purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.invoices FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('invoices', 'doc', 'INV');

-- app.material_purchase_orders purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.material_purchase_orders FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('material_purchase_orders', 'col', 'po_number');

-- app.material_receipts purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.material_receipts FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('material_receipts', 'col', 'id');

-- app.order_acceptance_cancel_requests purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.order_acceptance_cancel_requests FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('order_acceptance_cancel_requests', 'col', 'id');

-- app.order_acceptances purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.order_acceptances FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('order_acceptances', 'doc', 'ORD');

-- app.order_lines purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.order_lines FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('order_lines', 'line', '');

-- app.price_list_entries purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.price_list_entries FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('price_list_entries', 'doc', 'PRC');

-- app.purchase_requests purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.purchase_requests FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('purchase_requests', 'col', 'request_number');

-- app.quotes purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.quotes FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('quotes', 'doc', 'QOT');

-- app.work_order_flow_changes purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.work_order_flow_changes FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('work_order_flow_changes', 'col', 'id');

-- app.work_orders purge_children_after_delete (TRIGGER)
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON app.work_orders FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('work_orders', 'col', 'work_order_number');
