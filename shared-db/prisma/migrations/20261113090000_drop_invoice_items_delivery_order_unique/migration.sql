-- 出荷書 1 通 = 請求明細 1 行、を強制していた部分 unique index を落とす（issue #871）。
--
-- invoice_items は 出荷書の明細行ごと（lib/invoice-generation.ts）＋ 出荷書由来の
-- 追加料金（送料など、#883）に 1 行ずつ作られ、どの行も同じ出荷書キーを持つ。
-- この index があると、明細が 2 本以上ある出荷書、または料金行が 1 つでも付いた
-- 出荷書は P2002 で請求書が作れず、締日処理は「請求書の生成に失敗しました」の
-- まま PENDING に残っていた。
--
-- 「請求済みか」の判定は集合の所属で行っている（closings/data.ts）ので、一意性に
-- 依存しているものは無い。検索用に通常の index へ置き換える。
DROP INDEX IF EXISTS "app"."invoice_items_delivery_order_unique";

CREATE INDEX "invoice_items_delivery_order_idx"
  ON "app"."invoice_items"("delivery_order_year_month", "delivery_order_seq");

-- ─── 入金前承認（target_type = 'invoice_payments'）も請求書と一緒に消す ─────────
-- 20261028090000 で approval_flows に 'invoice_payments' を足したが、請求書の
-- AFTER DELETE トリガーは 'invoices' の子しか消していなかった。請求書を消して
-- 採番を戻すと、同じ INV- 番号が PENDING の入金前承認を引き継ぎ、
-- 「(target_type, target_id) につき PENDING は 1 件」の部分 unique に当たって
-- 新しい請求書の入金前承認が出せなくなる。同じ関数に owner_type だけ替えて
-- 2 本目のトリガーとして載せる（メモ・添付への DELETE は該当行が無いので無害）。
DROP TRIGGER IF EXISTS purge_payment_children_after_delete ON "app"."invoices";
CREATE TRIGGER purge_payment_children_after_delete
  AFTER DELETE ON "app"."invoices"
  FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('invoice_payments', 'doc', 'INV');
