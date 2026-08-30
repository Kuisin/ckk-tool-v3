---
title: "Order intake by email — administration guide"
description: "Running the automatic intake of order forms sent to order-intake@ckk-tool.co.jp (intake-gateway): creating the mailbox, checking it works, and reading it when it doesn't."
---
How order forms customers send to **order-intake@ckk-tool.co.jp** become order acceptances without anyone touching them. For the end-user screens, see「[注文書取込 (SY0C)](/manual/en/operations/system/order-intake/user)」.

> This currently runs in the **verification environment (dev) only**. Production (main) has no intake folder yet — see "Rolling it out to production".

## The flow

```
Customer ──email──> order-intake@ckk-tool.co.jp  (Sakura mail server)
                       │  intake-gateway polls over IMAP every 120s
                       ↓
                 the intake folder (INTAKE_DIR)
                       │  nextjs-web's poller scans every 60s
                       ↓
     number ORD- → AI reading (po-extract) → match partner/product → draft
```

**Once a file lands in the intake folder the path is identical** to someone copying a file into the shared folder by hand. Everything email-specific ends at "pick the attachments and drop them in the folder".

## The pieces

| Name | What it is |
|---|---|
| `order-intake@ckk-tool.co.jp` | Where customers send. **Automated intake only — nobody reads it** |
| `intake-gateway-dev` | The container that polls the mailbox and writes attachments to the folder (Coolify-managed, internal only) |
| The intake folder | A folder on the server shared by `intake-gateway` and `nextjs-web` |
| `admintools` | Creates and deletes mail addresses by driving Sakura's control panel |

## Which attachments are taken in

**Taken in** — attachments ending in **PDF / PNG / JPG / WEBP**, up to 20MB each. TIFF (typical of fax) is converted to PDF first.

**Skipped**

- Images embedded in the body — **a company logo in a signature** is the usual case. Taking these in would number a logo as an order acceptance on every single email, so they are excluded deliberately.
- `.p7s` (digital signatures), `.ics` (invites), `.txt`, `.html` and anything else outside the list.
- Mail from senders outside the allow list (`INTAKE_MAIL_ALLOW_FROM`). **Unset means everything is accepted.**

If one email carries three order forms, you get **three order acceptances** (one form = one record).

## What happens to the email afterwards

| Result | The message |
|---|---|
| Every attachment taken in | Marked **read**, moved to **Processed** |
| No usable attachment (body only, signature only) | Marked **read**, left in the inbox so a person can find it |
| Anything failed | Marked **read**, moved to **Failed**. **Not retried automatically** |
| Connection / login failure | Left untouched and unread; retried on the next poll |

> **Not retrying a partly-failed message is deliberate.** Reprocessing one guarantees the same order form is registered twice, because there is no way to tell which individual attachment already made it through. When something fails, ask the sender to resend, or save the attachment and use "priority intake" on the order acceptance screen.

## Checking it

**Did it arrive?** SY0C「注文書取込」lists it under "waiting" as `mail_sender_filename`. Within about 60 seconds it is renumbered `ORD-…` and appears in the order acceptance list.

**The mailbox** — open `order-intake@ckk-tool.co.jp` in any mail client (IMAP `ckk-tool.sakura.ne.jp`, 993, SSL). Handled mail is in "Processed", failures in "Failed".

**Is it running?** On the server, `docker logs intake-gateway-dev`.

| Log line | Meaning |
|---|---|
| `メール取込を開始します: …` | Started normally |
| `未読 N 通を処理します` → `取込フォルダへ配置: …` | Taking mail in |
| `受理できる添付なし` | No attachment, or only unsupported formats |
| `メール取込は無効です（… が未設定です）` | Configuration missing (it says which). It waits rather than crashing |
| `取込フォルダが使えません` | The folder is missing or not writable. **It will not start polling in this state** — deliberately, so orders are not lost |

## When something is wrong

**A customer sent mail and nothing was imported**

1. Check whether the message is **read** in the mailbox. Read means it was attempted. In "Failed" it failed; still in the inbox means there was no usable attachment.
2. Still unread means the gateway isn't running, or the mail never arrived. Read the log.
3. Check the attachment format — anything other than PDF/PNG/JPG/WEBP is skipped.

**It reaches "waiting" but stays unnumbered** — that is the folder side, not email. Press "scan now" in SY0C; if it still doesn't move, read the `nextjs-web` log.

**The inbox is filling up** — the move to "Processed" may be failing. Look for `メールを … へ移せませんでした（既読にはしてあります）` in the log.

## Creating another mailbox

Mail addresses are created by **admintools**, which drives Sakura's control panel for you.

1. Add the account on the admintools mail screen. The **username** and the mail address can differ (system addresses are named with an `other-sys.` prefix here).
2. **Run the sync.** Only then does the mailbox actually exist on Sakura.
3. It creates a **mail user**, plus an **alias** when needed. When the username and the part before `@` differ, **the IMAP login is the mail address**, not the username — that is the case for `order-intake@ckk-tool.co.jp`.
4. Put the address into the gateway's settings (`INTAKE_MAIL_USER` / `INTAKE_MAIL_PASSWORD`) and redeploy.

> **Do not use the sync option that deletes anything missing from the list.** It removes Sakura mailboxes that are not in the management table. Always run "check the difference" first and read what would be created and removed.

> **Do not point dev and production at the same mailbox.** The two gateways would compete for the same messages and each one would only be imported once.

## Rolling it out to production

Production (main) has no intake folder yet. It needs, on the server:

1. A production intake folder, writable by both `nextjs-web` and `intake-gateway`
2. That **same folder** attached to both `nextjs-web-main` and `intake-gateway-main`
3. A **separate production mailbox**, configured on `intake-gateway-main` (never shared with dev)
4. 「注文書取込」published in app management (SY05)

The step-by-step is in `coolify/apps/intake-gateway/README.md`.

## What is not recorded (known limitation)

**The sender, the subject and the body are not stored on the order acceptance.** There are only two traces:

1. The `mail_sender_` part of the filename (kept in the SY0C list and in the filename after numbering)
2. The `intake-gateway` log

You cannot reach it from the order acceptance detail page, and you cannot search for "mail from this customer". This is the price of keeping the intake mechanism separate from the business data. To read a subject or body, open the mailbox directly.
