# Inventory area verification — PRs #888, #891, #892, #893

Branch under test: `dev` @ `40ed2c1e` (merge of #897), production build at `http://localhost:3100`.

**Environment note:** partway through this run the shared throwaway DB was destroyed and recreated
as `ckk-shots-db-dbv` (port 55442) by another session. All SQL below is against
`ckk-shots-db-dbv`; I never touched `ckk-shots-db` (55432). Any records I created before the
rebuild were lost and were redone after (the ST06 postings, ST05 stock-take, and MS04/MS06 edits
below were all created/redone against the rebuilt DB).

## 1. Checks

| # | Check | Expected (PR) | Observed | Result | Evidence |
|---|---|---|---|---|---|
| 1 | `GET /production/inventory` (no follow) | 308/permanent redirect → `/inventory` (#891) | `308` → `/inventory` | PASS | curl via `page.request.get(maxRedirects:0)` |
| 2 | `GET /production/inventory/products/dc050000-...0001` | redirect → `/inventory/products/<id>` | `308` → `/inventory/products/dc050000-0000-4000-8000-000000000001` | PASS | same |
| 3 | `GET /production/inventory/materials/dc051000-...0002?tab=transactions` | redirect preserves query | `308` → `/inventory/materials/dc051000-...0002?tab=transactions` | PASS | same |
| 4 | `GET /production/stock-takes` | redirect → `/inventory/stock-takes` | `308` → `/inventory/stock-takes` | PASS | same |
| 5 | Full navigation through all 4 redirects | final page renders, no `undefined`/`NaN`/`MISSING_MESSAGE` | all rendered correctly, product/material detail + list content shown | PASS | `/tmp/dbv-inventory/redirect-*.png` |
| 6 | Home dashboard | 在庫 category (cyan) with ST01–ST06/ST09; PD04/PD07/PD08 gone from 生産 | 在庫 section shows 在庫管理(ST01) 在庫一覧(ST02) 在庫・所要量(ST03) 手動入出庫(ST06) 移動タイプ(ST09) 入出庫伝票(ST04) 棚卸(ST05); 生産 section only has 指示書(PD02)/設計図(PD06)/未処理指示書(PD05) | PASS | `/tmp/dbv-inventory/home.png` |
| 7 | App launcher popover | same as above | ST01/02/03/04/05/06/09 all present; PD04/PD07/PD08 absent | PASS | `/tmp/dbv-inventory/launcher.png` |
| 8 | ST01 `/inventory` (+ tabs) | 製品/素材/仕掛品/ロケーション tabs, working list | list renders with 拠点/保管場所/在庫数/利用可能/区分 columns, product & material rows | PASS | via redirect nav snippet |
| 9 | ST02 `/inventory/stock` | 場所視点の在庫一覧, server-side filter | renders "8 行 / 6 品目 / 1 拠点", filters (品目名・コード / 拠点 / 保管場所 / 品目種別), 在庫ゼロを隠す toggle | PASS | `st02-stock.png` |
| 10 | ST03 `/inventory/requirements` — pick item+plant | timeline of past actuals + future supply/demand; first negative-balance day highlighted (#893) | selecting item=110 (B04A0001-B040-310, stock 20/reserved 100) + plant=1 showed a banner "在庫不足の見込み" and the "いま" row (balance −80) rendered with `background: var(--mantine-color-red-0)` — the only highlighted row | PASS | `st03-negative-balance.png`, raw row `style` dump in test 04 output |
| 11 | ST03 requires **both** item and plant before showing results | per `requirements/page.tsx` `hasSelection` gate | selecting only item (no plant) left the "品目と拠点を選ぶと…" placeholder — correct per source, but worth flagging as a UX trap (see §4) | PASS (by design) | test 02b output |
| 12 | ST04 `/inventory/movements` | list + read-only detail, no create UI | list showed "入出庫伝票がありません" before any manual movement existed (correct — no seed movements); after posting via ST06, list showed `MOV-202609-00001` etc. with 伝票番号/日時/事由/拠点/明細数; detail page rendered header + line table (区分/種類/項目名/ロット番号/保管場所・棚/数量/備考) | PASS | `st04-list-after.png`, `st04-detail-after.png` |
| 13 | ST05 `/inventory/stock-takes` + `/new` | pick 拠点(+保管場所) → snapshot buckets; 0/N counted; 0 approval steps ⇒ immediate CONFIRMED + ADJUST movement on submit | Created `STK-202609-00001` for F01 (12 buckets snapshotted); filled 実測数 for all 12, one deliberately short by 1 (製品棚B/B-2: book 1 → counted 0); saved (差異 1 件, 不足 −1); clicked "承認依頼" (no MS0B flow steps exist for `stock_takes`) → status jumped straight to 確定, `movement_id` populated, 手続き状況 showed 承認/確定 both stamped same instant | PASS | `st05-after-create.png`, `st05-submitted.png`; DB below |
| 14 | ST06 `/inventory/goods-movement` receipt (101, IN) to specific 保管場所/棚 | quantity lands in the exact bucket, not "未割当" (#893 bug fix) | posted 7 本 of 超硬エンドミル to F01/第一倉庫(DC-A)/A-1 → new `item_inventory` row `plant_id=1, storage_location_id=9101, shelf_id=9111` (a *new* lot-less bucket, correctly distinct from the existing lot-9004 bucket at the same place) | PASS | see DB evidence §2 |
| 15 | ST06 transfer (311, TRANSFER) between two named locations, incl. cross-check via captured Server Action payload | OUT from the chosen from-location, IN to the chosen to-location, correct plant/location/shelf on both sides | payload captured over the wire: `{"movementTypeId":3,"itemId":1,"quantity":1,...,"from":{"plantId":1,"storageLocationId":9101,"shelfId":9111},"to":{"plantId":1,"storageLocationId":2,"shelfId":5}}`; resulting `item_inventory` row matched exactly (`plant_id=1, storage_location_id=2, shelf_id=5`) | PASS | test 12 output + DB below |
| 16 | ST06 issue (201, OUT) | OUT posting from the chosen location | posted 2 本 OUT from F01/第一倉庫/A-1; bucket quantity decremented correctly | PASS | DB below |
| 17 | ST09 `/inventory/movement-types` | default types 101/201/311/551 present; no delete button | table shows 101 入庫/201 出庫/311 保管場所間移動/551 廃棄, all 有効; `button[aria-label*="削除"]` count = 0; source confirms "削除は無い" by design | PASS | `st09-movement-types.png` |
| 18 | #888 invariant: every new `inventory_transactions` row has `movement_id` | non-null for all rows written after this PR | before any of my actions: 9/9 legacy rows had `movement_id IS NULL` (pre-#888 seed data, expected). After my 4 ST06 postings + 1 ST05 confirm (7 new transaction rows across 5 movements incl. one MATERIAL_RECEIPT movement created by a different concurrent agent), **all 7 new rows have non-null `movement_id`**; the null count stayed at exactly 9 | PASS | see DB evidence §2 |
| 19 | #892 mirror: edit product name (MS04) | `app.items` row follows via trigger, `products.item_id` non-null | Edited product `PRD-202607-0001` (id 9001, item_id 1) name → "超硬エンドミル 4枚刃 φ6×60（改）"; `app.items.name->>'ja'` updated to match immediately | PASS | `ms04-edit-after.png`; DB below |
| 20 | #892 mirror: edit material name (MS06) | same for materials | Edited material `B04A0001-B040-310` (id 107, item_id 110) name → "K40UF 研磨 φ4.0×310（改）"; `app.items.name->>'ja'` updated to match | PASS | `ms06-edit-after.png`; DB below |
| 21 | #892: `products.item_id` / `materials.item_id` populated for all rows | `count(*) where item_id is null` = 0 for both tables | both counts = 0 | PASS | DB below |
| 22 | #892: product items keep `requires_*` separate from material items' own dimensions | product item's `requires_material_type_id/requires_diameter_mm/requires_length_mm` set, `material_type_id/diameter_mm/length_mm` null; material item is the reverse | item id=1 (product): `requires_material_type_id=1, requires_diameter_mm=6.000, requires_length_mm=60.000`, `material_type_id/diameter_mm/length_mm` all null. item id=110 (material): `requires_*` all null, `material_type_id=4, diameter_mm=4.000, length_mm=310.000` | PASS | DB below |
| 23 | 375px viewport, no horizontal overflow | ST02/ST03/ST06 (brief) + ST01/ST04/ST05/ST09 (extra) | `document.documentElement.scrollWidth === clientWidth === 375` on all 7 pages checked (`/inventory`, `/inventory/stock`, `/inventory/requirements`, `/inventory/goods-movement`, `/inventory/movement-types`, `/inventory/movements`, `/inventory/stock-takes`) | PASS | test 02b/17 output, `mobile-*.png` |
| 24 | No `undefined`/`NaN`/`Invalid Date`/`MISSING_MESSAGE` anywhere visited | — | none found on any page scraped (redirect targets, ST01–ST06, ST09, MS04/MS06 edit+detail) | PASS | all test outputs |
| 25 | Console/page errors during the whole session | none expected | zero `pageerror`/console-error events fired across all 15 scripts | PASS | test outputs |

## 2. DB evidence (against `ckk-shots-db-dbv`)

```
-- movements created during this session
year_month | seq | cause        | movement_type_id | plant_id
202609     | 1   | MANUAL       | 1 (101 IN)        | 1        -- ST06 receipt, 7 本 → F01/第一倉庫/A-1 (no lot)
202609     | 2   | MATERIAL_RECEIPT | (null)        | (null)   -- NOT mine, created by a concurrent agent/session
202609     | 3   | MANUAL       | 3 (311 TRANSFER)  | 1        -- ST06 transfer, 3 本 F01/第一倉庫/A-1 → F01/製品棚B/B-1
202609     | 4   | MANUAL       | 2 (201 OUT)       | 1        -- ST06 issue, 2 本 out of F01/第一倉庫/A-1
202609     | 5   | MANUAL       | 3 (311 TRANSFER)  | 1        -- ST06 transfer (careful re-test), 1 本 → F01/製品棚B/B-2
202609     | 6   | ADJUSTMENT   | (null)            | 1        -- ST05 confirm, source_type=stock_takes, source_id=STK-202609-00001

-- invariant check (#888)
select count(*) from app.inventory_transactions where movement_id is null;
  -> 9  (unchanged before/after — all 9 are pre-existing legacy seed rows)
select count(*) from app.inventory_transactions;
  -> 16 (9 legacy + 7 new, all 7 new rows have non-null movement_id)

-- #893 bucket-placement fix, receipt
select id, item_id, plant_id, storage_location_id, shelf_id, lot_number, quantity
from app.item_inventory where item_id = 1;
  d4b4967c-...  | 1 | 1 | 9101 | 9111 | (null) | 1.000   -- receipt+issue net (7 in, then -3 transfer, -2 issue, -1 transfer)
  2fb28c20-...  | 1 | 1 | 2    | 4    | (null) | 3.000   -- transfer destination (WH2/B-1)
  0d785d91-...  | 1 | 1 | 2    | 5    | (null) | 0.000   -- transfer destination (WH2/B-2), then -1 via stock-take ADJUST

-- #892 mirror sync
select name->>'ja' from app.items where id=1;    -> "超硬エンドミル 4枚刃 φ6×60（改）"
select name->>'ja' from app.items where id=110;  -> "K40UF 研磨 φ4.0×310（改）"
select count(*) from app.products  where item_id is null;  -> 0
select count(*) from app.materials where item_id is null;  -> 0

-- #892 requires_* vs actual dimension separation
items.id=1   (PRODUCT):  requires_material_type_id=1, requires_diameter_mm=6.000, requires_length_mm=60.000,
                          material_type_id=NULL, diameter_mm=NULL, length_mm=NULL
items.id=110 (MATERIAL): requires_material_type_id=NULL, requires_diameter_mm=NULL, requires_length_mm=NULL,
                          material_type_id=4, diameter_mm=4.000, length_mm=310.000

-- ST05 stock-take confirm
stock_takes (202609,1): status=CONFIRMED, approval_status=NONE, movement_id=9a4e71d5-...,
                          confirmed_at=2026-09-19 16:49:28
approval_flow_steps: 0 rows for target_type='stock_takes' → confirms "0 段なら即確定" (pass-through) behaviour
```

## 3. Bugs found

### Bug 1 (Medium) — Stale "生産" breadcrumb on 5 of the moved inventory screens (leftover from #891)

PR #891 moved ST01/ST04/ST05 (and their sub-pages) from 生産 to the new 在庫 category, and the
newer ST02/ST03/ST09 screens correctly use `categoryLabel("在庫", locale)` for their breadcrumb.
But the following components were never updated and still hard-code
`tr("common.production")` (生産) as the first breadcrumb segment:

- `src/components/inventory/UnifiedInventory.tsx:402` — ST01 一覧 (`/inventory`)
- `src/components/inventory/products/ProductInventoryDetail.tsx:44` — ST01 製品詳細
- `src/components/inventory/materials/MaterialInventoryDetail.tsx:40` — ST01 素材詳細
- `src/components/inventory/movements/MovementTable.tsx:89` — ST04 一覧 (`/inventory/movements`)
- `src/components/inventory/movements/MovementDetail.tsx:44` — ST04 詳細
- `src/components/inventory/stock-takes/StockTakeTable.tsx:118` — ST05 一覧 (`/inventory/stock-takes`)
- `src/components/inventory/stock-takes/StockTakeForm.tsx:107` — ST05 新規
- `src/components/inventory/stock-takes/StockTakeDetail.tsx:518` — ST05 詳細

Every one of these pages is reachable directly from the 在庫 launcher/home section, and every one
still shows `ホーム / 生産 / …` in its breadcrumb instead of `ホーム / 在庫 / …`. Reproduction:
open `/inventory`, `/inventory/movements/MOV-202609-00001`, or `/inventory/stock-takes/STK-202609-00001`
and read the breadcrumb row. Evidence: `/tmp/dbv-inventory/st04-detail-after.png` (screenshot shows
`ホーム / 生産 / 入出庫伝票 / 詳細`), same pattern visible in `st05-after-create.png` and the
`nav:/production/inventory` snippet in test 01 (`ホーム / 生産 / 在庫管理`).

Fix: replace `tr("common.production")` with `categoryLabel("在庫", locale)` (as ST02/ST03/ST09
already do) in the 8 spots above.

### Bug 2 (Medium) — `INVENTORY_MOVEMENT_CAUSE_LABEL.MANUAL` missing from all 3 locale dictionaries

`InventoryMovementCause` gained the `MANUAL` value for ST06 (手動入出庫), and
`lib/movement-type-core.ts` correctly sets `MANUAL_CAUSE = "MANUAL"`. But
`messages/{ja,en,zh}.json` → `enum.INVENTORY_MOVEMENT_CAUSE_LABEL` was never given a `MANUAL` key
(it has `WORK_ORDER_COMPLETION`, `DELIVERY_SHIPMENT`, `MATERIAL_RECEIPT`, `STOCK_TRANSFER`,
`STOCK_RESERVATION`, `RESERVATION_RELEASE`, `ADJUSTMENT`, `OTHER` — but not `MANUAL`).
`lib/enum-labels.ts` `resolveLabel()` falls back to the raw enum value when the key is missing, so
**every single manual movement — the entire point of ST06 — displays the untranslated string
"MANUAL"** in both the ST04 list (badge + row) and detail page (title badge + 事由 field), in ja,
en and zh alike.

Reproduction: post any movement via `/inventory/goods-movement`, then open
`/inventory/movements` or the movement's detail page. Evidence:
`/tmp/dbv-inventory/st04-detail-after.png` shows the badge and 事由 both reading "MANUAL" instead
of a translated label like 手動/Manual/手动.

Fix: add a `MANUAL` entry to `enum.INVENTORY_MOVEMENT_CAUSE_LABEL` in all three
`messages/*.json` files (e.g. ja "手動入出庫" / en "Manual entry" / zh "手动录入" — pick per the
i18n glossary rules).

### Non-bug investigated and ruled out

While testing a TRANSFER (311) movement across two different storage locations, an early test run
appeared to show the destination bucket landing at the wrong plant (`plant_id=2` instead of the
selected `plant_id=1`), which looked like a serious regression of the #893 fix. I re-ran the
transfer with the Server Action payload captured over the wire (`page.on("request")` on the
`next-action` POST) to get ground truth, and the payload plus resulting `item_inventory` row were
fully consistent (`plantId:1, storageLocationId:2, shelfId:5` submitted → same values persisted).
Re-examining my first run's raw `psql -Atc` output, the "plant_id=2" reading was **my own
misalignment of pipe-separated columns** across two SELECTs with different column lists, not a
real value — `storage_location_id` (2) was what I mistook for `plant_id`. No code defect here;
noting it for transparency since it cost significant investigation time. Lesson for future
agents: use `psql -x` (expanded/labeled output) rather than `-Atc` when eyeballing multi-column
rows, especially across differently-shaped queries.

## 4. Could not test / not applicable here

- **Approval-gated stock-take path**: no `approval_flow_steps` exist for `stock_takes` in this
  seed, so I could only exercise the "0 段 → 即確定" pass-through path (§1 #13), not the
  multi-step approval flow. Confirmed the pass-through behaviour is correct; the approval-branch
  code path (`actOnCurrentStep`/`startApprovalFlow`) is shared with other document types that
  already have flows configured (work orders, purchase orders), so it is presumably covered
  elsewhere, but I did not independently verify it for `stock_takes` specifically.
- **PDF/Gotenberg-dependent flows**: not applicable to this feature area (inventory apps have no
  PDF output).
- **material_receipts / purchase-order-driven movement causes** (`MATERIAL_RECEIPT`,
  `WORK_ORDER_COMPLETION`, `DELIVERY_SHIPMENT`, `STOCK_RESERVATION`, `RESERVATION_RELEASE`): I did
  not independently drive these flows (they belong to purchasing/production/shipping areas being
  tested by other agents); I only confirmed via DB that a `MATERIAL_RECEIPT` movement created by a
  concurrent session also correctly got a non-null `movement_id` and appeared in the ST04 list,
  which is circumstantial support for #888 but not a targeted test.
- **Semi-finished demand modelling gap** mentioned in PR #893 body ("半製品には需要のモデルが無い")
  is called out by the PR author as a known, accepted limitation, not something to verify — I did
  not attempt to test it further.

## 5. UI/UX observations worth a human look

1. **Bug 1 and Bug 2 above** are the main findings — both are small, mechanical fixes (breadcrumb
   category label swap; one missing i18n key × 3 locales), but Bug 2 in particular means the
   flagship ST06 feature's own audit trail (ST04) never shows a translated cause for its own
   movements — worth prioritizing.
2. ST03 (`/inventory/requirements`) requires **both** 品目 and 拠点 to be selected before showing
   anything; selecting only 品目 silently leaves the placeholder message showing with no
   indication that 拠点 is also required until you notice the second empty field. Not a bug (this
   matches `hasSelection` in `requirements/page.tsx`), but a discoverability gap — consider making
   the placeholder text conditional ("拠点も選んでください") once 品目 is chosen but 拠点 isn't.
3. ST06's own success toast ("保存しました") and the ST05 stock-take's pass-through-confirm toast
   ("承認依頼しました") both use their generic action labels even when the underlying effect
   is an immediate state transition (e.g., stock-take goes straight to 確定 with no actual pending
   approval) — functionally correct (matches the documented "段が無ければ素通し" convention used
   elsewhere), just a slightly surprising toast message for a first-time user expecting "承認依頼中"
   to follow. Not filing as a bug since this mirrors documented, intentional behaviour used by other
   document types.
4. No missing translations (`MISSING_MESSAGE`), no `undefined`/`NaN`/`Invalid Date`, and no
   horizontal overflow at 375px were found anywhere in the 在庫 category.

## 6. Files most relevant to the findings

- `coolify/apps/nextjs-web/src/components/inventory/UnifiedInventory.tsx:402`
- `coolify/apps/nextjs-web/src/components/inventory/products/ProductInventoryDetail.tsx:44`
- `coolify/apps/nextjs-web/src/components/inventory/materials/MaterialInventoryDetail.tsx:40`
- `coolify/apps/nextjs-web/src/components/inventory/movements/MovementTable.tsx:89`
- `coolify/apps/nextjs-web/src/components/inventory/movements/MovementDetail.tsx:44`
- `coolify/apps/nextjs-web/src/components/inventory/stock-takes/StockTakeTable.tsx:118`
- `coolify/apps/nextjs-web/src/components/inventory/stock-takes/StockTakeForm.tsx:107`
- `coolify/apps/nextjs-web/src/components/inventory/stock-takes/StockTakeDetail.tsx:518`
- `coolify/apps/nextjs-web/messages/ja.json`, `en.json`, `zh.json` → `enum.INVENTORY_MOVEMENT_CAUSE_LABEL`
- `coolify/apps/nextjs-web/src/lib/movement-type-core.ts` (`MANUAL_CAUSE`)
- `coolify/apps/nextjs-web/src/lib/enum-labels.ts` (`movementCauseLabel` / `resolveLabel` fallback)
- `coolify/apps/nextjs-web/src/app/(dashboard)/inventory/goods-movement/actions.ts` (verified correct — #893 fix confirmed working)
- `coolify/apps/nextjs-web/src/lib/inventory.ts` (`ensureItemInventory` — verified correct)
- `coolify/apps/nextjs-web/next.config.ts:159-176` (redirects — all verified working)
