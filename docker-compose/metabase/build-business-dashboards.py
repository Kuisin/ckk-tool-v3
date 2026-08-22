#!/usr/bin/env python3
"""Metabase「CKK 業務」データソース（db 5）に受注・生産・請求・在庫のダッシュボードと
カードを作る。名前で冪等（同名カード/ダッシュボードは作り直さず更新）。

  MB_URL=https://bi.ckk-tool.co.jp MB_API_KEY=mb_... MB_DB_ID=5 MB_COLLECTION_ID=6 \
    python3 build-business-dashboards.py

フォルダ構成（利用者が整理した形。維持すること）:
  CKK 業務/            … ダッシュボード（受注・売上 / 生産進捗 / 請求 / 在庫）
  CKK 業務/_カード/    … 質問（カード）は全部ここ
既存カードは親と _カード の両方から名前で探し、見つかった場所のまま更新する —
このスクリプトはカードを移動しない。新規カードは _カード へ作る。

カードは **標準 UI エディタ（クエリビルダー / MBQL）** の質問として作る — 利用者が
ノートブックエディタで開いて編集できる形（native SQL は使わない方針。表現できない
ものが出たときだけ例外にする）。ソースは analytics ビュー（名前解決・通貨換算・
フィルタ列がそろっている）。列見出しはビューの日本語表示名（metabase-business-ja.sql）
がそのまま使われる。

状態 enum の日本語表示は SQL の CASE ではなく **field value remapping**（フィールド
値のカスタム表示 — /api/field/:id/dimension + /values）で行う。表・グラフ・
フィルタのドロップダウンすべてで日本語になる。

ダッシュボードフィルタ: 全ダッシュボードに「期間」（日付範囲）+「通貨」。MBQL
カードはダッシュボードパラメータを **列に直接マップ**できる（template tag 不要）。
通貨列が無いビューのカード（工程・素材在庫・在庫予約・締日処理）は通貨フィルタの
対象外（未マップ = フィルタで変化しない）。指示書・製品在庫の通貨は「製品の通貨」。
工程の期間は started_at（実行日）基準。請求月次は issued_at 基準。
"""
import json
import os
import urllib.request
import uuid

MB_URL = os.environ.get("MB_URL", "https://bi.ckk-tool.co.jp").rstrip("/")
API_KEY = os.environ["MB_API_KEY"]
DB_ID = int(os.environ.get("MB_DB_ID", "5"))
COLLECTION_ID = int(os.environ.get("MB_COLLECTION_ID", "6"))
# 利用者が UI でレイアウトを編集した後は MB_CARDS_ONLY=1 でカード更新だけ行う
# （ダッシュボード PUT はレイアウトを上書きするため）。フィルタ配線の追随は
# wire-dashboard-filters.py。
CARDS_ONLY = os.environ.get("MB_CARDS_ONLY", "") == "1"


def api(method, path, body=None):
    url = f"{MB_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("x-api-key", API_KEY)
    req.add_header("Content-Type", "application/json")
    # 公開ホスト（Cloudflare Access 越し）は素の python-urllib UA を 403 にする
    req.add_header("User-Agent", "ckk-metabase-builder/1.0")
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else {}


def det_id(*parts):
    """決定的 ID（uuid5）— 再実行してもダッシュボード設定が揺れない。"""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "ckk-metabase://" + "/".join(parts)))


# ─── 状態 enum → 日本語（design.md §9） — field value remapping に流し込む ──
OA_ST = {"IMPORT": "取込中", "DRAFT": "下書き", "REQUESTED": "承認依頼中",
         "APPROVED": "承認済", "COMPLETED": "展開済", "ARCHIVED": "アーカイブ"}
OL_ST = {"DRAFT": "下書き", "CONFIRMED": "確定", "IN_PRODUCTION": "製造中",
         "PARTIAL_SHIPPED": "一部出荷", "SHIPPED": "出荷済", "CANCELLED": "キャンセル"}
WO_ST = {"DRAFT": "下書き", "PENDING_APPROVAL": "承認待ち", "APPROVED": "承認済",
         "IN_PROGRESS": "進行中", "COMPLETED": "完了", "CANCELLED": "キャンセル"}
