# System-area verification report — PRs #889, #890, #891 (dev batch, HEAD 40ed2c1e)

Area: **system** (RBAC / master_editor role, accounting export TKC FX4, launcher/category cross-cutting checks).

## Environment note (not a code bug, but affects reproducibility)

Partway through this run the shared throwaway DB container `ckk-shots-db` (port 55432) and the `next start`
process both disappeared (`docker ps -a` showed nothing) and localhost:3100 started 500ing with
`Can't reach database server at 127.0.0.1:55432`. This was **not caused by me** — I never ran a stop/rm/restart
command. The environment came back a few minutes later as a **new** container `ckk-shots-db-dbv` on port
**55442** with a fresh seed, and a new `next start`. I coordinated with `main` throughout; all results below are
against `ckk-shots-db-dbv` (55442), post-outage. Anything I had touched before the outage (only read-only SQL) was
redone from scratch after.

## Headline bug found (and fixed collaboratively, not by me editing the DB myself)

**All 23 `dev_*` seed accounts in `shared-db/sql/dev-role-users-seed.sql` had a `password_hash` that does not verify
against the documented password `dev2026`.** I recomputed the app's own `verifyPassword` (`coolify/apps/nextjs-web/src/lib/password.ts`,
scrypt N=16384/r=8/p=1/keylen=64) against the stored salt:hash for `dev_master_editor` (shared byte-for-byte with
`dev_viewer`, `dev_priv_operator`, `dev_kiosk_op`, `dev_user_op`, `dev_auditor`) and it does **not** match `"dev2026"`.
Two real login failures were burned confirming this (`app.login_attempts`, reason=`BAD_PASSWORD`, `dev_master_editor`,
16:27:57 and 16:28:48 UTC) before I stopped to avoid tripping the shared 5-failures/15min IP lockout. `main`
independently recomputed scrypt for all 23 accounts and confirmed **none** of them verify against `dev2026` (only
`demo1`–`demo5` do), then fixed the throwaway DB rows and `shared-db/sql/dev-role-users-seed.sql` for the batch. This
is a **real seed-data bug that predates PR #889** (the broken hash constant `086b96cb6c3b4230a552e81c8ab17249:8cd4a2aa38dd…`
already existed for `dev_viewer` etc. before #889; #889's commit `fa3b6f98` just copy-pasted the same already-broken
constant to add `dev_master_editor`). After the fix, `dev_master_editor`/`dev2026` logs in correctly and I was able to
do the full UI-driven RBAC test below.

---

## 1. Checks table

