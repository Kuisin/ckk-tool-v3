# Production area verification report — PRs #896 / #885 / #883

Tested against `dev` @ commit merging PR #897 (branch `test/dev-batch-verification-2026-09`),
production build at `http://localhost:3100`, DB `ckk-shots-db-dbv` (port 55442). Logged in as `demo1`.

## 0. Environment note (not a code bug)

Mid-session the DB container `ckk-shots-db` (which I was originally pointed at) was removed by
another session's screenshot pipeline. The coordinator ("main") re-pointed the app at a fresh
container `ckk-shots-db-dbv` (port 55442) with the same seed restored. I redid the (read-only)
checks I'd done before the switch; no data I'd created was lost because I hadn't mutated
anything yet at that point. All SQL/evidence below is from `ckk-shots-db-dbv`. SeaweedFS and
Gotenberg are **not running** in this environment (confirmed via `docker ps`), so file-upload-based
flows (設計図 PD16 図面データ upload) and PDF generation could not be exercised — this matches the
brief's stated environment limitation, not a bug.

## 1. Checks table

| # | Check | Expected (PR) | Observed | Result | Evidence |
|---|---|---|---|---|---|
| 1 | PU11 購買依頼 new → material line, save | Creates PRQ; `purchase_request_items.item_id` set | Created `PRQ-202609-00001`; `item_id=24` = `materials.item_id` for chosen material (`material_id=21`) | PASS | SQL: `purchase_request_items` row `6e4dcfad-...` → `material_id=21, item_id=24, materials.item_id=24` |
| 2 | Approve PRQ (2-step flow, demo1 bypass) | Approval works | Approved; PRQ status → 承認済 | PASS | screenshot `11-pu11-approved.png` |
| 3 | PU12 素材発注書 new (manual form, no AI panel) | Creates PO; `material_purchase_order_items.item_id` set | Created `PO-202609-00001`; material name/code displayed correctly (`A02A0001-A010-310（AF510 黒皮 φ1.0×310）`) | PASS | SQL: `item_id=24`, `material_id=21` both set |
| 4 | Approve → 発注 (ORDERED) | Status transitions work | 承認依頼→承認→発注 all succeeded | PASS | screenshot `17-pu12-ordered.png` |
| 5 | PU13 入荷完了 from the PO (not the direct-intake form) | Creates `material_receipts` row with `item_id`; posts `item_inventory` | Receipt created; `item_id=24`, `material_id=21`; `item_inventory` row for item 24 @ plant 1 = qty 1 | PASS | SQL: `material_receipts` row, `item_inventory` row `fbbe59ac-...` |
| 6 | PD12 指示書 new, standalone (在庫向け, product picker) | `work_orders.product_item_id` = product's item_id; old `product_id` still written | Created `WOR-202609-00001`/9005: `product_id=9001, product_item_id=1` | PASS (product side) |
| 7 | PD12 with a chosen material (製造分) | `work_orders.material_item_id` set; **old `material_id` also still written** per PR's stated bridge policy | Created `WOR-202609-00002`/9006: `material_item_id=24` set correctly, but **`material_id` is NULL** — see Bug #2 below | **FAIL** (see Bug #2) |
| 8 | MS08 process-step edit page has no 「作業計画に数量が必要」 switch | Removed per #885 | Confirmed absent; the 3 remaining required-field switches (担当者/作業場所/開始終了時刻) are present, no 数量 one | PASS | screenshot `60-ms08-edit.png` |
| 9 | Work-order 作業計画 panel: quantity only for 実績, not 計画 | Per #885 | 計画 table columns: 担当者/日付/時間/作業場所/備考 — no 数量 column; add-row fields have no 数量 input either. 実績 (作業実績) is a separate section | PASS | screenshot / text dump in step 36 |
| 10 |承認依頼 works when plan fields (date+location) present | Approval not blocked | WOR-202609-00002 requested→approved (2-step, demo1) successfully once 作業場所 was filled for all 4 plan rows | PASS | screenshot `64-wo-approved.png` |
| 11 | Recursion fix: create PREP route (`/master/process-steps/prep-routes/new`) | No crash (old bug: infinite recursion in `revalidateFor`) | Created `dbv標準準備工程` v1 without error/hang | PASS |
| 12 | Recursion fix: create MANUFACTURING route on `/master/products/9001/routes/new` | No crash | Created `dbv標準製造工程` v1 | PASS | SQL: new route id `9003`, `item_id=1` |
| 13 | Recursion fix: new version (`新バージョン`) | No crash | v2 created successfully | PASS |
| 14 | Recursion fix: edit route name (modal) | No crash | Renamed to `dbv標準製造工程v1改`, saved | PASS |
| 15 | Recursion fix: delete route (all versions) | No crash | Deleted successfully, list reverted to "未登録" | PASS |
| 16 | Grep server log for `Maximum call stack` after all of the above | 0 occurrences | `grep -c "Maximum call stack" /tmp/dbv-web-server.log` = 0 | PASS |
| 17 | SA16 設計依頼 new (単独 trigger, product 9001) | `design_requests.item_id` = product's item_id | Created `DSG-202609-00001`; `item_id=1` | PASS |
| 18 | PD16 設計図 new version, upload file | `design_files.item_id` set | **Could not complete** — file upload fails with "ストレージへの保存に失敗しました" because SeaweedFS is not running in this env | NOT TESTABLE (environment) — verified by code inspection instead (see §3) |
| 19 | MS19 検査表テンプレート new, with 対象製品=9001 | `inspection_templates.item_id` set | Created id `9103` (`DBV-INS-01`); `item_id=1`, `product_id=9001` | PASS |
| 20 | Items invariant (#6): `count(*) where <old id> not null and item_id null = 0` for all 9 tables | Should be 0 | **Non-zero for all 9 tables** — but 100% attributable to demo/seed SQL (`shared-db/sql/production-demo-seed.sql`, `purchase-demo-seed.sql`) inserting rows directly without `item_id`, not to app write paths (every row I created through the UI came out correct) | **FAIL** as literally asked, but root cause is the demo seed scripts, see Bug #1 |
| 21 | MS0G 料金マスタ: create FIXED charge item (梱包費 500, code `DBV_PACKING`) | Created, amount field required, not editable at use-time | Created; list shows 固定/¥500 | PASS |
| 22 | MS0G: create VARIABLE charge item (送料, default 1000, tax category, code `DBV_SHIPPING`) | Created, default shown, editable at use-time | Created; list shows 可変/¥1,000（既定）/課税 | PASS |
| 23 | Add both charges to WOR-202609-00002 (APPROVED) 概要 tab | FIXED row: no editable price input (shows "料金マスタの固定金額"); VARIABLE row: editable NumberInput pre-filled with default | Confirmed: FIXED row renders static text instead of a price input; VARIABLE row is an editable NumberInput defaulting to ¥1,000 | PASS |
| 24 | Negative amount on VARIABLE row | Rejected | Typing `-100` was clamped by the NumberInput's `min=0` to `0` before submit (not a submit-time error, but the negative value never reaches the server); server also has an explicit `unitPrice < 0` → `amountCannotBeNegative` guard in `lib/charge-core.ts` (defense in depth) | PASS (see UX observation §4) |
| 25 | 0 amount accepted | Accepted | Row persisted with `unit_price=0.00, amount=0.00` in `work_order_charges` | PASS |
| 26 | Set VARIABLE price to a real value (800) and save | Persists | `work_order_charges`: `DBV_PACKING` qty 1 / ¥500 / ¥500, `DBV_SHIPPING` qty 1 / ¥800 / ¥800 | PASS |
| 27 | Copy-once-per-work-order into `delivery_order_charges` when the same lot appears on 2 DO lines | Charges copied exactly once per distinct work order, not per line | **Could not exercise live** (see §3 blocker) — verified by reading `copyWorkOrderCharges()` in `app/(dashboard)/shipping/delivery-orders/actions.ts:721-767`: it dedupes `lotNumber`s via `new Set(...)` before querying work orders, so N delivery-order lines sharing one lot only ever produce one set of copied charge rows | PASS (by code inspection) |
| 28 | Edit DO charge allowed while DRAFT, blocked after CONFIRMED | Per PR | Verified by code: the charge-update action reads `order.status`, returns `actionError(tr("charges.deliveryOrderClosedForCharges"))` whenever `status !== "DRAFT"` (`actions.ts:807-810`) | PASS (by code inspection) |
| 29 | Delete a used charge item (`DBV_PACKING`, used by 1 WO) in MS0G | Blocked, with a "指示書 N 件・出荷書 M 件" style message | Got exactly: **「指示書 1 件・出荷書 0 件で使われているため削除できません」** | PASS |
| 30 | 無効化 (disable) the same used charge item | Allowed | Disabled successfully; row now shows 無効, "すでに書いた行はそのまま残ります" note shown in confirm dialog | PASS |

## 2. Bugs (ranked by severity)

### Bug #1 (HIGH) — Demo/screenshot seed data was never updated for PR #896's `item_id` columns; this breaks visible reads for pre-existing seeded records

**Repro:**
1. `docker exec -i ckk-shots-db-dbv psql -U postgres -d ckk -Atc "select id from app.material_purchase_orders where po_number='PO-202607-00001';"`
2. Open `http://localhost:3100/purchase/purchase-orders/PO-202607-00001` (logged in as demo1).
3. Look at the 明細（2） table — the 素材 (material) column shows **`—`** for both lines instead of the material code/name.
4. Same symptom on `http://localhost:3100/purchase/purchase-requests/PRQ-202607-00001` (素材 column blank) and `http://localhost:3100/purchase/material-receipts` (all 3 seeded rows show `—` for 素材).
5. **Worse**: `http://localhost:3100/master/products/9001?tab=routes` shows **「この製品の工程リストは未登録です」** even though `app.product_process_routes` has a real row (`id=9001, product_id='9001', kind='MANUFACTURING'`) for this exact product — the route is completely invisible in the UI.

**Root cause:** PR #896 moved all reads from `products.id`/`materials.id` to `items.id` (e.g.
`material_purchase_order_items.item?.code`/`item?.name` in
`app/(dashboard)/purchase/purchase-orders/data.ts:142-146`, and
`lib/product-routes.ts:50-61` `listProductRoutes()` which does
`prisma.productProcessRoute.findMany({ where: { itemId, kind: "MANUFACTURING" } })`). The seed
files that populate this test environment (`shared-db/sql/production-demo-seed.sql`,
`shared-db/sql/purchase-demo-seed.sql`, and presumably others covering
`inspection_templates`/`design_requests`/`design_files`) insert rows with the legacy
`material_id`/`product_id` but were **never updated to also set `item_id`**. Since the app no
longer falls back to the legacy id for display, these rows render as blank/missing.