WOA_ST = {"NONE": "なし", "PENDING": "承認待ち", "APPROVED": "承認済", "REJECTED": "差し戻し"}
STEP_ST = {"PENDING": "未着手", "IN_PROGRESS": "進行中", "COMPLETED": "完了", "CANCELLED": "キャンセル"}
INV_ST = {"DRAFT": "下書き", "ISSUED": "発行済", "SENT": "送付済", "PAID": "支払済"}
BC_ST = {"PENDING": "未処理", "PROCESSED": "処理済", "EXPORTED": "エクスポート済"}
RES_ST = {"RESERVED": "予約中", "CONFIRMED": "引当済", "RELEASED": "解除"}

QUOTE_ST = {"DRAFT": "下書き", "ISSUED": "発行済", "ACCEPTED": "受諾済",
            "REJECTED": "却下", "EXPIRED": "期限切れ"}
EST_ST = {"DRAFT": "下書き", "CONFIRMED": "確定", "REGISTERED": "価格表登録済"}
DOR_ST = {"DRAFT": "下書き", "CONFIRMED": "確定", "SHIPPED": "出荷済"}
DOR_TYPE = {"STOCK_STORAGE": "在庫保管", "DISPATCH": "発送"}
DRN_ST = {"DRAFT": "下書き", "ISSUED": "発行済", "DELIVERED": "納品済"}
PO_ST = {"DRAFT": "下書き", "REQUESTED": "承認依頼中", "APPROVED": "承認済",
         "ORDERED": "発注済", "COMPLETED": "入荷完了", "CANCELLED": "キャンセル"}
PR_ST = {"DRAFT": "下書き", "REQUESTED": "承認依頼中", "APPROVED": "承認済",
         "REJECTED": "差し戻し", "ORDERED": "発注済", "CANCELLED": "キャンセル"}
DSG_ST = {"PENDING": "未着手", "IN_PROGRESS": "進行中", "COMPLETED": "完了"}
DSG_TRG = {"QUOTE": "見積時", "SALES_ORDER": "受注時"}
INSP_ST = {"PENDING": "未実施", "PASS": "合格", "FAIL": "不合格", "APPROVED": "承認済"}
APRQ_ST = {"PENDING": "承認待ち", "APPROVED": "承認済", "REJECTED": "差し戻し"}
APR_ACT = {"APPROVED": "承認", "REJECTED": "差し戻し"}
APR_MODE = {"ANY": "いずれか1名", "ALL": "全員"}
ORDER_TYPE = {"PRODUCTION": "本番", "TEST": "テスト", "SAMPLE": "サンプル", "OTHER": "その他"}
WO_TYPE = {"FROM_STOCK": "在庫分", "MANUFACTURE": "製造分"}
DELIV_METHOD = {"DIRECT_TO_USER": "ユーザー直送", "NORMAL": "通常納品"}
INV_TYPE = {"PRODUCT": "製品", "MATERIAL": "素材"}
TXN_TYPE = {"IN": "入庫", "OUT": "出庫", "RESERVE": "予約", "RELEASE": "解除", "ADJUST": "棚卸調整"}
STEP_EXEC = {"INTERNAL": "社内", "OUTSOURCE": "外注"}
PROC_CAT = {"MATERIAL_PREP": "材料準備", "MACHINING": "加工", "COATING": "コーティング",
            "INSPECTION": "検査", "APPROVAL": "検査承認", "SHIPPING": "出荷"}
PROC_EXEC = {"INTERNAL": "社内のみ", "INTERNAL_OR_OUTSOURCE": "社内・外注"}

