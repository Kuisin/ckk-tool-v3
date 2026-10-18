# Billing area verification report — PRs #895, #884 (+ #890 rename check)

Branch under test: `dev` @ `40ed2c1e` (merge of PR #897), production build on `:3100`.

## Environment note (read first)

Mid-session the throwaway DB (`ckk-shots-db`) was destroyed and rebuilt by another
session as `ckk-shots-db-dbv` (port 55442); the app at `:3100` was repointed there.
**All SQL and UI actions below were done against `ckk-shots-db-dbv` only**, after the
switch. Work done before the switch was against the old container and is not
reflected below except where noted; everything material was redone from scratch
after the swap (customer 支払日/請求先, charge items PACK01/SHIP01, the fabricated
shipments, the approval flows, demo1's group-3 membership). No writes were made to
`ckk-shots-db`.

A second, unrelated interference: **`demo1` is a shared login across parallel test
agents.** Partway through, one script observed the UI rendered in English (another
session had changed demo1's `/profile/preferences` display language mid-test); it
reverted to Japanese on its own shortly after and `app.users.locale` for demo1 reads
`ja` now. Not a product bug — just a hazard of sharing one admin account across
agents. Selectors in later scripts were made bilingual-tolerant to route around it.

Fixtures created for this run (all under the seeded demo customer `d0000000-…-0001`,
"デモ商事株式会社", or otherwise clearly marked as throwaway):
- `bp_customer_attrs.billing_bp_id` set to `189faec4-…` ((有)東京セラミック) via the
  MS01 edit UI.
- Two charge items via MS0G UI: `PACK01` 梱包費 (FIXED, ¥500, 課税), `SHIP01` 送料
  (VARIABLE, 課税).
- Three fabricated `SHIPPED`/`DISPATCH` delivery orders + items (Aug/Sep 2026,
  `202608-1`, `202609-10`) with `unit_price` set directly on the item so no
  order-line/work-order chain was needed — inserted by SQL since building a real
  order→work-order→shipment chain was out of scope for this area.
- One artificial no-shipment `PENDING` closing (`ee000000-…-0099`, customer
  株式会社ギコウ, closing_date 2026-01-31) to exercise the bulk-failure path.
- `approval_flow_steps` rows for `invoices` and `invoice_payments` (1 step each,
  group 3 "第一承認グループ（デモ）", mode ANY) — group 3 had no members before this
  run; `demo1` was added to it directly via SQL (`approval_group_members`) since the
  MS01/MS0B screens don't expose "add member" fast enough for this pass, and the
  sales agent reported doing the same additive thing for groups 1/2. This flow
  configuration is new state on the shared DB — future agents testing "no flow"
  behaviour for `invoices`/`invoice_payments` will now see a flow instead.

## Checks

| # | Check | Expected (PR) | Observed | Result | Evidence |
|---|---|---|---|---|---|
| 1 | `/billing/closings` 実行 modal | #895: 年月選択→日付選択, 既定=今日 | Modal text: "指定日 2026/09/20"（今日）; date picker present | PASS | `/tmp/dbv-billing/08-run-closing-modal-open.png`, script `03-run-closing-modal.ts` console: `modal text: … 指定日2026/09/20…` |
| 1b | Run for default date, verify creation | Aggregates unbilled shipments up to date; past-due ones get a DRAFT invoice too | Toast "締日処理を実行しました / 作成1件 / 更新0件 / 請求書を1件生成しました". New `billing_closings` row `743f489c-…` (customer demo, closing_date 2026-08-31, PROCESSED) + `INV-202609-00002` created from the fabricated Aug shipment | PASS | `/tmp/dbv-billing/09-run-closing-result.png`; SQL: `billing_closings` row + `invoices` row (below) |
| 1c | Σtaxable_base = subtotal, Σtax_amount = tax_amount | Invariant | `INV-202609-00001`: subtotal 96600 = Σtaxable 96600, tax 9660 = Σtax 9660. `INV-202609-00002`: 20000/20000, 2000/2000. `INV-202609-00003`: 15000/15000, 1500/1500 | PASS | SQL in transcript (3 invoices checked) |
| 1d | 支払期日 rule (`lib/billing-terms-core.ts`) for 締日+支払日 combo (30日/末日) | 2026-07-31 closing → 2026-08-31; 2026-08-31 closing → 2026-09-30 (Sept has no 31st, clamped) | Closing detail showed exactly 2026/08/31 with note "締日 + 30 日以降の最初の 末日 払い" before processing; the Aug-31 closing's invoice got due_date 2026-09-30 (correctly clamped) | PASS | `/tmp/dbv-billing/03-closing-detail-before.png`; SQL `invoices.due_date` |
| 2 | Bulk "まとめて請求書を生成" excludes unprocessable rows, lists failures with company+reason | #884 | Selected 3 rows: PENDING+past-due (succeeded → `INV-202609-00001`), EXPORTED (silently excluded, toast said "…締日前の1件は対象外"), PENDING+no-shipments (sent to server, failed with "株式会社ギコウ: 請求対象の出荷がありません") | PASS | `/tmp/dbv-billing/06-closing-bulk-result.png` |
| 3 | Closing detail shows 支払期日／支払条件／請求先; customer master 支払日+請求先 flow through | #884 | MS01 edit: 請求先 select set to (有)東京セラミック, saved and displayed on BP-90001 detail. Every invoice generated afterward (`-1`, `-2`, `-3`, and the runClosing-generated one) has `customer_bp_id` = the billing party's uuid, not the ordering customer's | PASS | `/tmp/dbv-billing/01-bp-saved.png`; SQL `invoices.customer_bp_id = 189faec4-…` on all 3 |
| 4 | Manual invoice BL11 amounts match what a closing would produce | #895 | `INV-202609-00003` (5×¥3000 shipment): subtotal 15000, tax 1500, total 16500 — matches `lib/invoice-generation.ts` `buildInvoiceDraft` behaviour byte-for-byte (same function is shared, confirmed by reading the source) | PASS | SQL above; source read of `invoice-generation.ts` |
| 4b | `invoice:CREATE` grant / who can open BL11 | PR flags this as "undecided" | RBAC seed **does** grant `invoice:CREATE` to `staff`, `accounting`, `accounting_manager` (plus `admin` via ADMIN). `dev_sales` (role `sales`) gets a denial message on `/billing/invoices/new`; `dev_accounting` sees the "手動請求" button and the page works | INFO (not a bug, but contradicts the PR's stated uncertainty) | SQL role_permission_relation dump; `/tmp/dbv-billing/10-bl11-dev-sales.png`, `/tmp/dbv-billing/11-bl11-list-dev-accounting.png` |
| 5 | ChargesPanel: FIXED/VARIABLE creation in MS0G, add to DRAFT invoice, edit-only-on-DRAFT, reset approval on change | #883 / #895 | Created PACK01 (FIXED ¥500) and SHIP01 (VARIABLE). Added PACK01 to `INV-202609-00001` (totals recomputed 96600+500=97100, tax 9710, total 106810) and SHIP01 (¥1500) to `INV-202609-00002` (totals recomputed accordingly). Panel description text literally states "発行前に承認が要ります。直せるのは下書きのうちだけです." | PASS | `/tmp/dbv-billing/21-charges-saved.png`, `/tmp/dbv-billing/30-charge2-saved.png` |
| 5b | 発行 with **no** approval flow → passes through | #895 "段が無ければ素通し" | Server-side: confirmed via list bulk 発行 (`issueInvoices`), which issued `INV-202609-00001` straight to ISSUED with `approvalStatus` staying NONE. **But the single-invoice detail page could not do this** — see Bug #1 | PARTIAL PASS (server) / **FAIL (detail-page UI)** | See Bug #1 |
| 5c | 発行 with a configured flow → PENDING, approver from the group can approve, then issuable | #895 | Added 1-step flow (group 3) for `invoices`. Bulk 発行 on `INV-202609-00002` created a PENDING `invoices` approval request; detail page showed the green ActionCard "あなたの承認依頼中です…"; demo1 (group member) approved; **only after approval did the 発行 button appear on the detail page**, and issuing then worked normally | PASS (end-to-end), but see Bug #1 for the same client-gate defect | `/tmp/dbv-billing/37-invoice-pending-approval.png`, `/tmp/dbv-billing/41-issued-after-approval.png` |
| 6 | List bulk 発行／入金依頼／承認・差し戻し, independent processing | #884/#895 | Bulk 発行 (§5b) worked. Bulk 入金依頼 on a SENT invoice with an `invoice_payments` flow configured created a PENDING payment-approval (toast "1件の入金処理を行いました", list showed 承認依頼中 badge). Bulk 承認 (from the **list**, not detail) resolved the pending request and the invoice went straight to PAID (toast "1件承認しました") | PASS | `/tmp/dbv-billing/50-list-bulk-payment-requested.png`, `/tmp/dbv-billing/52-list-bulk-approve-result.png` |
| 6b | Payment with no flow → immediate PAID | §9 "未設定 = 即・入金済み" | `INV-202609-00002`: marked SENT then PAID via detail-page menu (no `invoice_payments` flow existed yet at that point) → went straight to PAID, `approvalStatus` stayed at its prior value (already APPROVED from the issue-approval) | PASS | SQL: `202609|2|PAID|APPROVED` |
| 7 | `accounting_exported_at` exists, `yayoi_exported_at` gone (#890) | Column rename | `\d app.invoices` shows `accounting_exported_at`; no `yayoi_exported_at` column at all. Detail page field "会計連携日時" reads it correctly ("未エクスポート" when null) | PASS | `\d app.invoices` output in transcript |
| 8 | No "undefined"/"NaN"/"Invalid Date"/`MISSING_MESSAGE` | — | Swept 10 URLs (invoice list/detail ×4, closings list/detail ×4, charge-items list) — all clean | PASS | script `14-final-sweep.ts` output |
| 9 | Mobile (375px) layout | — | Invoice list, invoice detail, closings list all render as card/stacked layouts with no obvious overflow; line-item tables scroll horizontally inside their own container (by design, `Table.ScrollContainer`) | PASS | `/tmp/dbv-billing/mobile-*.png` |
| 10 | Console/server errors during mutations | — | Only `502`/`Gotenberg 500` on every 発行/PDF-adjacent action — Gotenberg isn't running locally, this is the stated environment limitation, not a bug. No React/Prisma errors traced to any billing action | PASS | grep of `/tmp/dbv-web-server.log` for invoice/closing/charge — zero hits besides Gotenberg |

## Bugs

### Bug #1 (High) — Invoice detail page hides the 発行 button whenever the invoice has a manual charge and hasn't been approved yet, even when no approval flow is configured

**Where:** `coolify/apps/nextjs-web/src/components/billing/invoices/model.ts`,
`canIssue()`:

```ts
export function canIssue(
  inv: Pick<Invoice, "status" | "items" | "approvalStatus">,
): boolean {
  if (inv.status !== "DRAFT") return false;
  if (!hasManualCharge(inv.items)) return true;
  return inv.approvalStatus === "APPROVED";
}
```

`InvoiceDetail.tsx` only puts a "発行" entry into `ResourceActions`' `menuItems` when
`canIssue(invoice)` is true, and `ResourceActions` renders **no** overflow-menu
button at all when `menuItems` is empty. So whenever an invoice has ≥1 manual
charge and `approvalStatus !== "APPROVED"` — which is the state of **every** such
invoice the instant a charge is added, before any approval request has ever been
created — the entire "…" actions menu disappears from the detail page. There is no
button anywhere on `/billing/invoices/[id]` to trigger issuance or to create the
approval request the PR describes ("承認依頼ボタンは無く、発行を押した時点でサーバー
が自動で作る" — but the button that's supposed to do that is invisible).

The server-side logic (`guardIssueApproval` in `lib/invoice-generation.ts`'s
neighbour `app/(dashboard)/billing/invoices/actions.ts`) is correct and does
implement "no flow configured → issue immediately" / "flow configured → create a
PENDING request" — I verified both server-side behaviours are right. The **only**
way to reach that server code from the UI is the invoice **list's** bulk 発行
button, whose filter (`ready = targets.filter((inv) => inv.status === "DRAFT")`)
does not consult `canIssue`/`hasManualCharge`/`approvalStatus` at all.

**Impact:** a user who opens a single invoice with a manual charge to issue it
(the natural place to do it) sees no way to do so — not even a disabled button
with an explanation, the button is simply absent. They must know to go back to the
list, select the invoice, and use the bulk action instead. This defeats the stated
design ("押した時点でサーバーが自動で作る") for the single-document flow, which is
presumably the primary UI for a one-off invoice.

**Repro (exact steps, verified twice on two different invoices):**
1. Log in as `demo1` / `demo2026`.
2. Open any DRAFT invoice with no charges yet, e.g. `/billing/invoices/INV-202609-00001`.
3. 編集 → 追加料金 パネルで料金項目を1つ追加 (e.g. 梱包費) → 保存.
4. Reload the page. The header's "…" actions button (aria-label 操作メニュー) is
   gone entirely — inspect the DOM: zero `button[aria-label="操作メニュー"]` /
   `button:has-text("Actions")` elements. No 発行, no PDF-download-from-menu, no
   会計連携CSV entry either (they're bundled in the same `menuItems` array, so
   they vanish together even though they have nothing to do with the charge gate).
5. Compare: select the same invoice's checkbox on `/billing/invoices` and click
   the list's "発行" bulk action — it succeeds immediately (no flow configured) or
   creates a PENDING approval (flow configured), proving the server never objected
   in the first place.

**DB evidence:**
```
-- before: has a manual charge, no flow yet
select year_month,seq,status,approval_status from app.invoices where year_month='202609' and seq=1;
 202609 | 1 | DRAFT | NONE
-- after bulk-issuing from the list (detail page had no button to do this):
 202609 | 1 | ISSUED | NONE
```

**Suggested fix direction:** `canIssue()` needs a third input — whether an
approval flow is even configured for `invoices` — or the menu-item visibility
needs to stop being gated by `canIssue()` and instead always show "発行" while
`status === "DRAFT"`, letting the server (which already has the correct logic)
decide and return an error toast if it truly can't proceed. The list's bulk
action already takes the latter, more permissive approach and it works correctly;
the detail page should match it.

---

### Bug #2 (Medium) — Manual invoice (BL11) computes its billing-period end date and closing date in UTC instead of JST, producing a wrong calendar day during the ~9h/day window when they differ

**Where:** `coolify/apps/nextjs-web/src/lib/invoice-generation.ts`,
`generateManualInvoice()`, lines ~450-456:

```ts
const closingDate = new Date(
  Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  ),
);
```

This truncates "now" to a calendar day using **UTC** date parts. Everywhere else
in this exact file (and the codebase generally — see `isoDateJst()` in
`components/sales/price-lists/model.ts`, whose own doc-comment explains precisely
this failure mode: "コンテナの TZ は UTC なので toISOString() だと JST 0:00〜8:59 が
前日扱いになり…") the JST calendar day is used for business-date boundaries.
`generateManualInvoice` even imports and uses `isoDateJst` a few lines later for
`billingBasisDate` — just not for its own `closingDate`.

**Effect:** during the roughly 9-hour window each day where the UTC calendar date
is behind the JST calendar date (00:00–09:00 JST, i.e. 15:00–24:00 UTC of the
previous day), a manual invoice created "today" gets `billing_period_to` and the
`MANUAL` `billing_closings.closing_date` stamped as **yesterday** (JST), not today.
This is exactly the class of off-by-one-day bug the rest of the codebase is
deliberately careful to avoid for this reason.

**Repro:** run the test at any wall-clock time between 00:00 and 09:00 JST
(15:00–24:00 UTC previous day).
1. As `demo1`, go to `/billing/invoices/new`, pick a customer with an unbilled
   shipment, select it, "この内容で請求書を作成".
2. Observe the created invoice's 請求期間 end date and the underlying
   `billing_closings.closing_date`.

**Evidence (this run, wall clock 2026-09-20 01:49 JST = 2026-09-19 16:49 UTC):**
```
select year_month, seq, billing_period_from, billing_period_to from app.invoices
where year_month='202609' and seq=3;
 202609 | 3 | 2026-09-01 | 2026-09-19    -- should be 2026-09-20 ("today" in JST)

select closing_date, kind from app.billing_closings where kind='MANUAL';
 2026-09-19 | MANUAL                      -- same, should be 2026-09-20
```
The mobile-list screenshot (`/tmp/dbv-billing/mobile-_billing_closings.png`) shows
this in the actual UI: "デモ商事株式会社 締日: 2026/09/19・手動" for an invoice
created on what was, in JST, already the 20th.

**Note:** in this instance the wrong date happened not to cross a payment-day
boundary, so `due_date` came out correct by coincidence; a customer with
`payment_day` set near a month boundary could get a wrong due date too, on top of
the wrong `billing_period_to`.

**Suggested fix:** build `closingDate` from `isoDateJst(new Date())` (parsed back
to a `Date` at UTC midnight of that JST calendar day), the same way the rest of
the file derives JST-based dates, instead of `Date.UTC(new Date().getUTC*())`.

---

### Minor / non-bug observations

- **BL11's mobile CTA label.** `InvoiceTable.tsx` shows "手動請求" on desktop but
  collapses to plain "新規" on mobile (`isMobile ? tr("common.new") : …`). Since
  regular invoices can't actually be created directly (only via 締日処理 or this
  manual flow), "新規" alone is a little misleading about what pressing it does —
  though this exact desktop-verbose/mobile-terse abbreviation pattern is used
  elsewhere in the app, so it's consistent, not a one-off mistake. Low priority.
- The PR body for #895 states `invoice:CREATE`'s role assignment is "undecided",
  but the merged RBAC seed already grants it to `staff`/`accounting`/
  `accounting_manager`. Worth a note to whoever tracks the PR's "known issues" so
  it isn't left stale, but functionally nothing is broken — the grant is sane.

## Things not tested / out of scope

- **PDF generation and the accounting-export CSV download** — Gotenberg isn't
  running locally (per brief); every 発行/PDF/CSV action logged `Gotenberg 500` or
  a `502` from the PDF route. This is the stated environment limitation, not
  something I can evaluate here. The accounting CSV content itself (#890's
  concern, column names, Shift_JIS encoding) belongs to the accounting-screen
  agent per the assignment; I only confirmed the DB column rename
  (`accounting_exported_at` exists, `yayoi_exported_at` doesn't).
- **差し戻し (reject)** was not separately exercised end-to-end (I approved every
  pending request rather than rejecting one) — time budget. I did read
  `rejectInvoiceIssue`/`rejectInvoicePayment`/`rejectInvoiceApproval` and
  `rejectInvoices` (bulk) in `actions.ts`; they mirror the approve path 1:1
  (same `checkApprovalDocAccess` gate, same `actOnCurrentStep`/`resolveApprover`
  membership check, reason required and trimmed) so I have moderate confidence
  they work, but this is code review, not an observed run.
- **A genuinely fresh SCHEDULED closing built from a real order→work-order→
  shipment chain** — I fabricated shipments directly via SQL (`unit_price` set on
  the delivery-order item, `order_line_id` left null) rather than building a full
  sales/production/shipping chain, since that belongs to other agents' areas and
  would have consumed a lot of budget for a scenario `invoice-generation.ts`
  already handles identically via `billableUnitPrice()`'s null-fallback path. The
  real (non-fabricated) July/June shipments in the seed did get billed and their
  numbers/dates/tax math all checked out, so the core function is exercised on
  real data too, not only fabricated rows.
- I did not attempt `pnpm build`/`pnpm test`/lint — out of scope for hands-on UI
  verification, and the PRs already report these green.

## Files referenced

- `coolify/apps/nextjs-web/src/lib/invoice-generation.ts` (Bug #2, and the shared
  `buildInvoiceDraft`/`generateInvoiceForClosing`/`generateManualInvoice`)
- `coolify/apps/nextjs-web/src/lib/billing-terms-core.ts` (due-date/billing-party rule)
- `coolify/apps/nextjs-web/src/app/(dashboard)/billing/closings/actions.ts` (`runClosing`, `processClosing`, `processClosings`)
- `coolify/apps/nextjs-web/src/app/(dashboard)/billing/closings/data.ts` (`fetchClosing`, `fetchBillableShipmentsForClosing`)
- `coolify/apps/nextjs-web/src/components/billing/closings/ClosingTable.tsx` / `ClosingDetail.tsx`
- `coolify/apps/nextjs-web/src/app/(dashboard)/billing/invoices/actions.ts` (issue/sent/paid + approval + bulk)
- `coolify/apps/nextjs-web/src/app/(dashboard)/billing/invoices/charge-actions.ts` (`saveInvoiceCharges`)
- `coolify/apps/nextjs-web/src/app/(dashboard)/billing/invoices/new/actions.ts` + `new/data.ts` (BL11)
- `coolify/apps/nextjs-web/src/components/billing/invoices/model.ts` (Bug #1: `canIssue`)
- `coolify/apps/nextjs-web/src/components/billing/invoices/InvoiceDetail.tsx`, `InvoiceTable.tsx`, `ManualInvoiceForm.tsx`, `InvoiceApprovalCard.tsx`
- `coolify/apps/nextjs-web/src/lib/charge-core.ts`, `src/lib/charges.ts`, `src/lib/charge-items.ts`
- `coolify/apps/nextjs-web/src/components/master/charge-items/*`
- `coolify/apps/nextjs-web/src/lib/approvals.ts` (`assertFlowConfigured`, `actOnCurrentStep`, `resolveApprover`)
- `coolify/apps/nextjs-web/src/lib/approval-targets.ts` (`invoices`/`invoice_payments` registry)
