#!/usr/bin/env python3
"""Fuzzy/keyed order -> delivery linking.

The legacy systems share no clean key (伝票コードNo. ranges are disjoint). The
strongest real signal is the Misumi order serial embedded in 注番 / ミスミ受発注No;
we corroborate it with normalized 型番形状 (model) and delivery-date proximity, and
fall back to a model+date+qty composite. Writes order_delivery_links into
staging.sqlite with a confidence tier and the basis of each match.

Tiers:
  A (high)  serial match AND model match
  B (med)   serial match AND delivery date within 1 year after the order
  C (low)   no usable serial: model match AND date proximity AND qty match
"""
import sqlite3, os, re
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.abspath(__file__))
STG  = os.path.join(ROOT, "staging.sqlite")

def norm_model(v):
    if not v: return None
    return re.sub(r"[^0-9a-z]", "", v.lower()) or None

def serials(v):
    """6-digit Misumi order serials (drop the ubiquitous 1103 routing suffix & 2-digit prefixes)."""
    if not v: return []
    return [g for g in re.findall(r"\d{6,7}", v) if g != "110311" and not g.startswith("1103")]

def pdate(v):
    if not v: return None
    m = re.match(r"(\d{4})\D(\d{1,2})\D(\d{1,2})", v.strip())
    if not m: return None
    y, mo, d = map(int, m.groups())
    try: return date(y, mo, d)
    except ValueError: return None

def main():
    db = sqlite3.connect(STG); db.text_factory = str
    db.execute("DROP TABLE IF EXISTS order_delivery_links")
    db.execute("""CREATE TABLE order_delivery_links(
        id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id),
        delivery_source TEXT, delivery_ref TEXT, delivery_date TEXT,
        tier TEXT, basis TEXT, score REAL)""")

    # ---- index orders ----
    print("indexing orders...")
    by_serial = defaultdict(list)   # serial -> [order_id]
    by_model  = defaultdict(list)   # norm_model -> [(order_id, recv_date, qty)]
    order_models = defaultdict(set) # order_id -> {norm_model}
    order_recv = {}                 # order_id -> best date
    rows = db.execute("""SELECT o.id, o.order_ref, o.received_date, o.ship_due, o.qty, p.model_shape
                         FROM orders o LEFT JOIN products p ON o.product_id=p.id""").fetchall()
    for oid, ref, recv, due, qty, model in rows:
        for s in serials(ref):
            by_serial[s].append(oid)
        order_recv[oid] = pdate(recv) or pdate(due)
        nm = norm_model(model)
        if nm:
            by_model[nm].append((oid, order_recv[oid], qty))
            order_models[oid].add(nm)
    # drop hyper-common serials (noise) — keep only serials mapping to <=20 orders
    noisy = {s for s, v in by_serial.items() if len(v) > 20}
    print(f"  serials indexed: {len(by_serial)} ({len(noisy)} noisy >20 dropped); models: {len(by_model)}")

    n = [0]
    def link(oid, srcname, ref, ddate, tier, basis, score):
        db.execute("""INSERT INTO order_delivery_links(order_id,delivery_source,delivery_ref,
                      delivery_date,tier,basis,score) VALUES(?,?,?,?,?,?,?)""",
                   (oid, srcname, ref, ddate.isoformat() if ddate else None, tier, basis, score))
        n[0] += 1

    def match_one(srcname, refval, model, ddate, qty):
        nm = norm_model(model); dd = ddate
        # candidates by serial (non-noisy)
        cand = []
        for s in serials(refval):
            if s in noisy: continue
            cand += by_serial.get(s, [])
        cand = list(dict.fromkeys(cand))
        # Serial candidates are ONLY accepted with real corroboration. A bare
        # serial match is noise: the 6-digit Misumi numbers collide across systems
        # and positions (a delivery dated 2007 "serial-matched" a 2016 order with a
        # different model). Require model agreement, or a tight date window.
        best = None
        for oid in cand:
            if not (nm and nm in order_models.get(oid, ())):
                orv = order_recv.get(oid)
                if not (dd and orv and 0 <= (dd - orv).days <= 90):
                    continue   # serial alone, no corroboration -> reject
            sc = 1.0; basis = ["serial"]
            if nm and nm in order_models.get(oid, ()):
                sc += 2; basis.append("model")
            orv = order_recv.get(oid)
            if dd and orv and 0 <= (dd - orv).days <= 90:
                sc += 1; basis.append("date")
            if best is None or sc > best[1]:
                best = (oid, sc, basis)
        if best:
            oid, sc, basis = best
            tier = "A" if "model" in basis else "B"
            link(oid, srcname, refval, dd, tier, "+".join(basis), sc)
            return True
        # Tier C: no usable serial — composite (model + tight date + qty), unique winner.
        if nm and nm in by_model:
            scored = []
            for oid, orv, oqty in by_model[nm]:
                if not (dd and orv and 0 <= (dd - orv).days <= 90):
                    continue
                sc = 2.0; basis = ["model", "date"]
                if qty is not None and oqty is not None and str(qty) == str(oqty):
                    sc += 1; basis.append("qty")
                scored.append((oid, sc, basis))
            scored.sort(key=lambda x: -x[1])
            if scored and scored[0][1] >= 3 and (len(scored) == 1 or scored[0][1] > scored[1][1]):
                oid, sc, basis = scored[0]
                link(oid, srcname, refval, dd, "C", "+".join(basis), sc)
                return True
        return False

    d = sqlite3.connect("extracted/納品書システム.sqlite"); d.text_factory = str
    # ---- Yamaguchi orders/deliveries ----
    print("matching 山口注文システム...")
    matched = total = 0
    for ref, model, qty, dd in d.execute(
            'SELECT "注番","型番形状","入荷数","納品年月日" FROM "山口注文システム"'):
        total += 1
        if match_one("山口注文システム", ref, model, pdate(dd), qty): matched += 1
    print(f"  {matched}/{total} matched")
    # ---- Misumi provisional delivery notes ----
    print("matching ミスミ仮納品書システム...")
    m2 = t2 = 0
    for ref, model, qty, dd in d.execute(
            'SELECT "ミスミ受発注No","型番","直送本数","直送日付" FROM "ミスミ仮納品書システム"'):
        t2 += 1
        if match_one("ミスミ仮納品書システム", ref, model, pdate(dd), qty): m2 += 1
    print(f"  {m2}/{t2} matched")

    db.commit()
    print("\n=== order_delivery_links by source & tier ===")
    for r in db.execute("""SELECT delivery_source, tier, count(*) FROM order_delivery_links
                           GROUP BY delivery_source, tier ORDER BY 1,2"""):
        print(f"  {r[0]:24s} tier {r[1]}: {r[2]}")
    print("  total links:", db.execute("SELECT count(*) FROM order_delivery_links").fetchone()[0])
    db.close()

if __name__ == "__main__":
    main()