# (ビュー, 列) → 値マップ。remapping はビュー側の列に付ける（カードが参照する列）。
REMAP = {
    ("v_order_acceptances", "status"): OA_ST,
    ("v_order_lines", "status"): OL_ST,
    ("v_order_lines", "acceptance_status"): OA_ST,
    ("v_work_orders", "status"): WO_ST,
    ("v_work_orders", "approval_status"): WOA_ST,
    ("v_work_order_steps", "status"): STEP_ST,
    ("v_invoices", "status"): INV_ST,
    ("v_billing_closings", "status"): BC_ST,
    ("v_inventory_reservations", "status"): RES_ST,
    ("v_order_lines_disp", "status"): OL_ST,
    ("v_invoices_disp", "status"): INV_ST,
    # 残りの enum も全ビューで日本語表示にする（生 enum 露出の解消）
    ("v_quotes", "status"): QUOTE_ST,
    ("v_estimates", "status"): EST_ST,
    ("v_delivery_orders", "status"): DOR_ST,
    ("v_delivery_orders", "type"): DOR_TYPE,
    ("v_delivery_notes", "status"): DRN_ST,
    ("v_delivery_notes", "delivery_method"): DELIV_METHOD,
    ("v_material_purchase_orders", "status"): PO_ST,
    ("v_purchase_requests", "status"): PR_ST,
    ("v_design_requests", "status"): DSG_ST,
    ("v_design_requests", "trigger"): DSG_TRG,
    ("v_inspection_records", "status"): INSP_ST,
    ("v_approval_requests", "status"): APRQ_ST,
    ("v_approval_requests", "mode"): APR_MODE,
    ("v_approval_records", "action"): APR_ACT,
    ("v_order_lines", "order_type"): ORDER_TYPE,
    ("v_quote_items", "order_type"): ORDER_TYPE,
    ("v_price_list_variants", "order_type"): ORDER_TYPE,
    ("v_work_orders", "type"): WO_TYPE,
    ("v_work_order_steps", "execution_location"): STEP_EXEC,
    ("v_work_order_steps", "process_category"): PROC_CAT,
    ("v_process_step_catalog", "category"): PROC_CAT,
    ("v_process_step_catalog", "execution_location"): PROC_EXEC,
    ("v_inventory_reservations", "inventory_type"): INV_TYPE,
    ("v_inventory_transactions", "inventory_type"): INV_TYPE,
    ("v_inventory_transactions", "transaction_type"): TXN_TYPE,
}

# 通貨フィルタのドロップダウンに値一覧を出す列
LIST_VALUE_FIELDS = [
    ("v_order_acceptances", "currency"), ("v_order_lines", "currency"),
    ("v_work_orders", "currency"), ("v_invoices", "currency"),
    ("v_product_inventory", "currency"),
    ("v_order_lines_disp", "display_currency"), ("v_invoices_disp", "display_currency"),
    ("v_order_lines", "status"), ("v_order_lines_disp", "status"),
]

# 状態フィルタ（受注・売上）— 注文明細の status を持つビューのカードに配線する。
# 注文請書の status は別 enum（取込ワークフロー）なので対象外。
STATUS_FILTER_TABLES = {"v_order_lines", "v_order_lines_disp"}

