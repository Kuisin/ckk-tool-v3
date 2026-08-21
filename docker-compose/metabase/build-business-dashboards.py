#!/usr/bin/env python3
"""Metabase「CKK 業務」データソース（db 5 / app スキーマ）に受注・生産・請求・在庫の
ダッシュボードとカードを作る。名前で冪等（同名カード/ダッシュボードは作り直さず更新）。

  MB_URL=https://bi.ckk-tool.co.jp MB_API_KEY=mb_... MB_DB_ID=5 MB_COLLECTION_ID=6 \
    python3 build-business-dashboards.py

フォルダ構成（利用者が整理した形。維持すること）:
  CKK 業務/            … ダッシュボード（受注・売上 / 生産進捗 / 請求 / 在庫）
  CKK 業務/_カード/    … 質問（カード）は全部ここ
既存カードは親と _カード の両方から名前で探し、見つかった場所のまま更新する —
このスクリプトはカードを移動しない。新規カードは _カード へ作る。

カードは native SQL（metabase_ro は search_path=app,analytics、read-only）。列別名を
日本語にして見出しがそのまま意味になるようにする。状態 enum は CASE で日本語化する。
"""
import json, os, sys, urllib.request

MB_URL = os.environ.get("MB_URL", "http://192.168.50.15:3003").rstrip("/")
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

