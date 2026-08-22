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

カードは native SQL（metabase_ro は search_path=app,analytics、read-only）で、全カード
analytics ビューを参照する（名前解決・通貨換算・フィルタ列がそろっているため）。
列別名を日本語にして見出しがそのまま意味になるようにする。状態 enum は CASE で
日本語化する。

ダッシュボードフィルタ: 全ダッシュボードに「期間」（日付範囲）+「通貨」を持つ。
native SQL カードにフィルタを効かせるには field filter（template tag）が要るので、
各カードの SQL は `WHERE 1=1 [[AND {{date_range}}]] [[AND {{currency}}]]` の足場を
持ち、タグは各ビューの日付列 / 通貨列（field id はビルド時に metadata API で解決）へ
マップする。通貨列が無いビューのカード（工程・素材在庫・在庫予約・締日処理）は
通貨フィルタの対象外（マッピングしない = そのカードはフィルタで変化しない）。
指示書・製品在庫の通貨は「製品の通貨」。工程の期間は started_at（実行日）基準。
"""
import json
import os
import urllib.request
import uuid

MB_URL = os.environ.get("MB_URL", "https://bi.ckk-tool.co.jp").rstrip("/")
API_KEY = os.environ["MB_API_KEY"]
DB_ID = int(os.environ.get("MB_DB_ID", "5"))
COLLECTION_ID = int(os.environ.get("MB_COLLECTION_ID", "6"))


def api(method, path, body=None):
    url = f"{MB_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("x-api-key", API_KEY)
    req.add_header("Content-Type", "application/json")
    # When MB_URL is the public host (behind Cloudflare Access), the default
    # python-urllib User-Agent is blocked (403). Send a normal UA.
    req.add_header("User-Agent", "ckk-metabase-builder/1.0")
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else {}


def tag_id(card_key, tag):
    """template tag / parameter の決定的 UUID（再実行で揺れない）。"""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ckk-metabase://{card_key}/{tag}"))


# ─── 状態 enum → 日本語（design.md §9） ───────────────────────────────
def case(col, mapping, else_="その他"):
    # 列を ::text にキャストしてから比較する。enum に無いラベルを WHEN に書いても
    # 「invalid input value for enum」で落ちず、ELSE（原値）へ素通しする。
    whens = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in mapping.items())
    return f"CASE {col}::text {whens} ELSE {col}::text END"


# 注文請書の実 enum（取込ワークフロー）: IMPORT/DRAFT/REQUESTED/APPROVED/COMPLETED/ARCHIVED
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

# フィルタ足場。field filter は「マップした列に対する真偽条件」に展開されるので、
# SQL 側は optional 句 [[AND {{...}}]] を置くだけでよい（未指定なら消える）。
F = "WHERE 1=1 [[AND {{date_range}}]] [[AND {{currency}}]]"       # 通貨列があるビュー
FD = "WHERE 1=1 [[AND {{date_range}}]]"                            # 日付のみ

# ─── カード定義 ──────────────────────────────────────────────────────
# table = フィルタをマップする analytics ビュー / date_col = 期間フィルタの列 /
# cur = 通貨フィルタ対象（ビューに currency 列がある）
CARDS = [
    # 受注・売上
    dict(key="oa_total", name="注文請書 総数", display="scalar",
         table="v_order_acceptances", date_col="created_at", cur=True,
         sql=f"SELECT count(*) AS \"件数\" FROM analytics.v_order_acceptances {F}"),
    dict(key="ol_total", name="注文明細 総数", display="scalar",
         table="v_order_lines", date_col="created_at", cur=True,
         sql=f"SELECT count(*) AS \"件数\" FROM analytics.v_order_lines {F}"),
    dict(key="sales_total", name="受注金額 合計", display="scalar",
         table="v_order_lines", date_col="created_at", cur=True,
         sql=f"SELECT COALESCE(sum(amount),0) AS \"受注金額\" FROM analytics.v_order_lines {F} "
             "AND status <> 'CANCELLED'"),
    dict(key="oa_by_status", name="注文請書 状態別", display="bar", dim="状態", met="件数",
         table="v_order_acceptances", date_col="created_at", cur=True,
         sql=f"SELECT {case('status', OA_ST)} AS \"状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_order_acceptances {F} GROUP BY status ORDER BY count(*) DESC"),
    dict(key="ol_by_status", name="注文明細 状態別", display="bar", dim="状態", met="件数",
         table="v_order_lines", date_col="created_at", cur=True,
         sql=f"SELECT {case('status', OL_ST)} AS \"状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_order_lines {F} GROUP BY status ORDER BY count(*) DESC"),
    dict(key="sales_monthly", name="受注金額 月次", display="bar", dim="年月", met="受注金額",
         table="v_order_lines", date_col="created_at", cur=True,
         sql=f"SELECT to_char(created_at,'YYYY-MM') AS \"年月\", COALESCE(sum(amount),0) AS \"受注金額\" "
             f"FROM analytics.v_order_lines {F} AND status <> 'CANCELLED' GROUP BY 1 ORDER BY 1"),
    dict(key="sales_by_customer", name="顧客別 受注金額 上位", display="row", dim="顧客", met="受注金額",
         table="v_order_lines", date_col="created_at", cur=True,
         sql=f"SELECT customer_name AS \"顧客\", COALESCE(sum(amount),0) AS \"受注金額\" "
             f"FROM analytics.v_order_lines {F} AND status <> 'CANCELLED' AND customer_name IS NOT NULL "
             "GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    dict(key="sales_by_staff", name="営業担当別 受注金額", display="row", dim="営業担当", met="受注金額",
         table="v_order_lines", date_col="created_at", cur=True,
         sql=f"SELECT COALESCE(sales_staff,'（担当未設定）') AS \"営業担当\", "
             "COALESCE(sum(amount),0) AS \"受注金額\" "
             f"FROM analytics.v_order_lines {F} AND status <> 'CANCELLED' "
             "GROUP BY 1 ORDER BY 2 DESC"),
    dict(key="sales_staff_monthly", name="営業担当別 受注金額 月次", display="bar",
         dim=["年月", "営業担当"], met="受注金額",
         table="v_order_lines", date_col="created_at", cur=True,
         sql=f"SELECT to_char(created_at,'YYYY-MM') AS \"年月\", "
             "COALESCE(sales_staff,'（担当未設定）') AS \"営業担当\", "
             "COALESCE(sum(amount),0) AS \"受注金額\" "
             f"FROM analytics.v_order_lines {F} AND status <> 'CANCELLED' "
             "GROUP BY 1, 2 ORDER BY 1, 2"),
    dict(key="oa_recent", name="最近の注文明細", display="table",
         table="v_order_lines", date_col="created_at", cur=True,
         sql="SELECT order_line_no AS \"注文番号\", customer_name AS \"顧客\", sales_staff AS \"営業担当\", "
             "product_name AS \"製品\", quantity AS \"数量\", amount AS \"金額\", "
             + f"{case('status', OL_ST)} AS \"状態\" "
             f"FROM analytics.v_order_lines {F} "
             "ORDER BY acceptance_year_month DESC, acceptance_seq DESC, branch DESC NULLS LAST LIMIT 20"),
    # 生産進捗（通貨 = 製品の通貨。工程は started_at 基準・通貨対象外）
    dict(key="wo_total", name="指示書 総数", display="scalar",
         table="v_work_orders", date_col="created_at", cur=True,
         sql=f"SELECT count(*) AS \"件数\" FROM analytics.v_work_orders {F}"),
    dict(key="wo_inprogress", name="進行中の指示書", display="scalar",
         table="v_work_orders", date_col="created_at", cur=True,
         sql=f"SELECT count(*) AS \"件数\" FROM analytics.v_work_orders {F} AND status='IN_PROGRESS'"),
    dict(key="step_total", name="工程 総数", display="scalar",
         table="v_work_order_steps", date_col="started_at", cur=False,
         sql=f"SELECT count(*) AS \"件数\" FROM analytics.v_work_order_steps {FD}"),
    dict(key="wo_by_status", name="指示書 状態別", display="bar", dim="状態", met="件数",
         table="v_work_orders", date_col="created_at", cur=True,
         sql=f"SELECT {case('status', WO_ST)} AS \"状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_work_orders {F} GROUP BY status ORDER BY count(*) DESC"),
    dict(key="wo_by_approval", name="指示書 承認状態別", display="bar", dim="承認状態", met="件数",
         table="v_work_orders", date_col="created_at", cur=True,
         sql=f"SELECT {case('approval_status', WOA_ST)} AS \"承認状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_work_orders {F} GROUP BY approval_status ORDER BY count(*) DESC"),
    dict(key="step_by_status", name="工程 状態別", display="bar", dim="状態", met="件数",
         table="v_work_order_steps", date_col="started_at", cur=False,
         sql=f"SELECT {case('status', STEP_ST)} AS \"状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_work_order_steps {FD} GROUP BY status ORDER BY count(*) DESC"),
    dict(key="wo_active", name="進行中・承認待ちの指示書", display="table",
         table="v_work_orders", date_col="created_at", cur=True,
         sql="SELECT work_order_no AS \"指示書番号\", lot_number AS \"ロット番号\", "
             "product_name AS \"製品\", planned_quantity AS \"予定数量\", "
             "created_by_name AS \"作成者\", " + f"{case('status', WO_ST)} AS \"状態\", "
             + f"{case('approval_status', WOA_ST)} AS \"承認状態\" "
             f"FROM analytics.v_work_orders {F} "
             "AND status IN ('IN_PROGRESS','PENDING_APPROVAL','APPROVED') "
             "ORDER BY year_month DESC, seq DESC LIMIT 20"),
    # 請求
    dict(key="inv_total", name="請求書 総数", display="scalar",
         table="v_invoices", date_col="created_at", cur=True,
         sql=f"SELECT count(*) AS \"件数\" FROM analytics.v_invoices {F}"),
    dict(key="inv_amount", name="請求額 合計", display="scalar",
         table="v_invoices", date_col="created_at", cur=True,
         sql=f"SELECT COALESCE(sum(total_amount),0) AS \"請求額\" FROM analytics.v_invoices {F} "
             "AND status <> 'DRAFT'"),
    dict(key="inv_by_status", name="請求書 状態別", display="bar", dim="状態", met="件数",
         table="v_invoices", date_col="created_at", cur=True,
         sql=f"SELECT {case('status', INV_ST)} AS \"状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_invoices {F} GROUP BY status ORDER BY count(*) DESC"),
    dict(key="inv_monthly", name="請求額 月次", display="bar", dim="年月", met="請求額",
         table="v_invoices", date_col="created_at", cur=True,
         sql="SELECT to_char(COALESCE(issued_at,created_at),'YYYY-MM') AS \"年月\", "
             f"COALESCE(sum(total_amount),0) AS \"請求額\" FROM analytics.v_invoices {F} "
             "AND status <> 'DRAFT' GROUP BY 1 ORDER BY 1"),
    dict(key="closing_by_status", name="締日処理 状態別", display="bar", dim="状態", met="件数",
         table="v_billing_closings", date_col="created_at", cur=False,
         sql=f"SELECT {case('status', BC_ST)} AS \"状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_billing_closings {FD} GROUP BY status ORDER BY count(*) DESC"),
    # 在庫（期間 = 更新日/予約日。通貨 = 製品の通貨（製品在庫のみ））
    dict(key="prod_stock_total", name="製品在庫 総数量", display="scalar",
         table="v_product_inventory", date_col="updated_at", cur=True,
         sql=f"SELECT COALESCE(sum(quantity),0) AS \"数量\" FROM analytics.v_product_inventory {F}"),
    dict(key="mat_stock_total", name="素材在庫 総数量", display="scalar",
         table="v_material_inventory", date_col="updated_at", cur=False,
         sql=f"SELECT COALESCE(sum(quantity),0) AS \"数量\" FROM analytics.v_material_inventory {FD}"),
    dict(key="prod_stock_top", name="製品在庫 上位", display="row", dim="製品", met="在庫数",
         table="v_product_inventory", date_col="updated_at", cur=True,
         sql=f"SELECT product_name AS \"製品\", COALESCE(sum(quantity),0) AS \"在庫数\" "
             f"FROM analytics.v_product_inventory {F} AND product_name IS NOT NULL "
             "GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    dict(key="mat_stock_top", name="素材在庫 上位", display="row", dim="素材", met="在庫数",
         table="v_material_inventory", date_col="updated_at", cur=False,
         sql=f"SELECT material_name AS \"素材\", COALESCE(sum(quantity),0) AS \"在庫数\" "
             f"FROM analytics.v_material_inventory {FD} AND material_name IS NOT NULL "
             "GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    dict(key="res_by_status", name="在庫予約 状態別", display="bar", dim="状態", met="件数",
         table="v_inventory_reservations", date_col="reserved_at", cur=False,
         sql=f"SELECT {case('status', RES_ST)} AS \"状態\", count(*) AS \"件数\" "
             f"FROM analytics.v_inventory_reservations {FD} GROUP BY status ORDER BY count(*) DESC"),
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


def viz_for(c):
    # dim は文字列（1 次元）またはリスト（第 2 要素がブレイクアウト = 積み上げ系列）
    if c["display"] in ("bar", "row") and c.get("dim") and c.get("met"):
        dims = c["dim"] if isinstance(c["dim"], list) else [c["dim"]]
        vs = {"graph.dimensions": dims, "graph.metrics": [c["met"]]}
        if len(dims) > 1:
            vs["stackable.stack_type"] = "stacked"
        return vs
    return {}


def load_field_ids():
    """analytics ビューの (table, column) → Metabase field id。field filter 用。"""
    meta = api("GET", f"/api/database/{DB_ID}/metadata")
    ids = {}
    for t in meta.get("tables", []):
        if t.get("schema") != "analytics":
            continue
        for f in t.get("fields", []):
            ids[(t["name"], f["name"])] = f["id"]
    return ids


def dataset_query(c, field_ids):
    tags = {}
    date_fid = field_ids.get((c["table"], c["date_col"]))
    if date_fid is None:
        raise SystemExit(f"field not found: {c['table']}.{c['date_col']} — run a Metabase sync first")
    tags["date_range"] = {
        "id": tag_id(c["key"], "date_range"), "name": "date_range",
        "display-name": "期間", "type": "dimension",
        "dimension": ["field", date_fid, None], "widget-type": "date/all-options",
    }
    if c["cur"]:
        cur_fid = field_ids.get((c["table"], "currency"))
        if cur_fid is None:
            raise SystemExit(f"field not found: {c['table']}.currency — run a Metabase sync first")
        tags["currency"] = {
            "id": tag_id(c["key"], "currency"), "name": "currency",
            "display-name": "通貨", "type": "dimension",
            "dimension": ["field", cur_fid, None], "widget-type": "string/=",
        }
    return {"database": DB_ID, "type": "native",
            "native": {"query": c["sql"], "template-tags": tags}}


CARD_SUBCOLLECTION = "_カード"


def main():
    # フォルダ構成: ダッシュボードは親コレクション直下、質問（カード）は
    # 「_カード」サブコレクションに置く（利用者が整理した構成。壊さない）。
    # 既存カードは親と _カード の両方から名前で探し、見つかったカードは
    # 「今ある場所のまま」更新する — このスクリプトがカードを移動することはない。
    # 新規カードは _カード サブコレクション（無ければ作る）へ入れる。
    subs = api("GET", f"/api/collection/{COLLECTION_ID}/items?models=collection")
    card_coll = next((it["id"] for it in subs.get("data", [])
                      if it["name"] == CARD_SUBCOLLECTION), None)
    if card_coll is None:
        card_coll = api("POST", "/api/collection",
                        {"name": CARD_SUBCOLLECTION, "parent_id": COLLECTION_ID})["id"]
        print(f"created subcollection {CARD_SUBCOLLECTION} -> {card_coll}")

    field_ids = load_field_ids()

    # 既存カード / ダッシュボードを名前で引く（冪等）。値 = (id, collection_id)
    existing = {}
    for coll in (COLLECTION_ID, card_coll):
        items = api("GET", f"/api/collection/{coll}/items?models=card&models=dashboard")
        for it in items.get("data", []):
            existing.setdefault((it["model"], it["name"]), (it["id"], coll))

    key_to_id = {}
    for c in CARDS:
        body = {
            "name": c["name"], "display": c["display"],
            "dataset_query": dataset_query(c, field_ids),
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

    cards_by_key = {c["key"]: c for c in CARDS}
    for d in DASHBOARDS:
        hit = existing.get(("dashboard", d["name"]))
        did = hit[0] if hit else None
        if not did:
            did = api("POST", "/api/dashboard",
                      {"name": d["name"], "description": d["description"],
                       "collection_id": COLLECTION_ID})["id"]
        # ダッシュボードフィルタ（id は決定的 — 再実行で URL/設定が揺れない）
        date_pid = tag_id(d["name"], "param_date")[:8]
        cur_pid = tag_id(d["name"], "param_currency")[:8]
        parameters = [
            {"id": date_pid, "name": "期間", "slug": "date_range",
             "type": "date/all-options", "sectionId": "date"},
            {"id": cur_pid, "name": "通貨", "slug": "currency",
             "type": "string/=", "sectionId": "string"},
        ]
        dashcards = []
        for i, (ck, row, col, sx, sy) in enumerate(d["layout"]):
            c = cards_by_key[ck]
            mappings = [{
                "parameter_id": date_pid, "card_id": key_to_id[ck],
                "target": ["dimension", ["template-tag", "date_range"]],
            }]
            if c["cur"]:
                mappings.append({
                    "parameter_id": cur_pid, "card_id": key_to_id[ck],
                    "target": ["dimension", ["template-tag", "currency"]],
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
        print(f"dashboard {d['name']} -> {did} ({len(dashcards)} cards, filters: 期間"
              + (" + 通貨" if any(cards_by_key[ck]["cur"] for ck, *_ in d["layout"]) else "") + ")")


if __name__ == "__main__":
    main()