# ─── カード定義（MBQL） ──────────────────────────────────────────────
# table   … analytics ビュー名（source-table + フィルタマップ先）
# date_col… 期間フィルタの列 / cur … 通貨フィルタ対象（ビューに currency がある）
# q       … クエリ仕様（下の build_query が MBQL に組み立てる）
#   agg: ("count",) | ("sum", col)
#   breakout: [col | (col, temporal-unit) | ("expr", name)]
#   filters:  [("!=", col, v...) | ("=", col, v...) | ("not-null", col)]
#   expressions: {name: ("coalesce", col, fallback)}
#   fields / order_by / limit … 非集計テーブル用
CARDS = [
    # 受注・売上
    dict(key="oa_total", name="注文請書 総数", display="scalar",
         table="v_order_acceptances", date_col="order_date", cur=True,
         q=dict(agg=("count",))),
    dict(key="ol_total", name="注文明細 総数", display="scalar",
         table="v_order_lines", date_col="order_date", cur=True,
         q=dict(agg=("count",))),
    # 合計は通貨記号つきスカラー（表示通貨フィルタで JPY/USD 切替 — 常に 1 行）
    dict(key="sales_total", name="受注金額 合計", display="scalar",
         table="v_order_lines_disp", date_col="order_date", disp=True,
         q=dict(agg=("sum", "amount_disp"), breakout=["display_currency"],
                filters=[("!=", "status", "CANCELLED")], money_text=True)),
    dict(key="oa_by_status", name="注文請書 状態別", display="bar",
         table="v_order_acceptances", date_col="order_date", cur=True,
         q=dict(agg=("count",), breakout=["status"], order_desc_agg=True)),
    dict(key="ol_by_status", name="注文明細 状態別", display="bar",
         table="v_order_lines", date_col="order_date", cur=True,
         q=dict(agg=("count",), breakout=["status"], order_desc_agg=True)),
    dict(key="sales_monthly", name="受注金額 月次", display="bar",
         table="v_order_lines_disp", date_col="order_date", disp=True,
         q=dict(agg=("sum", "amount_disp"), breakout=[("order_date", "month"), "display_currency"],
                filters=[("!=", "status", "CANCELLED")])),
    dict(key="sales_by_customer", name="顧客別 受注金額 上位", display="row",
         table="v_order_lines_disp", date_col="order_date", disp=True,
         q=dict(agg=("sum", "amount_disp"), breakout=["customer_name", "display_currency"],
                filters=[("!=", "status", "CANCELLED"), ("not-null", "customer_name")],
                order_desc_agg=True, limit=10)),
    dict(key="sales_by_staff", name="営業担当別 受注金額", display="row",
         table="v_order_lines_disp", date_col="order_date", disp=True,
         q=dict(agg=("sum", "amount_disp"),
                expressions={"営業担当": ("coalesce", "sales_staff", "（担当未設定）")},
                breakout=[("expr", "営業担当"), "display_currency"],
                filters=[("!=", "status", "CANCELLED")], order_desc_agg=True)),
    dict(key="sales_staff_monthly", name="営業担当別 受注金額 月次", display="bar", stacked=True,
         table="v_order_lines_disp", date_col="order_date", disp=True,
         q=dict(agg=("sum", "amount_disp"),
                expressions={"営業担当": ("coalesce", "sales_staff", "（担当未設定）")},
                breakout=[("order_date", "month"), ("expr", "営業担当")],
                filters=[("!=", "status", "CANCELLED")])),
    dict(key="oa_recent", name="最近の注文明細", display="table",
         table="v_order_lines", date_col="order_date", cur=True,
         q=dict(fields=["order_line_no", "customer_name", "sales_staff", "product_name",
                        "quantity", "amount", "status"],
                order_by=[("desc", "acceptance_year_month"), ("desc", "acceptance_seq"),
                          ("desc", "branch")],
                limit=20)),
    # 生産進捗（通貨 = 製品の通貨。工程は started_at 基準・通貨対象外）
    dict(key="wo_total", name="指示書 総数", display="scalar",
         table="v_work_orders", date_col="created_at", cur=True,
         q=dict(agg=("count",))),
    dict(key="wo_inprogress", name="進行中の指示書", display="scalar",
         table="v_work_orders", date_col="created_at", cur=True,
         q=dict(agg=("count",), filters=[("=", "status", "IN_PROGRESS")])),
    dict(key="step_total", name="工程 総数", display="scalar",
         table="v_work_order_steps", date_col="started_at", cur=False,
         q=dict(agg=("count",))),
    dict(key="wo_by_status", name="指示書 状態別", display="bar",
         table="v_work_orders", date_col="created_at", cur=True,
         q=dict(agg=("count",), breakout=["status"], order_desc_agg=True)),
    dict(key="wo_by_approval", name="指示書 承認状態別", display="bar",
         table="v_work_orders", date_col="created_at", cur=True,
         q=dict(agg=("count",), breakout=["approval_status"], order_desc_agg=True)),
    dict(key="step_by_status", name="工程 状態別", display="bar",
         table="v_work_order_steps", date_col="started_at", cur=False,
         q=dict(agg=("count",), breakout=["status"], order_desc_agg=True)),
    dict(key="wo_active", name="進行中・承認待ちの指示書", display="table",
         table="v_work_orders", date_col="created_at", cur=True,
         q=dict(fields=["work_order_no", "lot_number", "product_name", "planned_quantity",
                        "created_by_name", "status", "approval_status"],
                filters=[("=", "status", "IN_PROGRESS", "PENDING_APPROVAL", "APPROVED")],
                order_by=[("desc", "year_month"), ("desc", "seq")], limit=20)),
    # 請求
    dict(key="inv_total", name="請求書 総数", display="scalar",
         table="v_invoices", date_col="created_at", cur=True,
         q=dict(agg=("count",))),
    dict(key="inv_amount", name="請求額 合計", display="scalar",
         table="v_invoices_disp", date_col="created_at", disp=True,
         q=dict(agg=("sum", "total_amount_disp"), breakout=["display_currency"],
                filters=[("!=", "status", "DRAFT")], money_text=True)),
    dict(key="inv_by_status", name="請求書 状態別", display="bar",
         table="v_invoices", date_col="created_at", cur=True,
         q=dict(agg=("count",), breakout=["status"], order_desc_agg=True)),
    dict(key="inv_monthly", name="請求額 月次", display="bar",
         table="v_invoices_disp", date_col="created_at", disp=True,
         q=dict(agg=("sum", "total_amount_disp"), breakout=[("issued_at", "month")],
                filters=[("!=", "status", "DRAFT")])),
    dict(key="closing_by_status", name="締日処理 状態別", display="bar",
         table="v_billing_closings", date_col="created_at", cur=False,
         q=dict(agg=("count",), breakout=["status"], order_desc_agg=True)),
    # 在庫（期間 = 更新日/予約日。通貨 = 製品の通貨（製品在庫のみ））
    dict(key="prod_stock_total", name="製品在庫 総数量", display="scalar",
         table="v_product_inventory", date_col="updated_at", cur=True,
         q=dict(agg=("sum", "quantity"))),
    dict(key="mat_stock_total", name="素材在庫 総数量", display="scalar",
         table="v_material_inventory", date_col="updated_at", cur=False,
         q=dict(agg=("sum", "quantity"))),
    dict(key="prod_stock_top", name="製品在庫 上位", display="row",
         table="v_product_inventory", date_col="updated_at", cur=True,
         q=dict(agg=("sum", "quantity"), breakout=["product_name"],
                filters=[("not-null", "product_name")], order_desc_agg=True, limit=10)),
    dict(key="mat_stock_top", name="素材在庫 上位", display="row",
         table="v_material_inventory", date_col="updated_at", cur=False,
         q=dict(agg=("sum", "quantity"), breakout=["material_name"],
                filters=[("not-null", "material_name")], order_desc_agg=True, limit=10)),
    dict(key="res_by_status", name="在庫予約 状態別", display="bar",
         table="v_inventory_reservations", date_col="reserved_at", cur=False,
         q=dict(agg=("count",), breakout=["status"], order_desc_agg=True)),
]