**Confirmed with the exact invariant the brief asked for** (`count(*) where <old-id> is not
null and item_id is null`, checked right after this DB was seeded — not after any mutation of
mine):

```
material_purchase_order_items | 6
material_receipts             | 3
purchase_request_items        | 4
work_orders.material_item_id  | 3
work_orders.product_item_id   | 4
product_process_routes        | 1
inspection_templates          | 2
design_requests               | 6
design_files                  | 4
```

Every row I created **through the app UI** during this session populated `item_id` correctly
(see §1 rows 1,3,5,17,19) — so the write paths themselves are correct. This is purely a seed-data
gap.

**Suggested fix:** update `shared-db/sql/production-demo-seed.sql` / `purchase-demo-seed.sql`
(and whatever seeds `inspection_templates`/`design_requests`/`design_files`/PU/PD demo rows) to
also set `item_id` (looked up via `materials.item_id`/`products.item_id`) for every row they
insert into the 9 tables PR #896 touched. Until then, the seeded demo records (used by all 4
test agents this run) will look broken in every screen that reads the new columns.

**File:** `shared-db/sql/production-demo-seed.sql`, `shared-db/sql/purchase-demo-seed.sql`.

---

### Bug #2 (MEDIUM) — `work_orders.material_id` (legacy bridge column) is never written by the app, contradicting PR #896's own stated policy

