#!/usr/bin/env python3
"""Phase 2b (final): map legacy data into the CKK app model (_specs/tables.md).

Reads staging.sqlite (deduped dimensions) + the extracted order master directly,
writes mapped.sqlite shaped like the target Prisma/Postgres schema. Every table
carries a `legacy_data` JSON column preserving the original FileMaker fields for
future use — notably sales_orders.legacy_data holds the full original order row
(all non-empty columns), so nothing from the 671-column source is lost.

App-model decomposition: one legacy order row -> one order_acceptance (header:
customer) + one sales_order (line: product/qty/price), per the §2/§3 model.

Mapping limits (preserved in legacy_data, structured columns left null):
- material_types/materials: legacy 材種 is free-text (e.g. TSC-HEM4L2.5) and 素材 is
  a supply category; neither fits the 採番表 numbering, so the manufacturer/grade/
  shape/kind/surface/diameter/length codes are not derivable here.
- order_acceptance_id is required in the live schema for NEW records; migrated
  historical sales_orders link to a generated acceptance, so it is satisfied.
"""
import sqlite3, os, json, uuid, unicodedata, re

ROOT = os.path.dirname(os.path.abspath(__file__))
STG  = os.path.join(ROOT, "staging.sqlite")
EXT  = os.path.join(ROOT, "extracted")
OUT  = os.path.join(ROOT, "mapped.sqlite")
NS   = uuid.UUID("00000000-0000-0000-0000-0000000abc00")

def uid(*p): return str(uuid.uuid5(NS, "|".join(str(x) for x in p)))
def jname(ja): return json.dumps({"ja": ja or "", "en": ""}, ensure_ascii=False)

def clean(v):
    if v is None: return None
    s = str(v).replace("　", " ").strip()
    s = re.sub(r"[\r\n]+", " ", s).strip()
    return None if s in ("", "?", "*", "**", "****", "ー", "－", "—", "-", "―") else s

def num(v):
    s = clean(v)
    if s is None: return None
    m = re.search(r"-?\d+(\.\d+)?", s.replace(",", ""))
    return float(m.group()) if m else None

def bp_canon(name):
    if not name: return None
    n = unicodedata.normalize("NFKC", name)
    for t in ("(株)", "（株）", "株式会社", "(有)", "（有）", "有限会社"):
        n = n.replace(t, "")
    return re.sub(r"\s+", "", n).replace("・", "").replace("･", "").lower()

