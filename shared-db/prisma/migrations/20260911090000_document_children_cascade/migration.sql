-- 書類を消したら、その書類にぶら下がる多態の子行も一緒に消す（DB 側で強制）
--
-- 背景: 承認依頼・メモ・添付は書類を **業務キーの文字列** で指す
-- （approval_requests.target_type/target_id、document_memos・
--  document_attachments の owner_type/owner_id）。audit と同じ多態規約で、
-- 書類テーブルへの FK ではない。したがって書類行を消しても子行は残る。
--
-- 実害: 採番（numbering_sequences）を戻して同じ番号が再利用されると、新しい
-- 書類が前の（削除済み）書類の子行を引き継いで見えてしまう。2026-08-19 に dev
-- で発生 — 注文請書 ORD-202608-00003（08/19 00:06 作成）の承認記録に、作成より
-- 前（08/18 20:35）の「第一承認」が並んだ。孤児は 3 件あった。
--
-- アプリには書類の削除機能が無い（orderAcceptance.delete 等は 1 箇所も無い）。
-- 実際に消えるのは psql 直叩き・スクリプト・リストアなので、防御はアプリ側
-- （Prisma のトランザクション）では効かない。DB 側に置く必要がある。
--
-- 方式: 各書類テーブルの AFTER DELETE トリガー。多態設計はそのまま残せて、
-- どの経路の DELETE でも確実に効く。approval_records / approval_request_approvers
-- は approval_requests への既存 FK（ON DELETE CASCADE）で連鎖する。
--
-- 対象外（意図的）:
--   audit_logs      — 書類を消しても監査記録は残すのが通例。番号再利用時の
--                     混入はアプリ側の世代スコープで吸収する。
--   files / SeaweedFS — 添付の実体。document_attachments 行は消えるが files 行と
--                     オブジェクトは残る（他から参照され得るため）。掃除は別途。
--   link_index      — owner_type/owner_id を持たない（URL 短縮の索引）ので無関係。

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 共通のトリガー関数
--
--    TG_ARGV[0] = owner_type（= テーブルの @@map 名）
--    TG_ARGV[1] = 業務キーの作り方 'doc' | 'line' | 'col'
--    TG_ARGV[2] = 'doc' なら接頭辞（ORD/QOT/…）、'col' なら列名
--
--    'doc'  … PREFIX-YYYYMM-NNNNN（year_month + seq の複合キー）
--    'line' … ORD-YYYYMM-NNNNN-NN（注文明細。branch は確定時に採番されるので
--             未確定行は番号を持たない = 子行も存在しない → 何もしない）
--    'col'  … 指定列の値そのまま（po_number / work_order_number / uuid …）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.purge_document_children()
RETURNS TRIGGER
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

COMMENT ON FUNCTION app.purge_document_children() IS
  '書類の AFTER DELETE で、業務キー文字列で紐づく子行（承認依頼・メモ・改訂・添付）を消す。owner_type と業務キーの作り方を TG_ARGV で受ける。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 各書類テーブルへの設置
--
--    どの owner_type がどの子テーブルを持つかは以下のとおり（設置は一律で、
--    持っていない組み合わせは単に 0 行 DELETE になる）:
--      承認依頼 … order_acceptances / work_orders /
--                 material_purchase_orders / purchase_requests
--      メモ     … quotes / order_acceptances / order_lines / work_orders /
--                 shipping_orders / invoices / price_list_entries / estimates
--      添付     … design_requests / material_purchase_orders /
--                 material_receipts / order_acceptances
-- ─────────────────────────────────────────────────────────────────────────────

-- year_month + seq の複合キーを持つ書類
CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.order_acceptances
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('order_acceptances', 'doc', 'ORD');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.quotes
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('quotes', 'doc', 'QOT');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.estimates
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('estimates', 'doc', 'EST');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.price_list_entries
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('price_list_entries', 'doc', 'PRC');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.shipping_orders
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('shipping_orders', 'doc', 'SHP');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('invoices', 'doc', 'INV');

-- 注文明細（枝番つき）
CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.order_lines
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('order_lines', 'line', '');

-- 単一列がそのまま業務キーになる書類
CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.work_orders
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('work_orders', 'col', 'work_order_number');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.material_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('material_purchase_orders', 'col', 'po_number');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('purchase_requests', 'col', 'request_number');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.design_requests
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('design_requests', 'col', 'request_number');

CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.material_receipts
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('material_receipts', 'col', 'id');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 既存の孤児を掃除
--
--    「書類が存在しない」子行を落とす。番号を再利用した分（書類は在るが子行の
--    ほうが古い）は、書類ごとの作成日時と突き合わせないと判定できないため
--    ここでは触らない — アプリ側の世代スコープ（lib/approvals.ts）が吸収する。
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM app.approval_requests r
 WHERE r.target_type = 'order_acceptances'
   AND NOT EXISTS (
     SELECT 1 FROM app.order_acceptances o
      WHERE 'ORD-' || o.year_month || '-' || lpad(o.seq::text, 5, '0') = r.target_id
   );

DELETE FROM app.approval_requests r
 WHERE r.target_type = 'work_orders'
   AND NOT EXISTS (
     SELECT 1 FROM app.work_orders w WHERE w.work_order_number::text = r.target_id
   );

DELETE FROM app.approval_requests r
 WHERE r.target_type = 'material_purchase_orders'
   AND NOT EXISTS (
     SELECT 1 FROM app.material_purchase_orders p WHERE p.po_number = r.target_id
   );

DELETE FROM app.approval_requests r
 WHERE r.target_type = 'purchase_requests'
   AND NOT EXISTS (
     SELECT 1 FROM app.purchase_requests q WHERE q.request_number = r.target_id
   );
