#!/usr/bin/env python3
"""コレクション内の全ダッシュボードに「期間」「通貨」フィルタを配線する（レイアウト非破壊）。

  MB_URL=https://bi.ckk-tool.co.jp MB_API_KEY=mb_... MB_DB_ID=5 MB_COLLECTION_ID=6 \
    python3 wire-dashboard-filters.py

build-business-dashboards.py はダッシュボードを**自分のレイアウトで上書き**する。
利用者が UI でカードを並べ替え・追加した後は、そちらを再実行するとレイアウトが
消えるので、フィルタ配線だけを直したいときは**このスクリプト**を使う:

- コレクション直下の全ダッシュボードを対象（利用者が新規に作ったものも含む）。
- パラメータ「期間」(slug date_range) と「通貨」(slug currency) が無ければ追加
  （既にあればその ID を使う — 利用者が UI で付けたフィルタも壊さない）。
- 各カードのソーステーブル（analytics ビュー）の列から自動でマップ:
  期間 → DATE_PREF の優先順で最初に見つかった日付列 / 通貨 → currency 列があれば。
- 既存の parameter_mappings は保持（同じパラメータの配線が無いときだけ追加）。
- レイアウト（row/col/size）・カード本体・ビジュアル設定は一切変更しない。
- native SQL カードは template tag（date_range / currency）を持つ場合のみ配線。
"""
import json
import os
import urllib.request
import uuid

MB_URL = os.environ.get("MB_URL", "https://bi.ckk-tool.co.jp").rstrip("/")
API_KEY = os.environ["MB_API_KEY"]
DB_ID = int(os.environ.get("MB_DB_ID", "5"))
COLLECTION_ID = int(os.environ.get("MB_COLLECTION_ID", "6"))
# 通貨列が無いドメイン（労務など）は MB_SKIP_CURRENCY=1 で「期間」だけ配線する
SKIP_CURRENCY = os.environ.get("MB_SKIP_CURRENCY", "") == "1"

# 期間フィルタの列の優先順（テーブルにある最初のもの）
DATE_PREF = ["date", "created_at", "updated_at", "order_date", "started_at", "reserved_at",
             "recorded_at", "worked_date", "planned_date", "issued_at",
             "delivered_at", "shipped_at", "requested_at", "acted_at"]


def api(method, path, body=None):
    req = urllib.request.Request(MB_URL + path,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
    req.add_header("x-api-key", API_KEY)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "ckk-metabase-wire/1.0")
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else {}


def det_id(*parts):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "ckk-metabase://" + "/".join(parts)))


def load_tables():
    meta = api("GET", f"/api/database/{DB_ID}/metadata")
    tables = {}
    for t in meta.get("tables", []):
        tables[t["id"]] = {f["name"]: f["id"] for f in t.get("fields", [])}
    return tables


def targets_for_card(card, tables):
    """カードに対する (date_target, currency_target)。マップ不能は None。"""
    if card.get("database_id") != DB_ID:
        return None, None
    q = card.get("dataset_query") or {}
    if q.get("type") == "native" or q.get("native"):
        tags = (q.get("native") or {}).get("template-tags") or {}
        d = ["dimension", ["template-tag", "date_range"]] if "date_range" in tags else None
        c = ["dimension", ["template-tag", "currency"]] if "currency" in tags else None
        return d, c
    fields = tables.get(card.get("table_id")) or {}
    d = next((["dimension", ["field", fields[col], None]] for col in DATE_PREF if col in fields), None)
    c = ["dimension", ["field", fields["currency"], None]] if "currency" in fields else None
    return d, c


def main():
    tables = load_tables()
    items = api("GET", f"/api/collection/{COLLECTION_ID}/items?models=dashboard")
    for it in items.get("data", []):
        did = it["id"]
        d = api("GET", f"/api/dashboard/{did}")
        params = list(d.get("parameters") or [])
        by_slug = {p.get("slug"): p for p in params}
        changed = False
        if "date_range" not in by_slug:
            params.append({"id": det_id(d["name"], "param_date")[:8], "name": "期間",
                           "slug": "date_range", "type": "date/all-options", "sectionId": "date"})
            by_slug["date_range"] = params[-1]
            changed = True
        if not SKIP_CURRENCY and "currency" not in by_slug:
            params.append({"id": det_id(d["name"], "param_currency")[:8], "name": "通貨",
                           "slug": "currency", "type": "string/=", "sectionId": "string"})
            by_slug["currency"] = params[-1]
            changed = True
        date_pid = by_slug["date_range"]["id"]
        cur_pid = by_slug["currency"]["id"] if "currency" in by_slug else None

        dashcards = []
        wired = 0
        for dc in d.get("dashcards", []):
            mappings = list(dc.get("parameter_mappings") or [])
            card = dc.get("card") or {}
            if dc.get("card_id"):
                have = {m.get("parameter_id") for m in mappings}
                dt, ct = targets_for_card(card, tables)
                if dt and date_pid not in have:
                    mappings.append({"parameter_id": date_pid, "card_id": dc["card_id"], "target": dt})
                    wired += 1
                if ct and cur_pid is not None and cur_pid not in have:
                    mappings.append({"parameter_id": cur_pid, "card_id": dc["card_id"], "target": ct})
                    wired += 1
            dashcards.append({
                "id": dc["id"], "card_id": dc.get("card_id"),
                "row": dc["row"], "col": dc["col"],
                "size_x": dc["size_x"], "size_y": dc["size_y"],
                "series": dc.get("series") or [],
                "parameter_mappings": mappings,
                "visualization_settings": dc.get("visualization_settings") or {},
            })
        if changed or wired:
            api("PUT", f"/api/dashboard/{did}", {"parameters": params, "dashcards": dashcards})
        print(f"dashboard {d['name']} ({did}): +{wired} mappings"
              + (" (params added)" if changed else ""))


if __name__ == "__main__":
    main()
