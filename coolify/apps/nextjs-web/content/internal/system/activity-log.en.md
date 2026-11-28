---
title: "Activity Log — User Manual"
description: "Operation code SY07. An administrator app that shows the system-wide activity history (audit log) across all apps and…"
---
Operation code **SY07**. An administrator app that shows the system-wide activity history (audit log) across all apps and records — who changed which data, when, and how.

> The entry permission is **`personal_data`** (not `system`). On top of that, the cross-document search (the list) and the details of one record are the privileged operations `personal_data.activity_search` / `personal_data.activity_detail`, available only during a period requested and approved in [Privileged access](/manual/en/operations/system/privileged-access/user) (SY0G). The per-document History tabs are not gated by this approval. The history is **view only** — nothing can be edited or deleted from this screen.

## What you can do here

- Review create/update/delete history across all apps and all records.
- Search by record or user name; filter by period, action type, target, and actor (filtering, sorting and paging happen on the server).
- It uses the same data source as the "History" tab on each document's detail page — this screen is for looking across everything at once.

## Opening it

- Home (System) → **操作履歴 (Activity Log)**, or type `SY07` in the search box.

## What gets recorded

Every time business data is saved, an entry is recorded automatically with before/after snapshots. The action types are:

- **Create** — a new record was created.
- **Update** — an existing record was changed (the changed fields are summarized as a diff).
- **Delete** — a record was deleted.
- **Seed** / **Migration** — initial data loads and migrations performed by the system.

- **View** / **Export** — only some "looking" operations that involve secrets or personal data are recorded individually (revealing a shared-device PIN or settings code, opening a login-record detail, a document viewed in the partner portal = View / exporting form responses, a response PDF, a QR card sheet = Export).

Other view-only operations, such as browsing or downloading a document PDF, are not recorded.

## Reading the list

- **Date/time** — when the operation happened. Newest first by default; the column header toggles ascending/descending (the only column the server can sort on).
- **Action** — Create / Update / Delete, etc.
- **Target** — the kind of data changed, e.g. quote (見積書), trial estimate (価格試算), price list (価格表), product, business partner, app management.
- **Record** — the business identifier (document numbers like `QOT-…` / `EST-…`, master IDs; monospace).
- **User** — the display name of the user who acted. System-driven operations show as "システム (System)". Operations made via a shared tablet (kiosk device) carry a **device-name badge** under the name (operations from the Web carry no badge).
- **Changes** — a summary of the change. For updates, a per-field diff such as "Status: Draft → Confirmed".

The list is paged (10 / 20 / 50 / 100 rows, 20 by default) over the full total. The old "latest 300 entries" limit no longer exists.

## Search and filters

- The search box (「レコード・ユーザーで検索」) matches records (document numbers etc.) and user display names. **Change content is not searched.**
- **Start date** / **End date** narrow the period (calendar days in the display time zone).
- The **action** select filters by action type (create/update/delete, …).
- The **target** select filters by data kind (quotes, products, …).
- The **user** select filters by actor.
- **Reset** clears every filter.

## FAQ

- **I only want one document's history** — the quickest way is the "History" tab on that document's detail page. On this screen, search by its document number.
- **Older entries are missing** — set a period with the start/end dates, or page forward.
- **No login or PDF-download records** — logins are kept in [Login history](/manual/en/operations/system/login-history/user) (SY0D). Document PDF output is not recorded (apart from the View / Export exceptions above).
- **What is the "App Management" target?** — records of app visibility ON/OFF toggles made in [App Management](/admin-manual/en/system/app-management).
- For users and permissions, see [User Management](/admin-manual/en/system/user-management).