**Repro:**
1. Create a 製造分 (MANUFACTURE) work order via `/production/work-orders/new`, selecting any
   material (e.g. via 使用素材 SearchSelect).
2. Save. Query:
   `select work_order_number, material_id, material_item_id from app.work_orders where work_order_number=<N>;`
3. Observed: `material_item_id` is correctly set (e.g. `24`), but **`material_id` is NULL** —
   even though the corresponding `materials.id` (`21`) exists and is exactly what
   `lib/item-legacy-material.ts` `legacyMaterialIdForItem()` is built to resolve.

**Root cause:** PR #896's description states "旧列は残したまま書き続ける... 書き込みの橋は 1
本だけ（`lib/item-legacy-material.ts` / `item-legacy-product.ts`）... 旧列がまだ NOT NULL /
双子（`lib/inventory.ts`）に読まれているので書き込み時だけ旧 id を引く." But
`app/(dashboard)/production/work-orders/actions.ts` never actually does this for `materialId`:
grepping the entire file for `materialId:` (as a Prisma `data` key) returns **zero** matches, in
either the create path (`~line 664` `tx.workOrder.create({ data: { ..., materialItemId, ... }
})` — no `materialId` field at all) or the update/copy paths. By contrast, the analogous bridge
for `productItemId` is correctly resolved every time via `itemIdForLegacyProduct(productId)` —
but that's the *forward* direction (already have `productId`, deriving `productItemId`); nothing
computes the *reverse* bridge (`legacyMaterialIdForItem(materialItemId)` → `materialId`) anywhere
in this file.

