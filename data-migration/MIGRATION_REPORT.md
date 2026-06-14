# CKK FileMaker → SQLite migration

Migrates the legacy CKK FileMaker Pro 7 data (`/Users/kaiseisawada/Desktop/CKK/filemaker_data/生産管理システム`)
from non-relational `.fp7` files into relational SQLite, in two layers:
1. **`staging.sqlite`** — faithful normalization, source-driven.
2. **`mapped.sqlite`** — reshaped into the CKK app model (`_specs/tables.md`).

The `2022.9.19/` subdirectory is a backup and was excluded throughout.

---

## Phase 1 — extraction (done)

`.fp7` is a proprietary binary format (magic `BAM7`); no FileMaker app or working
parser was available. Evan Miller's `fmptools` returned **0 tables** on these files
because they were converted from FileMaker 5/6 and nest their catalog differently.

A local fork in `tools/fmptools/` (built directly with clang — see `extract_all.sh`)
applies four fixes:
- **list_tables.c / list_columns.c / read_values.c** — table & column names live one
  level deeper (`[3].[16].[5].[tid].[16]` / `[tid].[3].[5].[col].[16]`, `ref_simple==1`);
  records were already at `[tid].[5].[row]`. Columns are registered from the
  `ref_simple==2` metadata entry so number/calc fields (which store an int where the
  name belongs) still get a `colN` slot — without this the record→column bind indices break.
- **scsu.c** — real SCSU-decoder bug: `SQn` single-quote always used the static window;
  per spec a quoted byte ≥0x80 uses the *dynamic* window. Fixed katakana (`ン`/`レ` → `⇓`/`⇌`).
- **fmp.c** — best-effort recovery: an unrecognized chunk code (common inside embedded
  container/blob blocks) skips that block instead of discarding the whole file.
- **fmp2sqlite.c** — dedupe/sanitize column names; skip zero-column layout tables
  instead of aborting.

**Result:** 150 files → 150 per-file DBs in `extracted/` — **550 tables, ~2.0M rows.**
148 clean; the two 7.7–8.6 GB order files segfault on trailing embedded-PDF blobs but
salvage every data table (verified `PRAGMA quick_check = ok`; `受注管理システム新1` keeps
all 317,914 order rows). Per-file log: `extract_log.tsv`. Full column profile:
`profile_report.md`. CSV files in the source dir are CP932/Shift-JIS.

---

## Phase 2a — faithful staging (`staging.sqlite`, done)

Scope per request: **order + purchasing + billing.** Order master =
`受注管理システム新1` (317,914 rows; the 671-column flat table is the spine).
Built by `build_staging.py`.

| table | rows | source |
|---|---:|---|
| `orders` | 317,914 | 受注管理システム新1 — curated ~22-field header, typed/cleaned |
| `customers` | 236 | DISTINCT 受注先 |
| `products` | 43,444 | DISTINCT 型番形状 / 形状 / 刃数 |
| `materials` | 3,839 | DISTINCT 素材1 / 材種1 |
| `order_deliveries` | 7,183 | unpivot 分納日付N / 分納数N (N=1..5) |
| `order_process_status` | 2,732,632 | unpivot named 完了チェックX → (process, status) |
| `material_purchase_orders` | 54,610 | 素材発注書 — line items unpivoted (groups 0..7) |
| `yamaguchi_orders` | 17,922 | 納品書システム / 山口注文システム |
| `claim_billing` | 19,999 | 赤伝請求システム — defect chargeback billing |

`orders` FK coverage: customer 98%, product 99%, unit_price 94%, received_date 96%.

---

## Phase 2b — CKK app-model mapping (`mapped.sqlite`, final, done)

`build_mapped.py` reshapes the data into the **updated** `_specs/tables.md` schema
(deterministic uuid5 PKs, `{ja,en}` JSON name fields, source Japanese-only so `en=""`).
Each legacy order row is decomposed per the §2/§3 model into an **order_acceptance**
(header: customer) + a **sales_order** (line: product/qty/price). **Every table carries
a `legacy_data` JSON column** preserving the original FileMaker fields — and
`sales_orders.legacy_data` holds the *entire* original order row (all non-empty columns,
~150 fields each), so nothing from the 671-column source is lost.

| table | rows | from / notes |
|---|---:|---|
| `business_partners` | 440 | customers + end users, deduped by canonical name; aliases in `legacy_data` |
| `bp_role_assignments` | 454 | 231 CUSTOMER + 223 END_USER (roles unified per entity) |
| `material_types` | 3,555 | DISTINCT 材種 — **unmapped placeholders** (free-text ≠ 採番表 codes); raw in `legacy_data`, structured codes null |
| `materials` | 0 | legacy 素材 are 5 supply-categories, not material records; preserved inside each order's `legacy_data` |
| `products` | 43,444 | DISTINCT 型番形状/形状/刃数; `legacy_data` keeps the three source fields |
| `order_acceptances` | 317,914 | header per legacy order; `customer_bp_id`, `customer_order_ref`=注番 |
| `sales_orders` | 317,914 | line per legacy order; FK→acceptance; **full original row in `legacy_data`** |
| `factories` | 5 | seeded from 作業工場 (本社/山口/山形/沖縄/大連工場); raw values in `legacy_data` |
| `material_purchase_orders` | 15,301 | 素材発注書 grouped by source row; `supplier_bp_id`→VENDOR BP; status COMPLETED |
| `material_purchase_order_items` | 54,610 | line items; `material_id` null (材種 free-text), 材種/寸法 in `legacy_data` |
| `material_purchase_approvers` | 0 | no legacy approver data |

