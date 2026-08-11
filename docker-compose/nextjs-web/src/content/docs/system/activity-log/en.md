# Activity Log — User Manual

Operation code **SY07**. An administrator app that shows the system-wide activity history (audit log) across all apps and records — who changed which data, when, and how.

> This app requires **system permission**. The history is **view only** — nothing can be edited or deleted from this screen.

## What you can do here

- Review create/update/delete history across all apps and all records.
- Search by record, user, or change content; filter by action type and target.
- It uses the same data source as the "History" tab on each document's detail page — this screen is for looking across everything at once.

## Opening it

- Home (System) → **操作履歴 (Activity Log)**, or type `SY07` in the search box.

## What gets recorded

Every time business data is saved, an entry is recorded automatically with before/after snapshots. The action types are:

- **Create** — a new record was created.
- **Update** — an existing record was changed (the changed fields are summarized as a diff).
- **Delete** — a record was deleted.
- **Seed** / **Migration** — initial data loads and migrations performed by the system.

View-only operations such as browsing or downloading PDFs are not recorded (only data changes are).

## Reading the list

- **Date/time** — when the operation happened. Newest first by default.
- **Action** — Create / Update / Delete, etc.
- **Target** — the kind of data changed, e.g. quote (見積書), trial estimate (試算), price list (価格表), product, business partner, app management.
- **Record** — the business identifier (document numbers like `QOT-…` / `EST-…`, master IDs; monospace).
- **User** — the display name of the user who acted. System-driven operations show as "システム (System)".
- **Changes** — a summary of the change. For updates, a per-field diff such as "Status: Draft → Confirmed".

The list shows the latest **300 entries**.

## Search and filters

- The search box matches records (document numbers etc.), user names, and change content.
- The **action** select filters by action type (create/update/delete, …).
- The **target** select filters by data kind (quotes, products, …).
- **Reset** clears every filter.

## FAQ

- **I only want one document's history** — the quickest way is the "History" tab on that document's detail page. On this screen, search by its document number.
- **Older entries are missing** — this screen shows the latest 300 entries. For anything older, ask your system administrator.
- **No login or PDF-download records** — those are out of scope here (only data creates/updates/deletes are recorded).
- **What is the "App Management" target?** — records of app visibility ON/OFF toggles made in [App Management](/docs/system/app-management).
- For users and permissions, see [User Management](/docs/system/user-management).