Because `work_orders.material_id` is nullable (not NOT NULL, unlike `product_id`), this doesn't
block saves, so it went unnoticed. It has no observed effect on the current codebase — I grepped
`lib/inventory.ts` and the rest of `lib/*.ts` and found no code currently reading
`workOrder.materialId` back — but it means the column is permanently orphaned for every work
order created or edited from this point forward, undermining the PR's own compatibility
guarantee (any as-yet-unmigrated code path, a report, or a future rollback that expects
`work_orders.material_id` to be populated for MANUFACTURE work orders will see `NULL` for every
row from this PR onward).

**File:** `coolify/apps/nextjs-web/src/app/(dashboard)/production/work-orders/actions.ts`
(create path ~line 653-668; the same gap exists in the update/copy paths further down).

**Suggested fix:** compute `materialId: materialItemId != null ? await
legacyMaterialIdForItem(materialItemId) : null` alongside `productItemId` and include it in the
`workOrder.create`/`update` `data` objects.

---

### Observation (LOW, not scored as a bug) — 出荷書 (在庫保管) requires a "注文請書" even for stock-only shipments with no order line

While trying to build a delivery order with 2 lines sharing one lot to test the charge
copy-once-per-work-order behavior, I selected 種別 = 在庫保管 (which the form itself describes
as "在庫保管（予備製作分）は請求フロー外です — 出荷しても注文明細の出荷状態は変わりません") and
used the "明細を追加（注文明細なし）" button to add 2 lines with `product=超硬エンドミル 4枚刃
φ6×60` / `lot=9006` directly (no order line). Submitting failed validation on `customerBpId`
with the message `注文請書を選択してください` — but 在庫保管 mode's own "明細を追加（注文明細
なし）" path never surfaces any way to choose a customer or order acceptance. Root cause:
`components/shipping/delivery-orders/DeliveryOrderForm.tsx:107-111` requires
`customerBpId.min(1, ...)` unconditionally, independent of `type`. This looks pre-existing
(unrelated to items/#896, since `customerBpId` there is a form-only field used for per-customer
grouping in the 発送 flow, not a persisted `delivery_orders` column per `_specs/tables.md`) and
outside my assigned PRs' scope, so I'm reporting it as an observation rather than a bug I own —
it did, however, block me from completing a live end-to-end test of PR #883's DO-charge
copy/lock behavior (I verified that logic by reading the source instead — see §1 rows 27-28).

## 3. Things I could not fully test, and why

- **PD16 設計図 (design file) new-version creation via file upload** — SeaweedFS is not running
  in this environment (`docker ps` shows no seaweedfs container), so any file upload
  (`/api/attachments/upload`-style routes) fails with `400 Bad Request` /
  「ストレージへの保存に失敗しました」. This is an environment limitation stated in the brief
  (services not running), not a code bug. I verified the write path is item-aware by reading
  `lib/design-files.ts` (`createVersionInTx` takes an `itemId: number` param and calls
  `legacyProductIdForItem(input.itemId)` for the bridge — consistent with the pattern used
  everywhere else that worked).