# ─── カード定義 ──────────────────────────────────────────────────────
# 各: key, name, display, sql, dim(グラフの次元列), met(グラフの指標列)
CARDS = [
    # 受注・売上
    dict(key="oa_total", name="注文請書 総数", display="scalar",
         sql="SELECT count(*) AS \"件数\" FROM app.order_acceptances"),
    dict(key="ol_total", name="注文明細 総数", display="scalar",
         sql="SELECT count(*) AS \"件数\" FROM app.order_lines"),
    dict(key="sales_total", name="受注金額 合計", display="scalar",
         sql="SELECT COALESCE(sum(amount),0) AS \"受注金額\" FROM app.order_lines WHERE status <> 'CANCELLED'"),
    dict(key="oa_by_status", name="注文請書 状態別", display="bar", dim="状態", met="件数",
         sql=f"SELECT {case('status', OA_ST)} AS \"状態\", count(*) AS \"件数\" "
             "FROM app.order_acceptances GROUP BY status ORDER BY count(*) DESC"),
    dict(key="ol_by_status", name="注文明細 状態別", display="bar", dim="状態", met="件数",
         sql=f"SELECT {case('status', OL_ST)} AS \"状態\", count(*) AS \"件数\" "
             "FROM app.order_lines GROUP BY status ORDER BY count(*) DESC"),
    dict(key="sales_monthly", name="受注金額 月次", display="bar", dim="年月", met="受注金額",
         sql="SELECT to_char(created_at,'YYYY-MM') AS \"年月\", COALESCE(sum(amount),0) AS \"受注金額\" "
             "FROM app.order_lines WHERE status <> 'CANCELLED' GROUP BY 1 ORDER BY 1"),
    dict(key="sales_by_customer", name="顧客別 受注金額 上位", display="row", dim="顧客", met="受注金額",
         sql="SELECT customer_name AS \"顧客\", COALESCE(sum(amount),0) AS \"受注金額\" "
             "FROM analytics.v_order_lines WHERE status <> 'CANCELLED' AND customer_name IS NOT NULL "
             "GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    dict(key="sales_by_staff", name="営業担当別 受注金額", display="row", dim="営業担当", met="受注金額",
         sql="SELECT COALESCE(sales_staff,'（担当未設定）') AS \"営業担当\", "
             "COALESCE(sum(amount),0) AS \"受注金額\" "
             "FROM analytics.v_order_lines WHERE status <> 'CANCELLED' "
             "GROUP BY 1 ORDER BY 2 DESC"),
    dict(key="sales_staff_monthly", name="営業担当別 受注金額 月次", display="bar",
         dim=["年月", "営業担当"], met="受注金額",
         sql="SELECT to_char(created_at,'YYYY-MM') AS \"年月\", "
             "COALESCE(sales_staff,'（担当未設定）') AS \"営業担当\", "
             "COALESCE(sum(amount),0) AS \"受注金額\" "
             "FROM analytics.v_order_lines WHERE status <> 'CANCELLED' "
             "GROUP BY 1, 2 ORDER BY 1, 2"),
    dict(key="oa_recent", name="最近の注文明細", display="table",
         sql="SELECT order_line_no AS \"注文番号\", customer_name AS \"顧客\", sales_staff AS \"営業担当\", "
             "product_name AS \"製品\", quantity AS \"数量\", amount AS \"金額\", "
             + f"{case('status', OL_ST)} AS \"状態\" "
             "FROM analytics.v_order_lines "
             "ORDER BY acceptance_year_month DESC, acceptance_seq DESC, branch DESC NULLS LAST LIMIT 20"),
    # 生産進捗
    dict(key="wo_total", name="指示書 総数", display="scalar",
         sql="SELECT count(*) AS \"件数\" FROM app.work_orders"),
    dict(key="wo_inprogress", name="進行中の指示書", display="scalar",
         sql="SELECT count(*) AS \"件数\" FROM app.work_orders WHERE status='IN_PROGRESS'"),
    dict(key="step_total", name="工程 総数", display="scalar",
         sql="SELECT count(*) AS \"件数\" FROM app.work_order_steps"),
    dict(key="wo_by_status", name="指示書 状態別", display="bar", dim="状態", met="件数",
         sql=f"SELECT {case('status', WO_ST)} AS \"状態\", count(*) AS \"件数\" "
             "FROM app.work_orders GROUP BY status ORDER BY count(*) DESC"),
    dict(key="wo_by_approval", name="指示書 承認状態別", display="bar", dim="承認状態", met="件数",
         sql=f"SELECT {case('approval_status', WOA_ST)} AS \"承認状態\", count(*) AS \"件数\" "
             "FROM app.work_orders GROUP BY approval_status ORDER BY count(*) DESC"),
    dict(key="step_by_status", name="工程 状態別", display="bar", dim="状態", met="件数",
         sql=f"SELECT {case('status', STEP_ST)} AS \"状態\", count(*) AS \"件数\" "
             "FROM app.work_order_steps GROUP BY status ORDER BY count(*) DESC"),
    dict(key="wo_active", name="進行中・承認待ちの指示書", display="table",
         sql="SELECT work_order_no AS \"指示書番号\", lot_number AS \"ロット番号\", "
             "product_name AS \"製品\", planned_quantity AS \"予定数量\", "
             "created_by_name AS \"作成者\", " + f"{case('status', WO_ST)} AS \"状態\", "
             + f"{case('approval_status', WOA_ST)} AS \"承認状態\" "
             "FROM analytics.v_work_orders "
             "WHERE status IN ('IN_PROGRESS','PENDING_APPROVAL','APPROVED') "
             "ORDER BY year_month DESC, seq DESC LIMIT 20"),
    # 請求
    dict(key="inv_total", name="請求書 総数", display="scalar",
         sql="SELECT count(*) AS \"件数\" FROM app.invoices"),
    dict(key="inv_amount", name="請求額 合計", display="scalar",
         sql="SELECT COALESCE(sum(total_amount),0) AS \"請求額\" FROM app.invoices WHERE status <> 'DRAFT'"),
    dict(key="inv_by_status", name="請求書 状態別", display="bar", dim="状態", met="件数",
         sql=f"SELECT {case('status', INV_ST)} AS \"状態\", count(*) AS \"件数\" "
             "FROM app.invoices GROUP BY status ORDER BY count(*) DESC"),
    dict(key="inv_monthly", name="請求額 月次", display="bar", dim="年月", met="請求額",
         sql="SELECT to_char(COALESCE(issued_at,created_at),'YYYY-MM') AS \"年月\", "
             "COALESCE(sum(total_amount),0) AS \"請求額\" FROM app.invoices "
             "WHERE status <> 'DRAFT' GROUP BY 1 ORDER BY 1"),
    dict(key="closing_by_status", name="締日処理 状態別", display="bar", dim="状態", met="件数",
         sql=f"SELECT {case('status', BC_ST)} AS \"状態\", count(*) AS \"件数\" "
             "FROM app.billing_closings GROUP BY status ORDER BY count(*) DESC"),
    # 在庫
    dict(key="prod_stock_total", name="製品在庫 総数量", display="scalar",
         sql="SELECT COALESCE(sum(quantity),0) AS \"数量\" FROM app.product_inventory"),
    dict(key="mat_stock_total", name="素材在庫 総数量", display="scalar",
         sql="SELECT COALESCE(sum(quantity),0) AS \"数量\" FROM app.material_inventory"),
    dict(key="prod_stock_top", name="製品在庫 上位", display="row", dim="製品", met="在庫数",
         sql="SELECT p.name->>'ja' AS \"製品\", COALESCE(sum(pi.quantity),0) AS \"在庫数\" "
             "FROM app.product_inventory pi JOIN app.products p ON p.id=pi.product_id "
             "GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    dict(key="mat_stock_top", name="素材在庫 上位", display="row", dim="素材", met="在庫数",
         sql="SELECT m.name->>'ja' AS \"素材\", COALESCE(sum(mi.quantity),0) AS \"在庫数\" "
             "FROM app.material_inventory mi JOIN app.materials m ON m.id=mi.material_id "
             "GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    dict(key="res_by_status", name="在庫予約 状態別", display="bar", dim="状態", met="件数",
         sql=f"SELECT {case('status', RES_ST)} AS \"状態\", count(*) AS \"件数\" "
             "FROM app.inventory_reservations GROUP BY status ORDER BY count(*) DESC"),
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


def dataset_query(sql):
    return {"database": DB_ID, "type": "native", "native": {"query": sql}}


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
            "dataset_query": dataset_query(c["sql"]),
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

    for d in DASHBOARDS:
        hit = existing.get(("dashboard", d["name"]))
        did = hit[0] if hit else None
        if not did:
            did = api("POST", "/api/dashboard",
                      {"name": d["name"], "description": d["description"],
                       "collection_id": COLLECTION_ID})["id"]
        dashcards = []
        for i, (ck, row, col, sx, sy) in enumerate(d["layout"]):
            dashcards.append({
                "id": -(i + 1), "card_id": key_to_id[ck],
                "row": row, "col": col, "size_x": sx, "size_y": sy,
                "series": [], "parameter_mappings": [], "visualization_settings": {},
            })
        api("PUT", f"/api/dashboard/{did}",
            {"name": d["name"], "description": d["description"],
             "collection_id": COLLECTION_ID, "dashcards": dashcards})
        print(f"dashboard {d['name']} -> {did} ({len(dashcards)} cards)")


if __name__ == "__main__":
    main()