SCHEMA = r"""
PRAGMA journal_mode=OFF; PRAGMA synchronous=0;

-- 工場（製造・在庫・出荷の拠点）— _specs/tables.md factories
CREATE TABLE factories (
  id TEXT PRIMARY KEY NOT NULL, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  name_kana TEXT, country_code TEXT, postal_code TEXT, address TEXT, phone TEXT,
  email TEXT, contact_person TEXT, is_active INTEGER DEFAULT 1, notes TEXT,
  created_at TEXT, updated_at TEXT, legacy_data TEXT);

-- 法人マスタ（BP）— _specs/tables.md business_partners
CREATE TABLE business_partners (
  id TEXT PRIMARY KEY NOT NULL, bp_code TEXT UNIQUE, name TEXT NOT NULL,
  name_kana TEXT, short_name TEXT, parent_id TEXT, country_code TEXT, postal_code TEXT,
  address TEXT, phone TEXT, fax TEXT, email TEXT, website TEXT, tax_number TEXT,
  is_active INTEGER DEFAULT 1, notes TEXT, created_by TEXT, created_at TEXT, updated_at TEXT,
  legacy_data TEXT);
CREATE TABLE bp_role_assignments (
  id TEXT PRIMARY KEY NOT NULL, bp_id TEXT NOT NULL REFERENCES business_partners(id),
  role TEXT NOT NULL, is_active INTEGER DEFAULT 1, assigned_at TEXT, deactivated_at TEXT,
  legacy_data TEXT, UNIQUE(bp_id, role));

-- 材種 / 素材 — structured columns left null (legacy free-text doesn't fit 採番表)
CREATE TABLE material_types (
  id TEXT PRIMARY KEY NOT NULL, manufacturer_code TEXT, grade_code TEXT, shape_code TEXT,
  kind_code TEXT, name TEXT NOT NULL, description TEXT, is_active INTEGER DEFAULT 1,
  created_at TEXT, updated_at TEXT, legacy_data TEXT);
CREATE TABLE materials (
  id TEXT PRIMARY KEY NOT NULL, material_type_id TEXT REFERENCES material_types(id),
  surface_finish_code TEXT, diameter_code TEXT, length_variant_code TEXT, kind_code TEXT,
  diameter_mm REAL, length_mm REAL, manufacturer_model TEXT, nominal_diameter_mm REAL,
  name TEXT NOT NULL, unit TEXT, is_active INTEGER DEFAULT 1, notes TEXT,
  created_at TEXT, updated_at TEXT, legacy_data TEXT);

-- 製品 — _specs/tables.md products
CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, material_id TEXT REFERENCES materials(id),
  unit TEXT NOT NULL DEFAULT '本', spec TEXT, design_file_id TEXT, is_active INTEGER DEFAULT 1,
  notes TEXT, created_at TEXT, updated_at TEXT, legacy_data TEXT);

-- 注文受諾書（§2）— header carries the customer
CREATE TABLE order_acceptances (
  id TEXT PRIMARY KEY NOT NULL, order_number TEXT UNIQUE NOT NULL, quote_id TEXT,
  customer_bp_id TEXT REFERENCES business_partners(id), customer_branch_bp_id TEXT,
  customer_order_ref TEXT, status TEXT NOT NULL DEFAULT 'CONFIRMED', total_amount REAL,
  order_doc_file_id TEXT, notes TEXT, created_by TEXT, created_at TEXT, updated_at TEXT,
  legacy_data TEXT);

-- 受注書（§3）— line: product/qty/price; full original row preserved in legacy_data
CREATE TABLE sales_orders (
  id TEXT PRIMARY KEY NOT NULL, sales_order_number TEXT UNIQUE NOT NULL,
  order_acceptance_id TEXT NOT NULL REFERENCES order_acceptances(id),
  product_id TEXT REFERENCES products(id), lot_number INTEGER, order_type TEXT,
  quantity INTEGER, unit_price REAL, amount REAL, delivery_date TEXT,
  status TEXT NOT NULL DEFAULT 'SHIPPED', end_user_bp_id TEXT REFERENCES business_partners(id),
  is_locked INTEGER NOT NULL DEFAULT 0, notes TEXT, created_by TEXT, created_at TEXT,
  updated_at TEXT, legacy_data TEXT);
CREATE INDEX ix_so_oa ON sales_orders(order_acceptance_id);
CREATE INDEX ix_oa_cust ON order_acceptances(customer_bp_id);

-- 素材発注（購買・承認フロー）— _specs/tables.md material_purchase_orders
CREATE TABLE material_purchase_orders (
  id TEXT PRIMARY KEY NOT NULL, po_number TEXT UNIQUE NOT NULL,
  supplier_bp_id TEXT REFERENCES business_partners(id), status TEXT NOT NULL DEFAULT 'COMPLETED',
  total_amount REAL DEFAULT 0, currency TEXT DEFAULT 'JPY', purchase_date TEXT,
  requested_at TEXT, requested_by TEXT, approved_at TEXT, approved_by TEXT,
  ordered_at TEXT, ordered_by TEXT, completed_at TEXT, completed_by TEXT,
  cancelled_at TEXT, cancelled_by TEXT, cancel_reason TEXT, history TEXT,
  notes TEXT, created_by TEXT, created_at TEXT, updated_at TEXT, legacy_data TEXT);
CREATE TABLE material_purchase_order_items (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT NOT NULL REFERENCES material_purchase_orders(id),
  material_id TEXT REFERENCES materials(id), factory_id TEXT REFERENCES factories(id),
  quantity REAL, unit TEXT, unit_price REAL, amount REAL, currency TEXT DEFAULT 'JPY',
  expected_at TEXT, notes TEXT, sort_order INTEGER DEFAULT 0, legacy_data TEXT);
CREATE TABLE material_purchase_approvers (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_order_id TEXT NOT NULL REFERENCES material_purchase_orders(id),
  approval_group_id INTEGER, approver_user_id TEXT, created_at TEXT,
  UNIQUE(purchase_order_id, approval_group_id, approver_user_id));
CREATE INDEX ix_mpoi_po ON material_purchase_order_items(purchase_order_id);
"""