| # | Check | Expected (PR) | Observed | Result | Evidence |
|---|---|---|---|---|---|
| 1.1 | SQL: `app.user_permission_summary` for `dev_master_editor` | `permission_codes={master}`, `is_superuser=f` | Exactly `{master}`, `is_superuser=f`, `roles={master_editor}`, `grants={master:CREATE@ALL,master:DELETE@ALL,master:READ@ALL,master:UPDATE@ALL}` | PASS | `select * from app.user_permission_summary where username='dev_master_editor'` |
| 1.2 | SQL: `role_permission_relation` for role `master_editor` | READ/CREATE/UPDATE/DELETE@ALL on `master`, **no EXPORT** | Exactly those 4 rows, no EXPORT row | PASS | `select action,permission_code,scope from app.role_permission_relation rp join app.roles r on r.id=rp.role_id where r.rolename='master_editor'` |
| 1.3 | Login `dev_master_editor`/`dev2026` → Home | Only マスタ apps + null-permission apps visible | After fix: Home shows 一般 (未処理一覧 CM01, フォーム CM02), マスタ (**14** apps: MS01,04,05,06,07,08,09,0A,0B,0C,0D,0E,0F,0G — all `master`), ドキュメント (マニュアル DC01), システム (ファイル管理 SY06, 特権アクセス SY0G). No 販売/購買/生産/在庫/出荷/請求 categories. | PASS | `/tmp/dbv-system/01-home.png` |
| 1.4 | MS0A `/master/defect-types` — Create | dev_master_editor can create | Created `DBV{suffix}` via `新規作成` → `/master/defect-types/new`, saved, appeared in list (6→7 rows) | PASS | `/tmp/dbv-system/40-42*.png` |
| 1.5 | MS0A — Update | dev_master_editor can edit | Row menu → 編集 modal, renamed to `…編集済`, list reflects it | PASS | `/tmp/dbv-system/43-45*.png` |
| 1.6 | MS0A — Delete | dev_master_editor can delete | Row menu → 削除 → confirm modal → row gone (8→7 rows) | PASS | `/tmp/dbv-system/46-47*.png` |
| 1.7 | Direct nav `/sales/quotes`, `/billing/invoices`, `/settings/users`, `/inventory` as `dev_master_editor` | Refused | All 4 return HTTP 200 with an **in-page** "このページを表示する権限がありません" panel (not a redirect, not a true 403 status) — this matches the codebase's `requireAppRead` convention seen elsewhere, not a bug | PASS (behavior consistent with app convention) | `/tmp/dbv-system/50-forbidden-*.png` |
| 2.1 | SY0J `/settings/accounting` renders (view mode) | — | 200, view panel with 会計連携 heading | PASS | `/tmp/dbv-system/10-sy0j-view.png` |
| 2.2 | SY0J edit: encoding utf8-bom→shift_jis, 4 account codes, save, reload | Persists | Reload shows `shift_jis`, `1301/4101/2201/T10` all present | PASS | `/tmp/dbv-system/13-14*.png` |
| 2.3 | MS0F `/master/tax-categories` shows 科目コード fields, saves (digits) | Yes | 3 fields present (消費税コード/売上高/仮受消費税), saved `4111/2211/10` for TAXABLE, confirmed in DB | PASS | `/tmp/dbv-system/90-91*.png`, SQL below |
| 2.4 | MS01 customer edit shows 売掛金 科目コード + 補助科目コード, saves | Yes | Fields present; real edit URL is `/master/business-partners/<uuid>` (in-place `EditablePanel`, no separate `/edit` route); saved `1301/0001`, confirmed in DB | PASS | `/tmp/dbv-system/94-95*.png`, SQL below |
| 2.5 | `GET /api/export/accounting?invoice=INV-202606-00001` | Shift_JIS bytes, header row = configured columns, Σ借方=税込合計, 0-yen rows absent, `accounting_exported_at` stamped | `200`, `content-type: text/csv; charset=Shift_JIS`, `content-disposition: …INV-202606-00001_accounting.csv`. Decoded (iconv-lite): header row `伝票日付,借方科目コード,…,証憑番号`; 2 data rows: 161000 (sales, net) + 16100 (tax) = **177100 = total_amount** (Σ借方 = 税込合計 ✓); both rows non-zero (0-yen guard not directly exercised — no 0-yen invoice in seed, but verified by source read: `buildJournalRows` guards `if (base !== 0)` / `if (lineTax !== 0)`). `accounting_exported_at` set (confirmed by the immediate 409 on re-export). Sales/tax account codes correctly reflect the SY0J settings saved in 2.2 (1301/4101/2201/T10) | PASS | `/tmp/dbv-system/export1.csv.bin` (decoded below) |
| 2.6 | Re-export same invoice without `force=1` | 409 | `409`, body: `Invoice INV-202606-00001 was already exported at …; add force=1 to export again` | PASS | script output |
| 2.7 | `GET /api/export/yayoi?...` | Redirect to `/api/export/accounting` | `308` → `Location: /api/export/accounting?invoice=INV-202606-00001` | PASS | script output |
| 2.8 | Remove account code from a tax category used by an invoice → export 409 | 409 ambiguous-codes rejection | **Not exercised** — the only seeded invoice (`INV-202606-00001`) predates the tax-category migration (`app.invoice_tax_summaries` is empty for it), so `codeConflict` can never become true for it regardless of MS0F edits (confirmed empty table, and read the exact derivation in `src/app/(dashboard)/billing/invoices/data.ts:154-186`). Building a second invoice with real `invoice_tax_summaries` rows through the full sales→shipping→billing flow was out of scope for the time available. Source review of `conflictingTaxRates()`/`codeConflict` logic looks correct. | NOT TESTED (env/data limitation) | see §3 |
| 3.1 | Home category order (demo1) | 一般,販売,購買,生産,**在庫**,出荷,請求,マスタ,ドキュメント,システム | Exact match, 在庫 between 生産 and 出荷 | PASS | script output |
| 3.2 | Jump `ST02` | → `/inventory/stock` | ✓ | PASS | |
| 3.3 | Jump `MS0G` | → `/master/charge-items` | ✓ | PASS | |
| 3.4 | Jump `SY0J` | → `/settings/accounting` | ✓ | PASS | |
| 3.5 | Jump `BL11` | → `/billing/invoices/new` (design.md lists BL11 as a real code) | ✓, page exists (source has `billing/invoices/new/`) | PASS | |
| 3.6 | Jump `PD04`/`PD07`/`PD08` | Retired (欠番 per #891) | All 3 stayed on `/` (unrecognized) | PASS | |
| 3.7 | Jump `SY0I` | → `/settings/api-clients` | ✓ | PASS | |
| 4.x | Settings/general/manual page sweep (22 URLs) as demo1 | 200 + heading, no console/page errors | All 22 returned 200 with a non-empty heading; `pageErrors={}`, `consoleErrors={}` across the whole sweep | PASS | `/tmp/dbv-system/results-settings-sweep.json` |
| 4.y | Manual pages: 税区分 (`masters/tax-category`), 会計連携 (`system/accounting`) in ja/en/zh | 200 + heading | All 6 (2 pages × 3 langs) returned 200 with correctly localized `<h1>` (e.g. "税区分 — 操作マニュアル" / "Tax categories — user guide" / "税种 — 操作手册") | PASS | script output |
| 4.z | Manual pages: 在庫 (`inventory/product-inventory`, `inventory/material-inventory`) in ja/en/zh | 200 + heading | Headings correct in all 3 langs, **but** see Bug #1 below — these 6 pages trigger an infinite client-side request loop | PASS (content) / **BUG** (loop) | see Bugs |
| 4.w | Manual page for 料金マスタ (MS0G) | — | **404** in all 3 languages (`operations/masters/charge-item/user` does not exist) | GAP (not a regression from my 3 PRs — MS0G has simply never had a manual page written) | script output |
| 4.v | Manual content for 顧客品番 | — | No standalone manual page/slug exists for "顧客品番" (it's a panel inside the 製品 MS04 detail page, `CustomerProductCodesPanel.tsx`); `operations/masters/product/user` itself returns 200 in all 3 langs but I did not verify it specifically documents 顧客品番 | NOT FULLY VERIFIED | — |
| 4.u | `/settings/users/<demo1 id>` | 200 + heading | My row-click did not navigate (stayed on `/settings/users`, `heading="ユーザー管理"`) — likely a script timing/selector issue on my end (DataTable click needs a different wait), not confirmed as a real bug; ran low on time to re-verify | INCONCLUSIVE | script output |
| 5.1 | Language switch demo1 → English, load `/`, `/inventory/stock`, `/billing/invoices`, `/settings/accounting`, `/master/charge-items` | No `MISSING_MESSAGE` | 0 hits across all 5 pages, save toast correctly shown as "Saved" | PASS | `/tmp/dbv-system/80-lang-en-prefs.png` |
| 5.2 | Same, → 中文 | No `MISSING_MESSAGE` | 0 hits across all 5 pages, toast "已保存" | PASS | `/tmp/dbv-system/81-lang-zh-prefs.png` |
| 5.3 | Switch back to 日本語 | No `MISSING_MESSAGE`, locale restored | 0 hits, restored to 日本語, toast "保存しました" | PASS | `/tmp/dbv-system/82-lang-ja-prefs.png` |

---

## 2. Bugs (ranked by severity)

### Bug 1 (HIGH) — 在庫 manual pages trigger an infinite client-side request loop

**Repro**: log in as any user, navigate to `http://localhost:3100/manual/ja/operations/inventory/product-inventory/user`
(or the `material-inventory` sibling, or the `en`/`zh` variants) and just leave the page open. `page.goto(..., { waitUntil:
"networkidle" })` **times out after 30s every single time** on these two pages (and only these two, out of every other
manual page I hit). I captured the network log for 8 seconds after DOM-content-loaded and saw it firing continuously:

```
GET /manual/ja/operations/production/material-inventory/user?_rsc=…
GET /manual/ja/operations/inventory/material-inventory/user?_rsc=…
GET /manual/ja/operations/production/material-inventory/user?_rsc=…
GET /manual/ja/operations/inventory/material-inventory/user?_rsc=…
... (repeats indefinitely, one pair roughly every ~150-400ms)
```

**Root cause**: `content/manual/operations/inventory/product-inventory/user.md` and
`content/manual/operations/inventory/material-inventory/user.md` (and their `.en.md`/`.zh.md` siblings — **all 6
files**) still cross-link each other using the **pre-#891** path `/manual/<lang>/operations/production/{product,material}-inventory/user`
instead of the current `/manual/<lang>/operations/inventory/{product,material}-inventory/user`:

```
content/manual/operations/inventory/product-inventory/user.md:22:
  → [在庫管理（素材・仕掛品）](/manual/ja/operations/production/material-inventory/user)
content/manual/operations/inventory/material-inventory/user.md:6,19,87:
  [在庫管理](/manual/ja/operations/production/product-inventory/user)
```

`next.config.ts` has a 308 redirect for exactly this old path
(`/manual/:lang(ja|en|zh)/operations/production/:app(product-inventory|material-inventory)/:path*` →
`/manual/:lang/operations/inventory/:app/:path*`), so the link itself still "works" if a human clicks it — but because
fumadocs/Next's `<Link>` **prefetches visible links automatically**, the moment the product-inventory page renders,
it prefetches the stale material-inventory link, gets redirected, and the destination page **also** contains a stale
link back to product-inventory, which gets prefetched too — and unlike a normal one-shot prefetch, this repeats
continuously rather than settling. Net effect: simply *viewing* either of these two manual pages keeps the browser
(and the server) doing RSC fetches forever, burning bandwidth/CPU and preventing the page from ever reaching
network-idle. This is very likely why PR #891's own verification didn't catch it — it only checked build success,
route counts, and `field-help.ts`/`manual-permissions.ts` anchors (which are registered, machine-checked links), not
prose links inside the markdown body.

**Bonus finding in the same 6 files**: all of them still say "操作コード `PD04`" — but PD04 is explicitly retired
(欠番) per `_specs/design.md` and PR #891 (the current code is `ST01`/`ST02`/etc., and per `lib/app-list.ts` these two
concepts are actually unified into **one** app, 在庫管理 ST01, not two separate PD04-coded apps as the prose still
describes). This staleness predates #891 (it was already `PD04` before the directory move) but is directly in the
area #891 touched and is exactly the kind of thing a category/path rename should have prompted someone to notice.

**Suggested fix**: update the 6 markdown files' cross-links to the new `operations/inventory/...` paths, and correct
the stale `PD04` references. Given the loop is caused by *prefetch* of a redirecting link (not just a dead link), the
underlying Next/fumadocs prefetch-retry behavior might also be worth a second look — a plain redirect shouldn't be
retried indefinitely at ~150-400ms intervals.

**Likely files**: `coolify/apps/nextjs-web/content/manual/operations/inventory/product-inventory/user.md`,
`user.en.md`, `user.zh.md`, `.../material-inventory/user.md`, `user.en.md`, `user.zh.md`.

### Bug 2 (MEDIUM) — 科目コード / 補助科目コード validation is inconsistent between SY0J and MS0F/MS01, and rejects realistic values

The same `accountCodePattern = /^[0-9]{0,8}$/` (half-width digits only, ≤8 chars) is used for:
- MS0F 税区分's 消費税コード / 売上高 科目コード / 仮受消費税 科目コード
  (`coolify/apps/nextjs-web/src/app/(dashboard)/master/tax-categories/actions.ts:59,81,85,89`)
- MS01 取引先's 売掛金 科目コード / 補助科目コード
  (`coolify/apps/nextjs-web/src/app/(dashboard)/master/_shared/bp-schema.ts:124-134`)

but SY0J 会計連携's own "既定の科目コード" and "税率別の消費税コード" fields for the **exact same concepts**
(`receivableAccountCode`, `salesAccountCode`, `taxAccountCode`, `taxCode`, `debitTaxCode`, `creditTaxCode`) use
`z.string().max(16)` with **no character restriction** (`coolify/apps/nextjs-web/src/lib/accounting-export-core.ts:198-210`).

**Repro**:
1. `/settings/accounting` → 編集 → set 消費税コード = `T10` → 保存 → reload → persists fine (SY0J accepts it).
2. `/master/tax-categories` → ⋮ on 課税 → 税区分を編集 → set 消費税コード = `T10` (a plausible TKC-style tax code)
   → 保存 → a toast **"エラー / 半角数字・8桁まで（空欄可）"** appears, and the *entire* form submission is rejected
   — including the other two fields (売上高/仮受消費税) I had also filled in the same submission, which are NOT
   persisted either (verified via `select … from app.tax_categories` — all three columns stayed empty after this
   failed attempt).
3. Same story on MS01: `/master/business-partners` → 東京セラミック → 編集 → 補助科目コード = `0001` works, but a
   realistic alphanumeric sub-account code (e.g. `C-0001`, which is literally the format the app itself uses
   elsewhere for `customerCode` in `AccountingExportForm.tsx`'s own preview sample) is silently rejected the same
   way.

Since TKC FX4's real receiving layout is explicitly "not yet known" (per PR #890's own body: "FX4 の受入レイアウト表が
まだ手元に無い"), restricting these fields to digits-only now is a real risk: if the eventual layout uses
alphanumeric codes (very common for 消費税コード in Japanese accounting software, e.g. `T10`/`T08`), MS0F/MS01 will be
unable to express them even though SY0J's own defaults can. Recommend loosening `accountCodePattern` to match SY0J's
`z.string().max(16)` (or a permissive alphanumeric pattern), or documenting explicitly why the master-level codes are
digit-only while the settings-level ones are free-form.

**Files**: `coolify/apps/nextjs-web/src/app/(dashboard)/master/tax-categories/actions.ts:58-89`,
`coolify/apps/nextjs-web/src/app/(dashboard)/master/_shared/bp-schema.ts:119-134`.

### Bug 3 (LOW) — malformed business-partner URL crashes with 500 instead of 404

**Repro**: navigate directly to `http://localhost:3100/master/business-partners/BP-01001/edit` (using the
human-readable BP code shown everywhere in the UI, e.g. the page title reads "取引先 編集 — BP-01001", plus a
nonexistent `/edit` suffix — the real edit surface is in-place at `/master/business-partners/<uuid>`, no separate
route). Result: React error `#441` client-side and a server-side crash:
```
⨯ Error [PrismaClientKnownRequestError]:
Invalid `prisma.businessPartner.findUnique()` invocation:
Invalid input value: invalid input syntax for type uuid: "BP-01001"
```
This is **not reachable through normal UI navigation** (I confirmed the real edit flow uses the UUID and works
correctly — see check 2.4), so it's not a regression from #889/#890/#891, just a general robustness gap: an
unresolvable/malformed dynamic-route id should 404, not crash with an unhandled Prisma error. Low priority, noted for
completeness since I hit it while constructing the MS01 test.

**File**: `coolify/apps/nextjs-web/src/app/(dashboard)/master/business-partners/[id]/page.tsx` (or wherever its data
loader calls `prisma.businessPartner.findUnique({ where: { id } })` without validating `id` is a UUID first).

---

## 3. Things I could not fully test

- **Ambiguous-account-code 409 path (accounting §2.8)**: the only seeded invoice predates `invoice_tax_summaries`
  (table is empty for it), so `codeConflict` can never trigger for it. Verified the logic by reading
  `resolveTaxBuckets`/`codeConflict` derivation in `src/app/(dashboard)/billing/invoices/data.ts:154-186` and
  `conflictingTaxRates()` in `src/lib/accounting-export-core.ts:621-627` — looks correct, but not exercised live.
  Building a full order→work-order→shipment→invoice flow with real tax-category-linked line items was out of scope
  for the time available.
- **PDF generation / Gotenberg**: not running locally (environment, not a bug) — saw plenty of
  `[pdf/*] Error: Gotenberg 500` in the shared server log from other agents' tests, unrelated to my area.
- **`/settings/users/<demo1 id>` detail page**: my automated row-click did not navigate away from the list — I ran
  out of time to determine whether this is a script/selector issue (most likely, since every other DataTable-row-click
  in my other scripts worked fine) or a real bug. Flagging as inconclusive rather than a bug.
- **顧客品番 (customer product codes) manual content**: confirmed there is no standalone manual page for this concept
  (it lives as a panel inside 製品 MS04's detail page); `operations/masters/product/user` returns 200 in all 3
  languages but I did not specifically verify it documents the 顧客品番 panel.
- **料金マスタ (MS0G) manual page**: confirmed missing (404) in all 3 languages — a documentation gap, not something
  introduced by my 3 assigned PRs (MS0G predates this batch per `app-list.ts`, though #890 does touch adjacent
  accounting docs).

## 4. UI/UX observations

- No `undefined`/`NaN`/`Invalid Date`/`MISSING_MESSAGE` text was found anywhere I looked (settings sweep, manual
  pages, language switch).
- The SY0J → MS0F → MS01 account-code triad is a nice design (defaults cascade down), but see Bug 2 — the validation
  mismatch undermines that story for anyone actually trying to configure it with realistic codes.
- The exported accounting CSV correctly reflects whichever settings were live at export time (verified: after
  changing SY0J's account codes and encoding, the very next export used the new values byte-for-byte) — this matches
  the PR's `settingsRevision` audit-trail design intent.
- The MS0A 不良種類 create/edit/delete flow (used for the RBAC CRUD proof) was clean and fast, no rough edges.
- Minor: the header's operation-code jump box (`aria-label="操作コードで画面へ移動"`) and a plain-text "コード"
  form-field label can collide under naive substring-based label queries — purely a test-authoring note, not an app
  bug (Playwright's `getByLabel` also matches `aria-label` on non-form elements, which tripped me up twice while
  writing selectors).

## 5. Test data left behind (throwaway DB, `ckk-shots-db-dbv`)

- `app.system_settings` `accounting.*`: encoding=`shift_jis`, receivableAccountCode=`1301`, salesAccountCode=`4101`,
  taxAccountCode=`2201`, taxCode=`T10` (previously all empty/utf8-bom defaults).
- `app.tax_categories` (`TAXABLE`): salesAccountCode=`4111`, taxAccountCode=`2211`, taxCode=`10`.
- `app.bp_customer_attrs` for BP `189faec4-3385-56c8-8922-1f5e0519ddfc` ((有)東京セラミック): receivableAccountCode=`1301`,
  receivableSubAccountCode=`0001`.
- `app.invoices` `INV-202606-00001`: `accounting_exported_at` stamped (twice, from the two successful exports before
  I hit the intentional 409-without-force test).
- `app.defect_types`: net zero — created and fully deleted my `DBV*` test rows (confirmed via SQL, none remain).

None of these should conflict with other agents' areas (accounting settings/tax-categories/one specific BP's
accounting fields are system/accounting-area concerns).
