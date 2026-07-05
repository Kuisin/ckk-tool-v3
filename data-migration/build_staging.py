#!/usr/bin/env python3
"""Build a faithful, normalized 'staging' SQLite DB from the extracted CKK
FileMaker dumps. Each legacy system is normalized within itself; cross-system
links are made only where a reliable natural key exists.

Phase 2a (this script): the order system (受注管理システム新1) -> orders header +
customer/product/material dimensions + installment deliveries + named process
status; plus material purchasing (素材発注書) and the Yamaguchi order/delivery
system (山口注文システム). Ambiguous per-step 工程日付N mapping is intentionally
left out (needs domain input) and preserved verbatim in orders_raw passthrough.
"""
import sqlite3, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
EXT  = os.path.join(ROOT, "extracted")
OUT  = os.path.join(ROOT, "staging.sqlite")

def src(name):
    c = sqlite3.connect(os.path.join(EXT, name + ".sqlite"))
    c.text_factory = str
    return c

def clean(v):
    """Trim FileMaker whitespace junk; full-width spaces, stray CR/LF, '?' nulls."""
    if v is None:
        return None
    s = str(v).replace("　", " ").strip()
    s = re.sub(r"[\r\n]+", " ", s).strip()
    if s in ("", "?", "*", "**", "****", "ー", "－", "—", "-", "―"):
        return None
    return s

def num(v):
    s = clean(v)
    if s is None:
        return None
    s = s.replace(",", "")
    m = re.search(r"-?\d+(\.\d+)?", s)
    return float(m.group()) if m else None

def main():
    if os.path.exists(OUT):
        os.remove(OUT)
    db = sqlite3.connect(OUT)
    db.text_factory = str
    db.executescript(SCHEMA)

    build_orders(db)
    build_material_pos(db)
    build_yamaguchi(db)
    build_claim_billing(db)

    db.commit()
    report(db)
    db.close()

# ---------------------------------------------------------------- schema
SCHEMA = r"""
PRAGMA journal_mode=OFF; PRAGMA synchronous=0;

CREATE TABLE customers (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE);
CREATE TABLE products (
  id INTEGER PRIMARY KEY, model_shape TEXT, shape TEXT, blade_count TEXT,
  UNIQUE(model_shape, shape, blade_count));
CREATE TABLE materials (
  id INTEGER PRIMARY KEY, material TEXT, material_type TEXT,
  UNIQUE(material, material_type));

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  mgmt_no TEXT,            -- 管理No.
  slip_code TEXT,         -- 伝票コードNo.
  received_date TEXT,     -- 受付日
  ship_due TEXT,          -- 出荷納期
  customer_id INTEGER REFERENCES customers(id),     -- 受注先
  ship_to TEXT,           -- 発送先
  end_user TEXT,          -- ユーザ名
  work_factory TEXT,      -- 作業工場
  product_id INTEGER REFERENCES products(id),       -- 型番形状/形状/刃数
  material_id INTEGER REFERENCES materials(id),     -- 素材1/材種1
  order_ref TEXT,         -- 注番
  category TEXT,          -- 分類
  qty INTEGER,            -- 本数1
  unit_price REAL,        -- 単価
  sales_amount REAL,      -- 売上金額
  coating TEXT,           -- コーティング
  coating_type TEXT,      -- 皮膜種類
  outsource_to TEXT,      -- 外注依頼先
  length_l TEXT,          -- 寸法L
  input_by TEXT,          -- 入力者名
  closing_group TEXT,     -- 〆日グループ
  remarks TEXT,           -- 備考
  source_rowid INTEGER);
CREATE INDEX ix_orders_slip ON orders(slip_code);
CREATE INDEX ix_orders_cust ON orders(customer_id);

-- installment deliveries (分納日付N / 分納数N), N=1..5
CREATE TABLE order_deliveries (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id),
  seq INTEGER, delivered_date TEXT, qty REAL);

-- named process completion status (完了チェックX)
CREATE TABLE order_process_status (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id),
  process TEXT, status TEXT);

-- material purchase orders (素材発注書), one row per line item (groups 0..8)
CREATE TABLE material_purchase_orders (
  id INTEGER PRIMARY KEY, source_rowid INTEGER,
  po_no TEXT, supplier TEXT, ship_to TEXT, orderer TEXT, dept TEXT,
  order_date TEXT, due_date TEXT, received_date TEXT,
  material_type_code TEXT, material_type_name TEXT, dimension TEXT,
  qty REAL, unit_price REAL, amount REAL, drawing_no TEXT, line_seq INTEGER);

-- Yamaguchi order/delivery system (山口注文システム)
CREATE TABLE yamaguchi_orders (
  id INTEGER PRIMARY KEY, source_rowid INTEGER,
  slip_code TEXT, customer TEXT, office TEXT, order_ref TEXT, model_shape TEXT,
  delivery_no TEXT, delivery_date TEXT, ship_due TEXT, qty_in TEXT,
  total_amount REAL, tax REAL, grand_total REAL, issued_date TEXT);

-- defect chargeback billing (赤伝請求システム / ｺｰﾄ赤伝処理一覧)
CREATE TABLE claim_billing (
  id INTEGER PRIMARY KEY, source_rowid INTEGER,
  entry_date TEXT, mgmt_no TEXT, billed_to TEXT, product_name TEXT,
  defect_qty REAL, film_type TEXT, claim_unit_price REAL, defect_reason TEXT,
  delivery_note_no TEXT, slip_no TEXT, billed_date TEXT, billing_status TEXT,
  billing_total REAL, tax REAL, entered_by TEXT, factory TEXT);
"""

