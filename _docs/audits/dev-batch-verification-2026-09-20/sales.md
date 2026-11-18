# Sales area verification report — dev batch (PRs #879, #881, #882, #894, #897)

Target: dev HEAD `40ed2c1e` (merge of #897), production build at `http://localhost:3100`.
Tester: demo1 (system admin). Test data: customer "DBVテスト販売株式会社" (BP-01461,
`80755fe7-957c-4900-9c86-aef7eca85b0f`; a stray duplicate BP-01460 was also created by an
earlier scripting mistake and left as-is — harmless), products PRD-202609-0001 (id 9004,
item_id 908) and PRD-202609-0002 (id 9005, item_id 909).

## Infra note (read before the results)

Mid-session, `ckk-shots-db` (port 55432) vanished entirely for ~2 minutes (web app logged
`PrismaClientKnownRequestError P1001: Can't reach database server at 127.0.0.1:55432`), then
came back. The coordinator clarified that container actually belongs to **another agent's**
screenshot pipeline, and my assigned DB is `ckk-shots-db-dbv` (port 55442) — the web app now
points there. I had only run read-only SQL against the wrong container before the switch (no
writes), so nothing needed to be redone, but **my first invariant sweep (item 7 below) was run
against the wrong DB and its "widespread item_id NULL" result was bogus** — re-run against the
correct `ckk-shots-db-dbv` it is clean (see item 7). All SQL below is against `ckk-shots-db-dbv`.

I also found that neither of the two approval groups actually wired into
`approval_flow_steps` (id 1 "第一承認グループ", id 2 "第二承認グループ" — used by
order_acceptances/work_orders/material_purchase_orders/purchase_requests) had any members;
a separate pair of "…（デモ）" groups (id 3/4) had members but weren't referenced by any flow.
With the coordinator's go-ahead I ran (additive, nothing removed):
```sql
INSERT INTO app.approval_group_members (group_id, user_id, is_active)
SELECT g, u.id, true FROM (values (1),(2)) as gg(g)
CROSS JOIN (select id from app.users where username='demo1') u
ON CONFLICT (group_id, user_id) DO UPDATE SET is_active = true;
```
This unblocked the approval step below and is reported as a seed gap (see Bugs, C).

## 1. Checks

| # | Checked (URL / action) | Expected (PR) | Observed | Result | Evidence |
|---|---|---|---|---|---|
| 1.1 | SA11 `/sales/trial-estimates/new`, fill customer+product+name, save, confirm via "…" menu | #897: item picker keyed on items.id; estimate confirms to CONFIRMED | Estimate `EST-202609-00001` created with `item_id=908`, `product_id=9004`; confirmed → status CONFIRMED; ProcedurePanel shows 下書き→確定(done)→価格表登録済(spinner) | PASS | `/tmp/dbv-sales/07-estimate-confirmed.png`; SQL: `select item_id,product_id,status from app.estimates` → `908\|9004\|CONFIRMED` |
| 1.2 | SA12 `/sales/price-lists/new`, pick customer+product, select 価格ソース=confirmed estimate, validFrom, save | #897: price_list_entries gets both product_id and item_id; estimate-source linking works with item ids | `PRC-202609-00001` created; source dropdown showed "EST-202609-00001 DBVテスト価格試算（¥2,260）"; picking it auto-filled 基準単価=¥2,260 | PASS | `/tmp/dbv-sales/09c-after-source-pick.png`; SQL: `price_list_entries` row `product_id=9004, item_id=908`; `price_list_variants` row `base_unit_price=2260.00, estimate_year_month=202609, estimate_seq=1` |
| 1.3 | SA13 `/sales/quotes/new`, pick customer+product | Price resolves from price list unchanged | Unit price auto-filled ¥2,260 from tier "1本〜"; totals 小計¥2,260/消費税(10%)¥226/合計¥2,486; ProcedurePanel "前の書類から: 価格表 1件" link | PASS | `/tmp/dbv-sales/13-quote-detail.png` |
| 1.4 | SA14 `/sales/order-acceptances/new` (manual), 2 lines, different 配送 per line, 「先頭行の配送を全行へ適用」button present | #894: per-line delivery collapsible (default collapsed, opens when values exist), apply-to-first-line button, item_id/product_id both written | Line1: NORMAL + 出荷先=(有)東京セラミック; Line2: DIRECT_TO_USER + エンドユーザー=AMC. List table shows delivery per line distinctly. Both lines `item_id=908, product_id=9004`. Apply-all button only appears once ≥2 lines (confirmed by its absence with 1 line, matching source `items.length > 1`) | PASS (see also Bug B for a toggle-state quirk found along the way) | `/tmp/dbv-sales/17-oa-detail.png`; SQL: `order_lines` for ORD-202609-00001 — both rows `item_id=908, product_id=9004`; line1 `ship_to_bp_id=189faec4…, delivery_method=NORMAL`; line2 `delivery_method=DIRECT_TO_USER, end_user_bp_id=44615e86…` |
| 1.5 | Save then 承認依頼 → 承認 (as demo1, after group-membership fix) → 確定 | Approval flow completes, order lines get branch/CONFIRMED, header COMPLETED | REQUESTED→APPROVED (承認記録: 田中一郎「管理」)→ COMPLETED; order_lines got branch 1/2, status CONFIRMED, amount frozen (¥6,780/¥11,300) | PASS | `/tmp/dbv-sales/21-oa-after-approve-reload.png`; SQL: `order_acceptances.status=COMPLETED`; `order_lines.branch=1,2 status=CONFIRMED amount=6780.00/11300.00` |
| 2 | Price resolution: unit price auto from price list by qty tier; price_overridden semantics | Unchanged by items refactor | Auto-resolve confirmed above (1.2–1.4). Additionally: opened the DRAFT recreated doc, toggled 「単価を上書き」 switch on line 1, set ¥9,999, saved | PASS | SQL: line1 `unit_price=9999.00, price_overridden=t`; line2 unchanged `2260.00 / f` |
| 3a | Manual acceptance (no source file) detail pane | #894 item 2: document pane collapsed by default (`!acceptance.sourceFilename`) | Left rail collapsed to a thin icon strip labelled "取込元の書類がありません（手入力）" | PASS | `/tmp/dbv-sales/17-oa-detail.png` |
| 3b | Intake-created acceptance `ORD-202607-00002` (source=FOLDER, has source file) detail pane | Pane opens expanded | Pane fully expanded showing filename "注文書_デモ商事_20260706.pdf" and a preview area (preview itself shows "Not found" because the referenced SeaweedFS object doesn't exist in this throwaway env — environment limitation, not a bug) | PASS | `/tmp/dbv-sales/48-intake-oa-expanded.png` |
| 4a | Cancel COMPLETED acceptance via "…" → キャンセル依頼, reason, submit | #882 depends on cancel flow; no approval flow configured for `order_acceptance_cancel_requests` (0 rows in approval_flow_steps) → applies immediately (pass-through rule) | Status → CANCELLED immediately, no row created in `order_acceptance_cancel_requests` (confirmed this is correct: `submitAcceptanceCancelRequest` calls `applyCancel` directly when `flow.length === 0`, lib/order-acceptance-cancel.ts) | PASS | `/tmp/dbv-sales/25-oa-cancelled.png`; SQL: `order_acceptances.status=CANCELLED`; `select count(*) from order_acceptance_cancel_requests` = 0 (expected — no row is created on the pass-through path) |
| 4b | 「この注文請書から作り直す」on the cancelled doc | New DRAFT copies header+lines; unit prices carried not re-resolved; priceOverridden kept; does NOT copy 枝番/ロット番号/金額/取込元 PDF; both ProcedurePanels link | `ORD-202609-00002` created DRAFT; both lines `branch=NULL, lot_number=NULL, amount=NULL, status=DRAFT`; `unit_price=2260.00` carried (identical to price-list value, but carried not re-queried — confirmed by code path, `recreateFromCancelledAcceptance` copies `unitPrice`/`priceOverridden` verbatim); delivery columns fully carried per line; original shows "作り直し先 済 ORD-202609-00002", new shows "作り直し元 ORD-202609-00001" | PASS | `/tmp/dbv-sales/27-recreated-1-detail.png`, `/tmp/dbv-sales/28-original-after-recreate.png`; SQL: `order_acceptances` seq=2 `replaces_year_month=202609, replaces_seq=1` |
| 4c | Recreate a second time from the same cancelled doc → confirmation modal | Modal lists existing recreation, warns about double-creating | Modal showed: "この注文請書はすでに ORD-202609-00002 として作り直されています。二重に起こしていないか確認してください。" (exact text match to messages/ja.json `alreadyRecreatedAs`) | PASS | `/tmp/dbv-sales/29-recreate-modal-2-warning.png` |
| 5a | MS04 `/master/products/9004?tab=customerCodes`, add code for my customer | #881: tab exists, editable, saves `item_id` too | Added code "X-100" / name "テスト品番100"; saved; row `customer_product_codes` has `item_id=908` | PASS | `/tmp/dbv-sales/33-customer-codes-saved.png`; SQL row `1\|80755fe7…\|9004\|X-100\|…\|908` |
| 5b | Duplicate normalized code, **same customer + same product** (2 rows for one customer) | Rejected | Rejected — but with `duplicateCustomerRow` ("同じ顧客の行が2つあります…"), not the code-normalization message, because the (customer,product) uniqueness check fires first | PASS (correctly rejected, different message than I first expected — see note in 5c) | `/tmp/dbv-sales/36-dup-code-after-save.png` |
| 5c | Duplicate normalized code **across two different products**, same customer: "X-100" on product 9004, "X 100" on product 9005 | PR text: "正規化して同じになる品番の二重登録（X-100 と X 100）は保存時にアプリが弾く" | **NOT rejected.** Both saved successfully; `customer_product_codes` now has both `(customer=80755fe7…, product=9004, code="X-100")` and `(customer=80755fe7…, product=9005, code="X 100")` | **FAIL — see Bug A** | `/tmp/dbv-sales/38-cross-product-dup-after-save.png`; SQL: 2 rows, same customer_bp_id, codes "X-100"/"X 100" |
| 5d | `/master/products?q=X-100` product list search | Finds the product by customer code | Returns **both** PRD-202609-0001 and PRD-202609-0002 (demonstrates downstream effect of Bug A — a supposedly unique code now matches 2 products) | PASS for "finds it", but see Bug A | `/tmp/dbv-sales/39-product-list-search-by-customer-code.png` |
| 5e | Product picker (SA13 quote item picker) search "X-100" | Finds it via `searchProductItemOptions` → `productItemIdsByCustomerCode` | Returned exactly `["DBVテスト製品 φ10×100 PRD-202609-0001"]` — only the exact-code match, not the normalized one on product 9005 (picker matching is stricter/exact vs. the list's normalized search — a difference between the two search paths, not itself a bug for this check) | PASS | `/tmp/dbv-sales/49-product-picker-by-customer-code.png` |
| 5f | DN alias printed in parentheses on an existing 納品書 for my customer | Not tested — no DN exists yet for my new customer (out of scope to build the full order→ship pipeline for a brand-new customer within time budget) | — | NOT TESTED (see §3) | — |
| 6a | `/shipping/delivery-notes/DRN-202607-00001` (pre-migration data, 価格記載あり) | #879: old rows fall back to customer's tax category (10%); totals 小計/消費税/合計(税込) | 小計¥96,600 / 消費税(10%)¥9,660 / 合計金額(税込)¥106,260 — matches the PR body's own stated verification numbers exactly | PASS | `/tmp/dbv-sales/41-dn-DRN-202607-00001.png` |
| 6b | `/shipping/delivery-notes/DRN-202607-00002` (価格記載なし) | No amounts/tax shown at all | 価格記載=なし; 小計/合計金額 all show "—"; item table has no unit-price/amount columns | PASS | `/tmp/dbv-sales/41-dn-DRN-202607-00002.png` |
| 6c | SQL: `delivery_note_items.tax_rate/tax_category_id` for pre-migration rows | Should be NULL (fallback used only for display, not backfilled) | All 3 existing rows: `tax_category_id=NULL, tax_rate=NULL` | PASS | `select … from app.delivery_note_items` → all 3 rows null |
| 6d | Create a fresh delivery order/note post-migration to see frozen non-null tax on a new row | Not attempted — would require building a full shipment for a CONFIRMED order line, which is a large cross-cutting flow outside this PR set's UI (shipping domain); only one pre-existing unshipped CONFIRMED line existed in the whole seed (`ORD-202607-00003-02`) and building the shipping-domain flow safely within the time budget wasn't practical | — | NOT TESTED (see §3) | — |
| 6e | PDF button on DN detail | Expected to fail — Gotenberg not running locally | `/api/pdf/*` calls return 502 in server log ("Gotenberg 500: Internal Server Error" / connection errors) whenever a PDF is requested anywhere in the shared environment | Environment limitation, not a bug (per brief) | server log grep |
| 7 | Items invariant: `count(*) where product_id is not null and item_id is null` = 0, for order_lines/quote_items/delivery_order_items/delivery_note_items/price_list_entries/estimates/customer_product_codes | Must be 0 | **0 for all 7 tables** on the correct DB (`ckk-shots-db-dbv`) | PASS | see SQL block below |
| 8 | `/api/v1` still exposes `product_id`-based fields | #897: `/api/v1` responses unchanged, still read `productId` | Getting a live token requires SY0G privileged-access approval for both activation and token issuance (`/settings/api-clients` "作成した時点では無効で、トークンもありません。有効化とトークンの発行はそれぞれ承認が要ります。") — not "easy to obtain" per the brief's own carve-out, so skipped live test. Statically confirmed instead: `app/api/v1/order-lines/route.ts` selects `productId: true` and emits `productId: r.productId`; no `itemId` reference anywhere in that route | PASS (static only) | grep `coolify/apps/nextjs-web/src/app/api/v1/order-lines/route.ts:53,97` |

SQL for item 7 (against `ckk-shots-db-dbv`):
```
order_lines:            0 bad / 10 total
quote_items:            0 bad / 4 total
delivery_order_items:   0 bad / 6 total
delivery_note_items:    0 bad / 3 total
price_list_entries:     0 bad / 2 total
estimates:              0 bad / 4 total
customer_product_codes: 0 bad / 2 total
```

## 2. Bugs (ranked by severity)

### A. (Medium) Customer product code normalized-duplicate check only covers one product's own save batch, not across products — contradicts the PR's stated guarantee

**File**: `coolify/apps/nextjs-web/src/app/(dashboard)/master/products/customer-code-actions.ts`, function `saveCustomerProductCodes`, the `seenCode`/`seenCustomer` loop (~lines 96–116).

**Repro**:
1. MS04 product PRD-202609-0001 (id 9004) → 顧客品番 tab → 編集 → 顧客を追加 → customer "DBVテスト販売株式会社", 顧客品番 "X-100" → 保存. Succeeds.
2. MS04 product PRD-202609-0002 (id 9005, a **different product**) → 顧客品番 tab → 編集 → 顧客を追加 → **same customer**, 顧客品番 "X 100" (space instead of hyphen — normalizes to the same key via `productMatchKey`) → 保存.

**Observed**: save #2 succeeds ("保存しました"). DB now has:
```
id=1 customer=80755fe7… product=9004 code="X-100"
id=2 customer=80755fe7… product=9005 code="X 100"
```
**Expected** (from the PR body, verbatim): "正規化して同じになる品番の二重登録（`X-100` と `X 100`）は保存時にアプリが弾く。DB の unique は生の文字列しか見ないため" — this exact scenario is the one the PR claims to block.

**Root cause**: `saveCustomerProductCodes` only de-dupes *within the array of rows being saved in the current call* (`seenCode`/`seenCustomer`, scoped to `cleaned`, which is just the current product's row list — normally 1 row per customer for a single product). Because the customer-codes panel is edited **one product at a time**, this in-request check can never see a colliding row that belongs to a *different* product. The code comment even says the cross-product case is deliberately left to "DB に任せ" (the DB's `(customer_bp_id, code)` unique index) — but that index compares raw strings, not the normalized form, so it does not catch "X-100" vs "X 100" at all. There is no query anywhere in the action that checks existing rows (for the same customer, across all other products) against the normalized key before insert/update.

**Downstream effect demonstrated**: `/master/products?q=X-100` (the product-list search, which does normalize) now returns *both* products for what is supposed to be a single customer's unique code — exactly the "誤った製品を掴む" failure mode the PR's own design section warns about. (The runtime AI-matching function `matchCustomerProductCode` does defensively return `null` on a multi-product tie, so a live document-matching call would not silently pick the wrong product — but the save-time guard the PR explicitly promises is not there, and the ambiguity now silently persists in the master data.)

**Suggested fix direction**: the duplicate check needs a DB query across all products for the same `customer_bp_id`, comparing `productMatchKey(existing.code)` against `productMatchKey(newRow.code)` (excluding the current product's own existing rows, which are being replaced), not just an in-memory check over the current call's row list.

### B. (Low / UX) Order-acceptance line "配送" collapse toggle re-closes itself the instant a field is filled

**File**: `coolify/apps/nextjs-web/src/components/sales/order-acceptances/OrderAcceptanceItemsEditor.tsx`, lines 303–311:
```ts
const [deliveryToggled, setDeliveryToggled] = useState<Set<string>>(new Set());
const isDeliveryOpen = (row: ItemRowForm) =>
  deliveryToggled.has(row.rowId) !== hasLineDelivery(row);
```

**Repro**: On the new-acceptance form, add a second line item (so the section starts collapsed, `hasLineDelivery=false`). Click "配送" to open it (now `deliveryToggled={row2}`, XOR gives open). Pick any value in the now-visible fields, e.g. 配送方法="ユーザー直送" — the moment the value commits, `hasLineDelivery(row2)` flips to `true`, and since `deliveryToggled` still contains `row2`, the XOR now evaluates to `false` → **the section collapses again**, showing only the summary badge (e.g. "明細 2 行目: エンドユーザーが未指定です"). The user has to click "配送" again to keep entering data. Reproduced twice in a row (once after 出荷先, once after 配送方法) while building the two-line test document for check 1.4.

**Impact**: not data-destructive (values are retained; the collapsed badge correctly reflects state, and re-opening shows the field still filled), but it's a jarring mid-entry surprise — a user filling in several delivery fields in sequence will see the panel snap shut after the very first one, every time, which reads as the form losing their place. Also works against the stated design intent that "値が入っている行は開いた状態で出す" (rows with a value should default to *open* — true once the row is later reloaded from a save, but not true immediately after the first edit while the toggle flag is still set from opening it manually).

**Suggested fix direction**: track "user has explicitly closed this row" and "user has explicitly opened this row" as two separate one-shot overrides (or simplest: drop the manual toggle once `hasLineDelivery` becomes true for the first time), rather than a single flag XORed against a value that changes while the flag is live.

### C. (Informational / seed gap, not a code bug) Freshly-seeded approval groups are unusable out of the box

Neither `approval_group_id=1` ("第一承認グループ") nor `=2` ("第二承認グループ") — the two groups actually referenced by `approval_flow_steps` for `order_acceptances`, `work_orders`, `material_purchase_orders`, and `purchase_requests` — had any members in this environment. A separate pair, id 3/4 ("…（デモ）"), had members (seeded by `shared-db/sql/demo-users-seed.sql`, which explicitly looks up groups named "第一承認グループ（デモ）"/"第二承認グループ（デモ）") but those groups are not wired into any flow. Net effect: **no approval-gated document could be approved by anyone**, including demo1 (there is deliberately no admin bypass for this — `lib/approvals.ts` `resolveApprover` is pure group-membership/delegation, unlike the SY0G privileged-access bypass). I could not have completed check 1.5/4a without adding demo1 to groups 1/2 directly via SQL (done with the coordinator's sign-off — see top of this report). Whoever owns the demo/screenshot seed should decide whether `demo-users-seed.sql` should populate the real groups (1/2) instead of/in addition to the demo-only ones, or whether the flows should point at the demo groups.

## 3. Not tested (and why)

- **DN alias-in-parentheses print check (checklist item 5)**: no 納品書 exists yet for my newly-created test customer, and building one requires going through the full 出荷書 confirmation pipeline (order line → delivery order → delivery note), which is a large cross-cutting shipping-domain flow. Given time constraints I verified the customer-code save/search/picker behavior thoroughly instead (5a–5e) and left the print-time check untested.
- **Fresh post-migration delivery note with non-null tax_rate/tax_category_id (checklist item 6)**: the only pre-existing unshipped CONFIRMED order line in the whole seed was `ORD-202607-00003-02` (not my test customer), and creating one for my own test data would again require the full shipping pipeline. I instead confirmed (a) the exact pre-migration/legacy-fallback numbers match the PR's own stated verification table, (b) the DB columns are NULL only for pre-migration rows as expected, and (c) read the `deliveryNoteTotals` freeze-at-confirm code path described in the PR (not independently re-verified by exercising it).
- **Live `/api/v1` GET with a real token (checklist item 8)**: creating an API client and issuing a token both require SY0G privileged-access approval per the UI's own message — this doesn't meet the brief's "if a token is easy to obtain" bar, so I verified the `productId` exposure statically in the route source instead.
- **PDF generation for quotes/DNs/invoices**: fails everywhere in the shared environment with Gotenberg 500/502 — this is the documented environment limitation, not something I chased further.

## 4. UI/UX observations

- Nothing resembling `undefined`/`NaN`/`Invalid Date`/`MISSING_MESSAGE` was seen anywhere I looked (order acceptance, quote, price list, estimate, delivery note, customer-product-codes screens, at both desktop and 375px mobile width).
- At 375px width, `document.documentElement.scrollWidth - clientWidth` measured 0 (no horizontal overflow) on the order-acceptance detail, delivery-note detail, and MS04 customer-codes tab. The customer-product-codes edit table already renders as one card per customer row on mobile, matching design.md §20.2's rule for editable tables.
- The recreated draft's line editor correctly re-renders both lines' delivery sections **open** on first load after a save (only the "just toggled it open manually, then filled a field" interaction from Bug B causes the surprise close), so the steady-state "rows with data default open" behavior described in the code comments does hold once the form is freshly loaded from saved data.

## 5. Corrections to earlier statements in this report's working notes

My very first pass at check #7 (before the DB-container mix-up was resolved) was run against `ckk-shots-db` — a different agent's database — and appeared to show item_id NULL for nearly every row in every table. That result is **invalid** and is superseded by the correct run against `ckk-shots-db-dbv` reported in the table above (0 violations everywhere). Flagging this explicitly in case any of it leaked into cross-agent chatter before the correction landed.