# ─── ダッシュボード定義（グリッド: 幅 24。row/col/sizeX/sizeY） ──────
DASHBOARDS = [
    dict(name="受注・売上", description="注文請書・注文明細・受注金額の概況", layout=[
        ("oa_total", 0, 0, 6, 3), ("ol_total", 0, 6, 6, 3), ("sales_total", 0, 12, 12, 3),
        ("oa_by_status", 3, 0, 8, 6), ("ol_by_status", 3, 8, 8, 6), ("sales_monthly", 3, 16, 8, 6),
        ("sales_by_customer", 9, 0, 12, 7), ("oa_recent", 9, 12, 12, 7),
        ("sales_by_staff", 16, 0, 12, 7), ("sales_staff_monthly", 16, 12, 12, 7),
    ]),
    dict(name="生産進捗", description="指示書・工程の状態と進行中の指示書", layout=[
        ("wo_total", 0, 0, 8, 3), ("wo_inprogress", 0, 8, 8, 3), ("step_total", 0, 16, 8, 3),
        ("wo_by_status", 3, 0, 8, 6), ("wo_by_approval", 3, 8, 8, 6), ("step_by_status", 3, 16, 8, 6),
        ("wo_active", 9, 0, 24, 7),
    ]),
    dict(name="請求", description="請求書・請求額・締日処理の概況", layout=[
        ("inv_total", 0, 0, 12, 3), ("inv_amount", 0, 12, 12, 3),
        ("inv_by_status", 3, 0, 8, 6), ("inv_monthly", 3, 8, 8, 6), ("closing_by_status", 3, 16, 8, 6),
    ]),
    dict(name="在庫", description="製品・素材の在庫と在庫予約", layout=[
        ("prod_stock_total", 0, 0, 12, 3), ("mat_stock_total", 0, 12, 12, 3),
        ("prod_stock_top", 3, 0, 12, 7), ("mat_stock_top", 3, 12, 12, 7),
        ("res_by_status", 10, 0, 12, 6),
    ]),
]