`business_partners` is now 459 (added **26 VENDOR** suppliers from 素材発注書; roles: 231 CUSTOMER /
223 END_USER / 26 VENDOR, unified per entity). FK coverage: `order_acceptances.customer_bp_id` 98%,
`sales_orders.product_id` 99%, `material_purchase_orders.supplier_bp_id` 99%.
`material_purchase_order_items.factory_id` is null (legacy 送り先 isn't a factory name — forward-only).
`mapped.sqlite` is ~1.8 GB because of the full-row `legacy_data` JSON.

The step-DAG (`work_order_step_links`) and per-step qty/defect fields are **forward-only** — there are no
work_orders/steps in the migration (the flat legacy order has no per-step structure beyond the
date/completion columns preserved in `sales_orders.legacy_data`), so they have no rows to populate.

**Reconfirmed against updated spec:** `build_staging.py` is source-driven (faithful, not
app-shaped) and needs no change — it still reflects the legacy structure 1:1. Only
`build_mapped.py` tracks `_specs/tables.md`; it was rewritten for the new material
decomposition, the order_acceptance/sales_order split, and the `legacy_data` columns.

### Material model mismatch (why structured codes are null)

The updated spec models 材種/素材 as a strict numbering system
(`material_manufacturers`→`grades`→`shapes`→`kinds`, `surface_finishes`/`diameters`/
`length_variants`, e.g. `B01B0001` / `B01B0001-A083-330`). Legacy `材種` is free text
(`TSC-HEM4L2.5`, effectively a tool model) and `材種`/`素材` cannot be decoded to those
codes without a conversion table. They are therefore preserved verbatim in `legacy_data`
for future decoding, with structured columns left null.

### Business-partner deduplication (`build_mapped.py`, `bp_canon`)

Raw customer/end-user names were merged by a canonical key (NFKC for full/half-width
and `㈱`→`(株)`, drop `株式会社`/`有限会社`/spaces/middots). This **merged 51 partners**
(499→440), e.g. `THK山形工場` unified 5 variants (`THK 山形工場`, `THK㈱山形工場`,
`ＴＨＫ山形工場`…) and `NGKファインモールド` was unified across the CUSTOMER and END_USER
roles into one partner with both. Distinct branches (`三重工場` vs `山口工場`) and
parenthetical sub-accounts (`(OSG)` vs `(アライド)`) are intentionally **kept separate**.
Every original spelling is preserved in `bp_aliases` (with its order count).

### Order ↔ delivery linking — attempted, infeasible with available data (`link_deliveries.py`)

Tried three strategies, all fail for one root reason:
1. **Shared key** `伝票コードNo.` — disjoint number ranges, 0 overlap.
2. **Misumi order serial** (embedded in 注番 / ミスミ受発注No) — the 6-digit serials
   collide across systems/positions; bare-serial matches paired a 2007 delivery with a
   2016 order of a different model. Noise.
3. **Composite** (型番形状 + date + qty) — near-zero unique high-confidence matches.

**Root cause:** the date ranges don't overlap. Every order system starts in **2011**
(新1 2011–2023, 新2/新3 2011–2012, X新1 2011–2017) while the standalone delivery systems
are **2005–2009** (`山口注文システム`, `ミスミ仮納品書システム`). The orders for those
deliveries are simply not present in any extracted file. Conversely, **2011+ deliveries
are recorded inline in the order record** (7,183 installment rows in `order_deliveries`;
ship dates on 294k orders), so no cross-table link is needed for that era. The
`order_delivery_links` table exists but is intentionally empty; re-running the linker
against pre-2011 order data (if it surfaces) would populate it.

---

## Known caveats / decisions deferred to domain review

1. **Legacy systems are independent and span different eras.** The standalone delivery
   systems (2005–2009) predate all order data (2011+), so they cannot be linked to orders
   (see above). Other cross-system links (orders↔purchasing↔billing) likewise lack a
   reliable shared key and would need domain-guided fuzzy matching.
2. **Per-step process dates not unpivoted.** `工程日付1..40` (55 cols) can't be reliably
   mapped to the named `完了チェックX` processes without the original FileMaker layout.
   The named completion statuses *are* captured (`order_process_status`); the numbered
   dates remain in the source extract for later mapping.
3. **素材 vs 材種 semantics.** In this order table `素材1` holds only 5 supply-method
   categories (素材込み / 支給 …), while `材種1` (3,555 values) is the real material/grade
   master. Mapped `material_types` ← 材種 (correct); `materials` ← 素材 is sparse by nature.
4. **Order-master version chosen:** `受注管理システム新1` (318k, full history). `新2`/`新3`
   (27.8k each) and `X受注管理システム新1` (54k) are not yet merged/deduped.
5. **Status defaulted** to `SHIPPED` on sales_orders (these are historical/closed orders);
   refine from `order_process_status` if a live status is needed.

## Rebuild

```bash
./extract_all.sh small && ./extract_all.sh big   # .fp7 -> extracted/*.sqlite
python3 build_staging.py                          # -> staging.sqlite
python3 link_deliveries.py                        # -> staging.order_delivery_links (empty; see note)
python3 build_mapped.py                           # -> mapped.sqlite (incl. BP dedup + aliases)
```
