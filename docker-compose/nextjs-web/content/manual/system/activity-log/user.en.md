---
title: "Activity Log — User Manual"
description: "Operation code SY07. An administrator app for browsing the system-wide activity log (audit log) — who changed which data, when, and how."
screenshots: [settings-activity-01, settings-activity-detail-01]
---
Operation code **SY07**. An administrator app for browsing the system-wide activity log (audit log) across all records — who changed which data, when, and how.

## What you can do with this app

- Review create / update / delete history across every app and record.
- Search by record, user, or change content, and filter by operation type and target.
- On a log entry's detail page, inspect the before/after data (JSON) and jump straight to the changed record's screen.
- The data source is the same as each document's "History" tab — this app is the cross-record view.

This app requires the **system permission**. The log is **read-only**; nothing can be edited or deleted here.

## How to open

- Home (System) → **Activity Log**, or type `SY07` in the search box.

## What gets recorded

Every time business data is saved, an entry is recorded automatically with before/after snapshots. Operation types:

- **Create** … a new record.
- **Update** … a change to an existing record (changed fields are summarized as diffs).
- **Delete** … a record deletion.
- **Seed** / **Migration** … initial data loads and migrations performed by the system.

View-only actions such as browsing, logging in, or downloading PDFs are not recorded (only data changes are).

## Reading the list

- **Date/time** … when the operation happened. Newest first by default.
- **Operation** … create / update / delete, etc.
- **Target** … the kind of data changed, e.g. Quote, Trial Estimate, Price List, Plant, App Management.
- **Record** … the business identifier (document numbers `QOT-…` / `EST-…`, master IDs, etc.; monospaced).
- **User** … the display name of the user who made the change; system processes show as "System".
- **Changes** … a summary of the change. For updates, per-field diffs are shown, e.g. "Status: DRAFT → CONFIRMED".

The list shows the latest **300** entries. The search box matches record, user name, and change content; the **Operation** and **Target** selects narrow the list; **Reset** clears everything. Click a row to open the detail page.

![Activity Log list](../../assets/screenshots/settings-activity-01.png)

## Entry detail

Clicking a row opens that single entry ("Activity Log #number").

- **Summary** … date/time / operation / target / record / user / related page. The user name links to the user's page in [User Management](/manual/en/system/user-management/user).
- **Jump to the related page** … when the changed record's screen can be resolved, an "Open 〈app〉" button appears in the top right, taking you to the record's detail page (or the app's list filtered to it).
- **Changes (summary)** … the same diff summary as the list.
- **Before / After** … the raw recorded snapshots (JSON), showing exactly which fields changed and how ("none" for before on creates, and for after on deletes).

![Activity Log detail with related-page link and before/after JSON](../../assets/screenshots/settings-activity-detail-01.png)

## FAQ

- **I only want one document's history** … Open that document's detail page and check its "History" tab — that is faster. In this app, search by the document number.
- **Older entries are missing** … This screen shows the latest 300 entries. For older investigations, contact your system administrator.
- **There are no login or PDF export records** … Those are out of scope (only data creates / updates / deletes are recorded).
- **What is the "App Management" target?** … Records of app visibility ON/OFF toggles made in [App Management](/manual/en/system/app-management/user).