def load_metadata():
    """analytics ビューの table id と (table, column) → field id。"""
    meta = api("GET", f"/api/database/{DB_ID}/metadata")
    tables, fields = {}, {}
    for t in meta.get("tables", []):
        if t.get("schema") != "analytics":
            continue
        tables[t["name"]] = t["id"]
        for f in t.get("fields", []):
            fields[(t["name"], f["name"])] = f["id"]
    return tables, fields


def build_query(c, tables, fields):
    """カード仕様 → 標準クエリビルダー（legacy MBQL）の dataset_query。"""
    t = c["table"]
    if t not in tables:
        raise SystemExit(f"table not found in Metabase: analytics.{t} — run a sync first")

    def fref(col, unit=None):
        fid = fields.get((t, col))
        if fid is None:
            raise SystemExit(f"field not found: {t}.{col} — run a Metabase sync first")
        return ["field", fid, {"temporal-unit": unit}] if unit else ["field", fid, None]

    q = {"source-table": tables[t]}
    spec = c["q"]

    for name, (fn, col, fallback) in (spec.get("expressions") or {}).items():
        assert fn == "coalesce"
        q.setdefault("expressions", {})[name] = ["coalesce", fref(col), fallback]

    if spec.get("agg"):
        agg = spec["agg"]
        q["aggregation"] = [["count"] if agg[0] == "count" else ["sum", fref(agg[1])]]

    breakouts = []
    for b in spec.get("breakout") or []:
        if isinstance(b, tuple) and b[0] == "expr":
            breakouts.append(["expression", b[1]])
        elif isinstance(b, tuple):
            breakouts.append(fref(b[0], b[1]))
        else:
            breakouts.append(fref(b))
    if breakouts:
        q["breakout"] = breakouts

    filters = []
    for f in spec.get("filters") or []:
        op, col, *vals = f
        if op == "not-null":
            filters.append(["not-null", fref(col)])
        else:
            filters.append([op, fref(col), *vals])
    if len(filters) == 1:
        q["filter"] = filters[0]
    elif filters:
        q["filter"] = ["and", *filters]

    if spec.get("fields"):
        q["fields"] = [fref(col) for col in spec["fields"]]
    if spec.get("order_desc_agg"):
        q["order-by"] = [["desc", ["aggregation", 0]]]
    elif spec.get("order_by"):
        q["order-by"] = [[direction, fref(col)] for direction, col in spec["order_by"]]
    if spec.get("limit"):
        q["limit"] = spec["limit"]

    if spec.get("money_text"):
        # 2 段クエリ（JPY/USD 併記サマリー）: 1 段目で表示通貨ごとに合計 → 2 段目の
        # カスタム列チェーンで
        # 「通貨記号 + 桁区切りつき数値」（¥162,225 / $1,020.57）を作る。
        # Metabase の legacy→pMBQL 変換は「case の値に式参照」を含む式を黙って
        # 落とすため、case はリテラル値のみで使い、桁区切りは 12 桁ゼロ詰め →
        # 固定位置 substring → regex で先頭の 0/, を除去、という case 不要の
        # 組み立てにしてある（各式は浅く保ち、式参照でチェーンする）。
        disp_ref = ["field", "display_currency", {"base-type": "type/Text"}]
        sum_ref = ["field", "sum", {"base-type": "type/Float"}]
        E = lambda n: ["expression", n]
        exprs = {
            # 整数部（JPY: 四捨五入 / USD: 切り捨て）と USD セント
            "xv": ["case", [[["=", disp_ref, "JPY"], ["floor", ["+", sum_ref, 0.5]]]],
                   {"default": ["floor", sum_ref]}],
            "ce": ["floor", ["+", ["-", ["*", sum_ref, 100], ["*", E("xv"), 100]], 0.5]],
            # 12 桁ゼロ詰め → 3 桁ずつカンマ結合 → 先頭の 0 と , を除去
            "pd": ["concat", "000000000000", E("xv")],
            "p12": ["substring", E("pd"), ["-", ["length", E("pd")], 11], 12],
            "gt_raw": ["concat", ["substring", E("p12"), 1, 3], ",",
                       ["substring", E("p12"), 4, 3], ",",
                       ["substring", E("p12"), 7, 3], ",",
                       ["substring", E("p12"), 10, 3]],
            "gt": ["coalesce", ["regex-match-first", E("gt_raw"), "[1-9][0-9,]*$"], "0"],
            # セント 2 桁ゼロ詰めと、通貨ごとのサフィックス（JPY は空 = 長さ 0）
            "pc": ["concat", "0", E("ce")],
            "p2c": ["substring", E("pc"), ["-", ["length", E("pc")], 1], 2],
            "sym": ["case", [[["=", disp_ref, "JPY"], "¥"]], {"default": "$"}],
            "sfxlen": ["case", [[["=", disp_ref, "JPY"], 0]], {"default": 4}],
            "sfx": ["substring", ["concat", ".", E("p2c")], 1, E("sfxlen")],
            "金額": ["concat", E("sym"), E("gt"), E("sfx")],
        }
        q = {"source-query": q, "expressions": exprs, "fields": [["expression", "金額"]]}

    return {"database": DB_ID, "type": "query", "query": q}