- **PR #883 §"copy-once-per-work-order" and "edit locked once DO confirmed"** — could not drive
  end-to-end through the UI because the 在庫保管 delivery-order path (the only one available to me
  without colliding with the sales/shipping agents' in-progress order-line data) requires a
  `customerBpId`/注文請書 that its own "no order line" UI path never lets you set (see Observation
  above). Verified both behaviors by reading `app/(dashboard)/shipping/delivery-orders/actions.ts`
  directly (`copyWorkOrderCharges()` dedupes by `lotNumber` before copying; the charge-update
  action checks `order.status !== "DRAFT"`).
- **PDF generation** — Gotenberg not running (expected per brief); not attempted.
- **AI extraction (PU02/PU03 AI panel)** — po-extract not running (expected per brief); skipped
  per instructions, used the manual form instead.

## 4. UI/UX observations worth a human look

- **No explicit error on negative charge amount** — typing a negative number into a VARIABLE
  charge's 単価 field is silently clamped to `0` by the Mantine `NumberInput`'s `min` prop; there
  is no toast/inline message telling the user their `-100` became `0`. Functionally correct
  (matches "negative amounts cannot be entered"), but a user who mistypes a minus sign gets no
  feedback that their number was altered. Minor, not a data-integrity issue since the server also
  independently rejects negative amounts (`lib/charge-core.ts`).
- **Auto-suggested material has a ~1-2s async round trip with no loading indicator** on the
  work-order builder's 使用素材 field: right after picking a product, the field looks empty for a
  noticeable interval before the suggested material (based on 想定材種) populates itself. Purely
  a timing/UX nit (I hit it in automation as a race — a human would just perceive a brief blank
  field), not a data bug: the underlying `materialItemId` state is only set once the suggestion
  resolves, so nothing is silently wrong, but a small skeleton/loader on that field would remove
  the ambiguity.
- **Cross-agent numbering collision (informational, not a bug in my PRs):** my freshly-created
  work order got lot number `9006` (via the real `WORK_ORDER` numbering sequence), yet a
  pre-existing `delivery_order_items` row already had `lot_number = 9006` (`year_month='202609',
  seq=10`, `status=SHIPPED`), causing my brand-new DRAFT work order's "次の書類へ" panel to show
  an unrelated 出荷書 as if it were linked (`app/(dashboard)/production/work-orders/data.ts:636-644`,
  which joins by `lotNumber = r.workOrderNumber`, exactly as designed). This is almost certainly
  another concurrent test agent's fixture data that happened to use the number `9006` directly
  rather than via the real sequence, since `numbering_sequences.last_sequence` for `WORK_ORDER`
  was still `9006` (i.e., mine) at the time I checked — flagging in case another agent's report
  references a "phantom" shipment on an unrelated lot.

## 5. Data created this session (for other agents' awareness)

- Purchase: `PRQ-202609-00001` (approved), `PO-202609-00001` (COMPLETED/入荷完了), 1 material
  receipt for it, `item_inventory` +1 unit item 24 @ plant 1.
- Production: `dbv標準準備工程` (PREP route, v1), `dbv標準製造工程` (MANUFACTURING route on
  product 9001, went through create→v2→rename→**delete**, so it no longer exists at time of
  writing — recreated implicitly by WOR-202609-00002's auto-save), work orders `WOR-202609-00001`
  (DRAFT, lot 9005) and `WOR-202609-00002` (COMPLETED, lot 9006, 5 units of product 9001 posted to
  `item_inventory`).
- Design/master: `DSG-202609-00001` (design request, product 9001), inspection template `9103`
  (`DBV-INS-01`).
- Charge items: `DBV_PACKING` (FIXED ¥500, now disabled), `DBV_SHIPPING` (VARIABLE, default
  ¥1,000). Both attached to WOR-202609-00002 as `work_order_charges` (¥500 + ¥800 = ¥1,300 total).
- No 締日処理 (billing closing) was run, per instructions.