# ---------------------------------------------------------------- orders
ORDER_HEADER = {
    # staging_col : source_col
    "mgmt_no": "管理No.", "slip_code": "伝票コードNo.", "received_date": "受付日",
    "ship_due": "出荷納期", "ship_to": "発送先", "end_user": "ユーザ名",
    "work_factory": "作業工場", "order_ref": "注番", "category": "分類",
    "qty": "本数1", "unit_price": "単価", "sales_amount": "売上金額",
    "coating": "コーティング", "coating_type": "皮膜種類", "outsource_to": "外注依頼先",
    "length_l": "寸法L", "input_by": "入力者名", "closing_group": "〆日グループ",
    "remarks": "備考",
}

def build_orders(db):
    s = src("受注管理システム新1")
    cur = s.execute('SELECT rowid, * FROM "受注管理システム"')
    cols = [d[0] for d in cur.description]
    idx = {c: i for i, c in enumerate(cols)}
    cust_cache, prod_cache, mat_cache = {}, {}, {}

    def dim_customer(name):
        name = clean(name)
        if not name: return None
        if name not in cust_cache:
            cur2 = db.execute("INSERT OR IGNORE INTO customers(name) VALUES(?)", (name,))
            cust_cache[name] = db.execute("SELECT id FROM customers WHERE name=?", (name,)).fetchone()[0]
        return cust_cache[name]

    def dim_product(ms, sh, bc):
        ms, sh, bc = clean(ms), clean(sh), clean(bc)
        if not (ms or sh): return None
        key = (ms, sh, bc)
        if key not in prod_cache:
            db.execute("INSERT OR IGNORE INTO products(model_shape,shape,blade_count) VALUES(?,?,?)", key)
            prod_cache[key] = db.execute(
                "SELECT id FROM products WHERE model_shape IS ? AND shape IS ? AND blade_count IS ?", key).fetchone()[0]
        return prod_cache[key]

    def dim_material(m, mt):
        m, mt = clean(m), clean(mt)
        if not (m or mt): return None
        key = (m, mt)
        if key not in mat_cache:
            db.execute("INSERT OR IGNORE INTO materials(material,material_type) VALUES(?,?)", key)
            mat_cache[key] = db.execute(
                "SELECT id FROM materials WHERE material IS ? AND material_type IS ?", key).fetchone()[0]
        return mat_cache[key]

    def g(row, jp):
        return row[idx[jp]] if jp in idx else None

    deliv_pairs = [(f"分納日付{i}", f"分納数{i}", i) for i in range(1, 6)]
    status_cols = [c for c in cols if c.startswith("完了チェック") and c not in ("完了チェック",)]

    n = 0
    for row in cur:
        cid = dim_customer(g(row, "受注先"))
        pid = dim_product(g(row, "型番形状"), g(row, "形状"), g(row, "刃数"))
        mid = dim_material(g(row, "素材1"), g(row, "材種1"))
        vals = {k: clean(g(row, j)) for k, j in ORDER_HEADER.items()}
        vals["qty"] = int(num(g(row, "本数1"))) if num(g(row, "本数1")) is not None else None
        vals["unit_price"] = num(g(row, "単価"))
        vals["sales_amount"] = num(g(row, "売上金額"))
        oid = db.execute(
            """INSERT INTO orders(mgmt_no,slip_code,received_date,ship_due,customer_id,ship_to,
               end_user,work_factory,product_id,material_id,order_ref,category,qty,unit_price,
               sales_amount,coating,coating_type,outsource_to,length_l,input_by,closing_group,
               remarks,source_rowid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (vals["mgmt_no"], vals["slip_code"], vals["received_date"], vals["ship_due"], cid,
             vals["ship_to"], vals["end_user"], vals["work_factory"], pid, mid, vals["order_ref"],
             vals["category"], vals["qty"], vals["unit_price"], vals["sales_amount"], vals["coating"],
             vals["coating_type"], vals["outsource_to"], vals["length_l"], vals["input_by"],
             vals["closing_group"], vals["remarks"], row[0])).lastrowid

        for dcol, qcol, seq in deliv_pairs:
            d, q = clean(g(row, dcol)), num(g(row, qcol))
            if d or q:
                db.execute("INSERT INTO order_deliveries(order_id,seq,delivered_date,qty) VALUES(?,?,?,?)",
                           (oid, seq, d, q))
        for sc in status_cols:
            st = clean(g(row, sc))
            if st:
                db.execute("INSERT INTO order_process_status(order_id,process,status) VALUES(?,?,?)",
                           (oid, sc.replace("完了チェック", ""), st))
        n += 1
        if n % 50000 == 0:
            db.commit(); print(f"  orders: {n}")
    print(f"  orders total: {n}")
    s.close()

# ---------------------------------------------------------------- material POs
def build_material_pos(db):
    s = src("素材発注書1")
    cur = s.execute('SELECT rowid, * FROM "素材発注書"')
    cols = [d[0] for d in cur.description]; idx = {c: i for i, c in enumerate(cols)}
    def g(row, jp): return row[idx[jp]] if jp in idx else None
    # line item groups: base ('' suffix) + 1..7
    groups = [""] + [str(i) for i in range(1, 8)]
    n = 0
    for row in cur:
        po_no = clean(g(row, "発注書No")); supplier = clean(g(row, "素材発注先"))
        ship_to = clean(g(row, "送り先")); orderer = clean(g(row, "発注者"))
        dept = clean(g(row, "担当部署名"))
        for gi, suf in enumerate(groups):
            mt_code = clean(g(row, f"材種コード{suf}"))
            mt_name = clean(g(row, f"材種名{suf}"))
            qty = num(g(row, f"数量{suf}")); price = num(g(row, f"単価{suf}"))
            if not (mt_code or mt_name or qty):   # skip empty line
                continue
            db.execute(
                """INSERT INTO material_purchase_orders(source_rowid,po_no,supplier,ship_to,orderer,dept,
                   order_date,due_date,received_date,material_type_code,material_type_name,dimension,
                   qty,unit_price,amount,drawing_no,line_seq) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (row[0], po_no, supplier, ship_to, orderer, dept,
                 clean(g(row, f"素材発注日{suf}")), clean(g(row, f"素材納入期日{suf}")),
                 clean(g(row, f"入荷日{suf}")), mt_code, mt_name, clean(g(row, f"素材寸法{suf}")),
                 qty, price, num(g(row, f"金額{suf}")), clean(g(row, f"図面番号{suf}")), gi))
            n += 1
    print(f"  material PO line items: {n}")
    s.close()