def main():
    if os.path.exists(OUT): os.remove(OUT)
    s = sqlite3.connect(STG); s.text_factory = str
    m = sqlite3.connect(OUT); m.text_factory = str
    m.executescript(SCHEMA)

    canon2bp = build_business_partners(s, m)
    factory_by_name = build_factories(s, m)
    build_material_types(s, m)
    prod_by_key = build_products(s, m)
    build_orders(m, canon2bp, prod_by_key)
    build_material_purchase_orders(s, m, canon2bp, factory_by_name)

    m.commit()
    report(m)
    m.close(); s.close()

def build_business_partners(s, m):
    """Dedupe customer/end-user names by canonical key; unify roles; aliases -> legacy_data."""
    from collections import defaultdict
    raw = defaultdict(lambda: {"roles": set(), "variants": defaultdict(int)})
    for name, cnt in s.execute("""SELECT c.name, count(*) FROM orders o JOIN customers c
                                  ON o.customer_id=c.id GROUP BY c.name"""):
        ck = bp_canon(name)
        if ck: raw[ck]["roles"].add("CUSTOMER"); raw[ck]["variants"][(name, "CUSTOMER")] += cnt
    for name, cnt in s.execute("SELECT end_user, count(*) FROM orders WHERE end_user IS NOT NULL GROUP BY end_user"):
        ck = bp_canon(name)
        if ck: raw[ck]["roles"].add("END_USER"); raw[ck]["variants"][(name, "END_USER")] += cnt
    # Suppliers from material purchase orders -> VENDOR role (same dedup/unification)
    for name, cnt in s.execute("""SELECT supplier, count(*) FROM material_purchase_orders
                                  WHERE supplier IS NOT NULL GROUP BY supplier"""):
        ck = bp_canon(name)
        if ck: raw[ck]["roles"].add("VENDOR"); raw[ck]["variants"][(name, "VENDOR")] += cnt

    canon2bp = {}
    for ck, info in raw.items():
        display = max(info["variants"].items(), key=lambda kv: kv[1])[0][0]
        i = uid("bp", ck); canon2bp[ck] = i
        legacy = {"canon_key": ck,
                  "aliases": [{"name": n, "role": r, "orders": c}
                              for (n, r), c in sorted(info["variants"].items(), key=lambda kv: -kv[1])]}
        m.execute("""INSERT INTO business_partners(id,name,is_active,legacy_data) VALUES(?,?,1,?)""",
                  (i, jname(display), json.dumps(legacy, ensure_ascii=False)))
        for role in sorted(info["roles"]):
            m.execute("INSERT OR IGNORE INTO bp_role_assignments(id,bp_id,role) VALUES(?,?,?)",
                      (uid("bpr", i, role), i, role))
    return canon2bp

def build_material_types(s, m):
    """Legacy 材種 (free text) -> unmapped material_type placeholders; raw kept in legacy_data."""
    for (mt,) in s.execute("SELECT DISTINCT material_type FROM materials WHERE material_type IS NOT NULL"):
        m.execute("""INSERT OR IGNORE INTO material_types(id,name,is_active,legacy_data) VALUES(?,?,1,?)""",
                  (uid("mt", mt), jname(mt),
                   json.dumps({"legacy_材種": mt, "mapped": False,
                               "reason": "free-text; not decodable to 採番表 codes"}, ensure_ascii=False)))