# 金額列（¥ プレフィックス）と本数系の数量列（〜本 サフィックス）
MONEY_COLS = {"amount", "total_amount", "subtotal", "unit_price"}
HONSU_COLS = {"quantity", "planned_quantity"}
# 素材在庫は単位が混在（本/kg/m）するので単位を付けない
NO_UNIT_TABLES = {"v_material_inventory"}


def viz_for(c):
    """表示設定。単位の接頭/接尾辞はクエリ仕様から導出する:
    件数(count) → 「件」 / 金額 sum → 「¥」 / 本数系 quantity → 「本」。"""
    vs = {}
    if c.get("stacked"):
        vs["stackable.stack_type"] = "stacked"

    def colset(col_name, fmt):
        vs.setdefault("column_settings", {})[json.dumps(["name", col_name])] = fmt

    spec = c["q"]
    agg = spec.get("agg")
    if agg:
        if agg[0] == "count":
            colset("count", {"suffix": " 件"})
        elif agg[0] == "sum":
            if agg[1] in MONEY_COLS:
                colset("sum", {"prefix": "¥"})
            elif agg[1] in HONSU_COLS and c["table"] not in NO_UNIT_TABLES:
                colset("sum", {"suffix": " 本"})
    for col in spec.get("fields") or []:
        if col in MONEY_COLS:
            colset(col, {"prefix": "¥"})
        elif col in HONSU_COLS and c["table"] not in NO_UNIT_TABLES:
            colset(col, {"suffix": " 本"})
    return vs


def apply_remappings(fields):
    """状態 enum の日本語表示（internal remapping）+ 通貨のドロップダウン値。
    表・グラフ・フィルタすべてで日本語表示になる。冪等（毎回上書き）。"""
    for (tbl, col), mapping in REMAP.items():
        fid = fields.get((tbl, col))
        if fid is None:
            print(f"remap skip: {tbl}.{col} not found")
            continue
        api("PUT", f"/api/field/{fid}", {"has_field_values": "list"})
        api("POST", f"/api/field/{fid}/dimension",
            {"type": "internal", "name": col, "human_readable_field_id": None})
        api("POST", f"/api/field/{fid}/values",
            {"values": [[k, v] for k, v in mapping.items()]})
    for tbl, col in LIST_VALUE_FIELDS:
        fid = fields.get((tbl, col))
        if fid is not None:
            api("PUT", f"/api/field/{fid}", {"has_field_values": "list"})
    print(f"remappings applied ({len(REMAP)} enum fields)")


CARD_SUBCOLLECTION = "_カード"