# ---------------------------------------------------------------- Yamaguchi
def build_yamaguchi(db):
    s = src("納品書システム")
    cur = s.execute('SELECT rowid, * FROM "山口注文システム"')
    cols = [d[0] for d in cur.description]; idx = {c: i for i, c in enumerate(cols)}
    def g(row, jp): return row[idx[jp]] if jp in idx else None
    n = 0
    for row in cur:
        db.execute(
            """INSERT INTO yamaguchi_orders(source_rowid,slip_code,customer,office,order_ref,model_shape,
               delivery_no,delivery_date,ship_due,qty_in,total_amount,tax,grand_total,issued_date)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (row[0], clean(g(row, "伝票コードNo.")), clean(g(row, "得意先")), clean(g(row, "事業所")),
             clean(g(row, "注番")), clean(g(row, "型番形状")), clean(g(row, "納品No.")),
             clean(g(row, "納品年月日")), clean(g(row, "出荷納期")), clean(g(row, "入荷数")),
             num(g(row, "税抜合計金額")), num(g(row, "消費税")), num(g(row, "総合計金額")),
             clean(g(row, "請求発行年月日"))))
        n += 1
    print(f"  yamaguchi orders: {n}")
    s.close()

# ---------------------------------------------------------------- claim billing
def build_claim_billing(db):
    s = src("赤伝請求システム")
    cur = s.execute('SELECT rowid, * FROM "ｺｰﾄ赤伝処理一覧"')
    cols = [d[0] for d in cur.description]; idx = {c: i for i, c in enumerate(cols)}
    def g(row, jp): return row[idx[jp]] if jp in idx else None
    n = 0
    for row in cur:
        db.execute(
            """INSERT INTO claim_billing(source_rowid,entry_date,mgmt_no,billed_to,product_name,
               defect_qty,film_type,claim_unit_price,defect_reason,delivery_note_no,slip_no,
               billed_date,billing_status,billing_total,tax,entered_by,factory)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (row[0], clean(g(row, "共通：記入日")), clean(g(row, "共通：管理No.")),
             clean(g(row, "共通：請求先")), clean(g(row, "共通：製品名")),
             num(g(row, "共通：不良本数")), clean(g(row, "ｺｰﾄ：膜種")),
             num(g(row, "共通：赤伝請求単価")), clean(g(row, "共通：不良理由")),
             clean(g(row, "共通：納品書No.")), clean(g(row, "共通：伝票No.")),
             clean(g(row, "共通：請求日")), clean(g(row, "共通：請求チェック")),
             num(g(row, "共通：請求合計")), num(g(row, "共通：消費税")),
             clean(g(row, "共通：記入者")), clean(g(row, "共通：記入工場"))))
        n += 1
    print(f"  claim billing: {n}")
    s.close()

# ---------------------------------------------------------------- report
def report(db):
    print("\n=== staging.sqlite row counts ===")
    for t in ("customers", "products", "materials", "orders", "order_deliveries",
              "order_process_status", "material_purchase_orders", "yamaguchi_orders",
              "claim_billing"):
        c = db.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        print(f"  {t:28s} {c}")

if __name__ == "__main__":
    main()