def build_products(s, m):
    """One product per distinct (型番形状, 形状, 刃数). Returns lookup key->product id."""
    prod_by_key = {}
    for pid, ms, sh, bc in s.execute("SELECT id, model_shape, shape, blade_count FROM products"):
        code = ms or sh
        i = uid("prod", pid)
        prod_by_key[(ms, sh, bc)] = i
        spec = json.dumps({"shape": sh or "", "blade_count": bc or ""}, ensure_ascii=False)
        legacy = json.dumps({"型番形状": ms, "形状": sh, "刃数": bc}, ensure_ascii=False)
        m.execute("""INSERT INTO products(id,name,unit,spec,is_active,legacy_data) VALUES(?,?,?,?,1,?)""",
                  (i, jname(code), "本", spec, legacy))
    return prod_by_key

def build_factories(s, m):
    """Seed the known CKK factories; map full + short names (combos use short forms)."""
    FACT = [("HONSHA", "本社工場", ["本社"]), ("YAMAGUCHI", "山口工場", ["山口"]),
            ("YAMAGATA", "山形工場", ["山形"]), ("OKINAWA", "沖縄工場", ["沖縄"]),
            ("DALIAN", "大連工場", ["大連"])]
    raw_vals = {code: set() for code, _, _ in FACT}
    for (wf,) in s.execute("SELECT DISTINCT work_factory FROM orders WHERE work_factory IS NOT NULL"):
        for code, full, aliases in FACT:
            if full in wf or any(a in wf for a in aliases):
                raw_vals[code].add(wf)
    factory_by_name = {}
    for code, full, aliases in FACT:
        i = uid("factory", code)
        for key in [full] + aliases:
            factory_by_name[key] = i
        m.execute("INSERT INTO factories(id,code,name,is_active,legacy_data) VALUES(?,?,?,1,?)",
                  (i, code, jname(full),
                   json.dumps({"legacy_作業工場_values": sorted(raw_vals[code])}, ensure_ascii=False)))
    return factory_by_name

