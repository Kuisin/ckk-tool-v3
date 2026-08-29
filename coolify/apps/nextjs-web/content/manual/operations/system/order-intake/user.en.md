---
title: "Order Document Intake — Operation Manual"
description: "An app for dropping received order-document PDFs/scans into the intake folder in bulk and checking what is waiting, failed, or processed."
---
An app for dropping received **order documents (PDFs / scanned images)** into the intake folder in bulk. The operation code is `SY0C`.

> ⚠️ This app is currently **limited to the test environment (dev)**. The production environment (main) has no intake folder configured, so opening this app there shows "folder not configured." To bring in order documents on production, use the "priority intake" feature on order acceptances instead.

## What you can do with this app

- Select multiple received order-document files at once and drop them into the intake folder.
- Check files that are waiting, failed, or processed, **linked to the order acceptance they became**.
- Start a scan right away without waiting for the automatic poller.
- Send a file that failed extraction back to the waiting queue for another try.

## Words used on this page

- **Intake folder** … a watched folder on the server; anything placed there is automatically brought in as an order acceptance (environment variable `INTAKE_DIR`).
- **Drop in** … placing a file into the folder from this screen. It **only places the file** — numbering and AI extraction happen automatically afterward.
- **Scan** … the process that checks the folder's contents and brings in waiting files in order. It runs automatically at a set interval, and can also be triggered right away from this screen.
- **Numbering** … assigning an order-acceptance number (`ORD-YYYYMM-NNNNN`) to a file once it has been brought in.

## Before you start

You need **system administration permission** to open this app. If you cannot open it, please ask your system administrator.

## How to open it

Press **注文書取込** (Order Document Intake) inside 「システム」 (System) on the home screen. Or type `SY0C` into the search box at the top of the screen.

## How to read the screen

From top to bottom there are four blocks: "Drop into folder", "Waiting", "Failed", and "Processed".

- **フォルダへ投入** (Drop into folder) … a button to choose files, a button to scan right away, and the intake folder's path and auto-scan interval.
- **取込待ち** (Waiting) … files not yet brought in. The one file currently being extracted also stays here.
- **失敗** (Failed) … files whose extraction failed. Each has a retry button.
- **取込済** (Processed) … files that have finished being brought in and became an order acceptance.

Each row shows:

- **注文請書** (Order acceptance) … if numbered, the number, a status badge, the customer name, and the item count. If not yet numbered, it shows 「**未採番**」 (Not yet numbered).
- **ファイル** (File) … the original file name (the number portion is stripped from the display).
- **サイズ / 更新** (Size / Updated) … the file's size and last-modified time.

While at least one file is waiting, the screen refreshes itself automatically every 30 seconds.

## The three ways an order arrives

Besides dropping files in from this screen, orders also arrive by the routes
below. **All of them land in the same intake folder**, so numbering and AI
extraction work identically for each.

| Route | How it gets in |
|---|---|
| **Upload** | This screen, or "Priority intake" on the order acceptance app |
| **Email** | Orders sent to a dedicated mailbox are picked up automatically (`intake-gateway`) and appear under "Waiting" within a few minutes |
| **Fax** | Currently a manual step — someone scans the paper on the MFP and uploads it via "Priority intake". There is no automatic fax receiver |

### Spotting a file that came from email

Files that arrived by email are named `mail_sender_originalname`. For example
`mail_tanaka-at-example.co.jp_order.pdf` came from `tanaka@example.co.jp`.

> ⚠️ **The sender and subject are not recorded on the order acceptance itself.**
> That filename is the only trace — the order acceptance detail page does not
> show it. To see the subject or body, open the mailbox directly. Messages that
> were taken in have been moved to its "Processed" folder.

### Emails with several attachments

If one email carries three order documents, you get **three order acceptances**
(one document = one record). Images embedded in the signature — company logos
and the like — are not taken in.

## Dropping in files

1. Press 「**ファイルを選ぶ**」 (Choose files).
2. Select the received order documents (PDF / PNG / JPG / WEBP, up to 20 MB each) — you can select several at once.
3. As soon as you select them, they are automatically dropped into the folder. Progress is shown in a notification at the bottom right of the screen.

Files dropped in this way are handled through exactly the same path as if they had been copied directly into the shared folder. After a short while the automatic scan picks them up and they appear under "Waiting".

## Scanning right away

If you want to bring files in without waiting for the automatic scan, press 「**今すぐスキャン**」 (Scan now). Extraction takes about 30–60 seconds per file, so a large batch will take a while. The screen only reports that the scan has started — check the result by refreshing this screen or looking at the order-acceptance list.

## Retrying a failed file

In the "Failed" list, press 「**再取込**」 (Retry) on the row for the file you want to fix. It goes back to the waiting queue, and only extraction is redone on the next scan. The order-acceptance number already assigned to it is kept, so the same order document is never registered twice.

## Questions and problems

**Q. It says "folder not configured."**
A. Right now this feature only works on the test environment (dev). The production environment (main) does not yet have an intake folder configured. If you need to bring in order documents on production, use "priority intake" on order acceptances to bring them in one at a time.

**Q. I dropped in a file, but it stays "not yet numbered" forever.**
A. The automatic scan runs every 60 seconds by default. Please wait a little and refresh the screen. If it still doesn't change, try 「今すぐスキャン」 (Scan now).

**Q. Extraction keeps failing, over and over.**
A. This can be caused by the file's image quality or layout. Hover over the failed row to see the reason for the failure and a hint for fixing it. If it still won't resolve, bring the document in manually through "priority intake" on order acceptances while checking the content yourself.

**Q. I accidentally dropped in a duplicate of a file that was already processed.**
A. The dropped file is saved under a unique name, so it won't overwrite anything, but you may end up with two order acceptances for the same order document. Please check the order acceptances that were created and cancel whichever one is not needed.

**Q. Is it safe to place a file directly into the intake folder's path?**
A. Yes. Dropping a file in from this screen and placing one directly into the shared folder are handled through exactly the same path.

**Q. An order sent by email was not taken in.**
A. Check, in order: (1) whether that sender is on the allow list (ask a system administrator); (2) whether the attachment is PDF, PNG, JPG or WEBP — anything else is skipped; (3) whether the message is marked read in the mailbox. Read but not taken in means it was attempted and failed. **Failed messages are not retried automatically**, to avoid registering the same order twice. Ask the sender to resend, or save the attachment and use "Priority intake".

**Q. Can faxes be taken in automatically?**
A. Not today. Scan the received fax on the MFP and upload it via "Priority intake". If you later subscribe to a fax-to-email service, those messages will ride the email route with no further change.