def main():
    # フォルダ構成: ダッシュボードは親コレクション直下、質問（カード）は
    # 「_カード」サブコレクションに置く（利用者が整理した構成。壊さない）。
    subs = api("GET", f"/api/collection/{COLLECTION_ID}/items?models=collection")
    card_coll = next((it["id"] for it in subs.get("data", [])
                      if it["name"] == CARD_SUBCOLLECTION), None)
    if card_coll is None:
        card_coll = api("POST", "/api/collection",
                        {"name": CARD_SUBCOLLECTION, "parent_id": COLLECTION_ID})["id"]
        print(f"created subcollection {CARD_SUBCOLLECTION} -> {card_coll}")

    tables, fields = load_metadata()
    apply_remappings(fields)

    existing = {}
    for coll in (COLLECTION_ID, card_coll):
        items = api("GET", f"/api/collection/{coll}/items?models=card&models=dashboard")
        for it in items.get("data", []):
            existing.setdefault((it["model"], it["name"]), (it["id"], coll))

    key_to_id = {}
    for c in CARDS:
        body = {
            "name": c["name"], "display": c["display"],
            "dataset_query": build_query(c, tables, fields),
            "visualization_settings": viz_for(c),
        }
        hit = existing.get(("card", c["name"]))
        if hit:
            cid, coll = hit
            api("PUT", f"/api/card/{cid}", {**body, "collection_id": coll})
        else:
            cid = api("POST", "/api/card", {**body, "collection_id": card_coll})["id"]
        key_to_id[c["key"]] = cid
        print(f"card {c['name']} -> {cid}")

    if CARDS_ONLY:
        print("MB_CARDS_ONLY=1 — ダッシュボードは更新しない（レイアウト保持）")
        return

    cards_by_key = {c["key"]: c for c in CARDS}
    for d in DASHBOARDS:
        hit = existing.get(("dashboard", d["name"]))
        did = hit[0] if hit else None
        if not did:
            did = api("POST", "/api/dashboard",
                      {"name": d["name"], "description": d["description"],
                       "collection_id": COLLECTION_ID})["id"]
        date_pid = det_id(d["name"], "param_date")[:8]
        status_pid = det_id(d["name"], "param_status")[:8]
        disp_pid = det_id(d["name"], "param_display_currency")[:8]
        has_status = any(cards_by_key[ck]["table"] in STATUS_FILTER_TABLES for ck, *_ in d["layout"])
        has_disp = any(cards_by_key[ck].get("disp") for ck, *_ in d["layout"])
        # 「通貨」（書類の原通貨）フィルタは廃止 — 換算切替は「表示通貨」が担い、
        # 原通貨での絞り込みは紛らわしいだけだった（利用者の指摘で撤去）。
        parameters = [
            {"id": date_pid, "name": "期間", "slug": "date_range",
             "type": "date/all-options", "sectionId": "date"},
        ]
        if has_disp:
            # 表示通貨（JPY/USD 切替ボタン）。金額は事前計算列（amount_disp）から。
            # 縦持ちビューは 1 通貨に絞らないと二重計上のため required + 既定 JPY。
            parameters.append({"id": disp_pid, "name": "表示通貨", "slug": "display_currency",
                               "type": "string/=", "sectionId": "string",
                               "default": ["JPY"], "required": True})
        if has_status:
            # 状態（注文明細 enum。注文請書カードは別 enum のため未配線）
            parameters.append({"id": status_pid, "name": "状態", "slug": "line_status",
                               "type": "string/=", "sectionId": "string"})
        dashcards = []
        for i, (ck, row, col, sx, sy) in enumerate(d["layout"]):
            c = cards_by_key[ck]
            # MBQL カード: パラメータは列へ直接マップ（template tag 不要）
            mappings = [{
                "parameter_id": date_pid, "card_id": key_to_id[ck],
                "target": ["dimension", ["field", fields[(c["table"], c["date_col"])], None]],
            }]
            if c.get("disp"):
                mappings.append({
                    "parameter_id": disp_pid, "card_id": key_to_id[ck],
                    "target": ["dimension", ["field", fields[(c["table"], "display_currency")], None]],
                })
            if has_status and c["table"] in STATUS_FILTER_TABLES:
                mappings.append({
                    "parameter_id": status_pid, "card_id": key_to_id[ck],
                    "target": ["dimension", ["field", fields[(c["table"], "status")], None]],
                })
            dashcards.append({
                "id": -(i + 1), "card_id": key_to_id[ck],
                "row": row, "col": col, "size_x": sx, "size_y": sy,
                "series": [], "parameter_mappings": mappings,
                "visualization_settings": {},
            })
        api("PUT", f"/api/dashboard/{did}",
            {"name": d["name"], "description": d["description"],
             "collection_id": COLLECTION_ID, "parameters": parameters,
             "dashcards": dashcards})
        print(f"dashboard {d['name']} -> {did} ({len(dashcards)} cards, "
              f"filters: {'/'.join(p['name'] for p in parameters)})")


if __name__ == "__main__":
    main()