def build_material_purchase_orders(s, m, canon2bp, factory_by_name):
    """Group staging 素材発注書 line-items by source row -> PO header + items. Suppliers -> VENDOR BP.
    material_id left null (legacy 材種 free-text doesn't map to 素材); raw kept in item legacy_data."""
    from collections import defaultdict
    rows = defaultdict(list)
    for r in s.execute("""SELECT source_rowid, po_no, supplier, order_date, due_date, received_date,
                          material_type_code, material_type_name, dimension, qty, unit_price, amount,
                          drawing_no, line_seq, ship_to FROM material_purchase_orders
                          ORDER BY source_rowid, line_seq"""):
        rows[r[0]].append(r)
    seen, npo, nit = set(), 0, 0
    for srid, items in rows.items():
        head = items[0]
        po_no = clean(head[1]) or f"LEG-{srid}"
        if po_no in seen:
            po_no = f"{po_no}-{srid}"
        seen.add(po_no)
        supplier_bp = canon2bp.get(bp_canon(head[2])) if head[2] else None
        total = sum((it[11] or 0) for it in items)
        po_id = uid("mpo", srid)
        m.execute("""INSERT INTO material_purchase_orders(id,po_number,supplier_bp_id,status,total_amount,
                     currency,purchase_date,completed_at,created_at,legacy_data)
                     VALUES(?,?,?,?,?,?,?,?,?,?)""",
                  (po_id, po_no, supplier_bp, "COMPLETED", total, "JPY",
                   clean(head[3]), clean(head[5]), clean(head[3]),
                   json.dumps({"po_no": clean(head[1]), "supplier": clean(head[2]),
                               "ship_to": clean(head[14])}, ensure_ascii=False)))
        npo += 1
        for it in items:
            fid = factory_by_name.get(clean(it[14]) or "")
            m.execute("""INSERT INTO material_purchase_order_items(id,purchase_order_id,material_id,factory_id,
                         quantity,unit,unit_price,amount,currency,expected_at,sort_order,legacy_data)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                      (uid("mpoi", srid, it[13]), po_id, None, fid, it[9], "本", it[10], it[11], "JPY",
                       clean(it[4]), it[13],
                       json.dumps({"材種コード": clean(it[6]), "材種名": clean(it[7]),
                                   "素材寸法": clean(it[8]), "図面番号": clean(it[12])}, ensure_ascii=False)))
            nit += 1
    print(f"  material POs: {npo}  items: {nit}")

ORDER_TYPE = lambda cat: ("TEST" if cat and "テスト" in cat else
                          "SAMPLE" if cat and "サンプル" in cat else "PRODUCTION")

def build_orders(m, canon2bp, prod_by_key):
    """Iterate the extracted order master directly: each row -> order_acceptance + sales_order.
    legacy_data on the sales_order preserves every non-empty original field."""
    o = sqlite3.connect(os.path.join(EXT, "受注管理システム新1.sqlite")); o.text_factory = str
    cur = o.execute('SELECT rowid, * FROM "受注管理システム"')
    cols = [d[0] for d in cur.description]
    idx = {c: i for i, c in enumerate(cols)}
    def g(row, jp): return row[idx[jp]] if jp in idx else None

    seen_oa = set()
    n = 0
    for row in cur:
        rid = row[0]
        cust = bp_canon(g(row, "受注先")); cust_bp = canon2bp.get(cust) if cust else None
        eu = bp_canon(g(row, "ユーザ名")); eu_bp = canon2bp.get(eu) if eu else None
        ms, sh, bc = clean(g(row, "型番形状")), clean(g(row, "形状")), clean(g(row, "刃数"))
        prod = prod_by_key.get((ms, sh, bc))
        qn = num(g(row, "本数1")); qty = int(qn) if qn is not None else None
        up = num(g(row, "単価")); amt = num(g(row, "売上金額"))
        if amt is None and qty and up: amt = qty * up
        cat = clean(g(row, "分類")); due = clean(g(row, "出荷納期")); recv = clean(g(row, "受付日"))

        # unique order number
        base = clean(g(row, "伝票コードNo.")) or clean(g(row, "管理No.")) or f"LEG-{rid}"
        onum = base if base not in seen_oa else f"{base}-{rid}"
        seen_oa.add(onum)

        # full original row as JSON (non-empty cleaned fields)
        legacy_full = {c: clean(g(row, c)) for c in cols if c != "rowid" and clean(g(row, c)) is not None}
        legacy_json = json.dumps(legacy_full, ensure_ascii=False)

        oa_id = uid("oa", rid)
        m.execute("""INSERT INTO order_acceptances(id,order_number,customer_bp_id,customer_order_ref,
                     status,total_amount,created_at,legacy_data) VALUES(?,?,?,?,?,?,?,?)""",
                  (oa_id, onum, cust_bp, clean(g(row, "注番")), "CONFIRMED", amt, recv,
                   json.dumps({"受注先": clean(g(row, "受注先")), "管理No.": clean(g(row, "管理No.")),
                               "伝票コードNo.": clean(g(row, "伝票コードNo."))}, ensure_ascii=False)))
        m.execute("""INSERT INTO sales_orders(id,sales_order_number,order_acceptance_id,product_id,
                     order_type,quantity,unit_price,amount,delivery_date,status,end_user_bp_id,
                     created_at,legacy_data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (uid("so", rid), f"{onum}-01", oa_id, prod, ORDER_TYPE(cat), qty, up, amt, due,
                   "SHIPPED", eu_bp, recv, legacy_json))
        n += 1
        if n % 50000 == 0:
            m.commit(); print(f"  orders: {n}")
    print(f"  orders total: {n}")
    o.close()

def report(m):
    print("\n=== mapped.sqlite row counts ===")
    for t in ("factories", "business_partners", "bp_role_assignments", "material_types", "materials",
              "products", "order_acceptances", "sales_orders",
              "material_purchase_orders", "material_purchase_order_items", "material_purchase_approvers"):
        print(f"  {t:30s} {m.execute(f'SELECT count(*) FROM {t}').fetchone()[0]}")
    print("  roles:", dict(m.execute("SELECT role,count(*) FROM bp_role_assignments GROUP BY role").fetchall()))

if __name__ == "__main__":
    main()
