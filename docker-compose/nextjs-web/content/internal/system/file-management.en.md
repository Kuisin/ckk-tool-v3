---
title: "File Management — User Manual"
description: "Operation code SY06. An administrator app for the files stored in file storage (SeaweedFS) — imported uploads and sys…"
---
Operation code **SY06**. An administrator app for the files stored in file storage (SeaweedFS) — imported uploads and system-generated document PDFs. List, view, download, delete, and upload files.

> This app requires **system permission** (storage operations are admin actions). Deletion cannot be undone, so operate with care.

## What you can do here

- Browse every file in storage (file name, storage key, size, modified time).
- Per file: **View** (open in the browser), **DL** (download), and **Delete**.
- **Upload** any file.
- Search by file name/path and filter by folder (top-level category).

## Opening it

- Home (System) → **ファイル管理 (File Management)**, or type `SY06` in the search box.

## Reading the list

- **File name** — with an icon (red for PDF, blue for images, gray otherwise). The storage key (full path in storage) is shown underneath in monospace.
- **Category** — a badge for the key's top-level folder, e.g. `pdfs` (generated document PDFs) or `uploads` (uploads from this screen). Files without a folder show "(root)".
- **Size** — file size (B / KB / MB / GB).
- **Modified** — last modified time. The list sorts newest-first by default (20 files per page).

The **Refresh** button at the top right reloads the list. If storage is unreachable, a red warning appears at the top of the screen (the server-side configuration and containers need checking).

## Uploading

1. Press **Upload** at the top right and pick a file.
2. The file is saved into the `uploads` folder with a timestamp prefix on the file name (to avoid overwriting same-named files).
3. On completion a notification appears and the list refreshes.

## Viewing and downloading

- **View** — opens the file in a new tab (PDFs and images preview directly).
- **DL** — downloads the file.

## Deleting

Pressing **Delete** on a row shows a confirmation dialog. **This cannot be undone.**

> Document PDFs (under `pdfs`) are referenced by business documents such as quotes (見積書) and invoices (請求書). Deleting them can break the PDF link on those documents, so avoid deleting files tied to business data.

## FAQ

- **"Cannot connect to storage" is shown** — the file server (SeaweedFS) is down or misconfigured. Contact your system administrator.
- **Which document does a file belong to?** — the storage key (monospace text under the file name) contains the folder and origin. The category filter also helps.
- **I deleted a file by mistake** — it cannot be restored from this screen. Ask your system administrator about restoring from backup.
- For the documents that generate these files, see their app manuals, e.g. [Quote (見積書)](/manual/en/apps/quote/user) and [Invoice (請求書)](/manual/en/apps/invoice/user).
