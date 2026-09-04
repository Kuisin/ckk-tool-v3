---
title: "Partner Portal"
description: "How external people (business partners and end users) see their own documents and progress. Creating accounts, sharing scope, the two kinds of document link, and which actions need approval."
---

Lets external people open their own documents at `/portal`. Sign-in is a
**verification code sent to a pre-registered e-mail address** — there is no password.

> **This currently runs on the test environment (dev) only.** Opening it in
> production takes a code change and a deployment; it cannot be switched on from
> a settings screen. Because this surface faces outside the company, we made
> "accidentally published to production" impossible to do by mistake.

## What they can see

| Visible | Scope |
|---|---|
| Quotes, order acceptances, delivery notes, invoices | Only those addressed to that business partner |
| Order progress | Received / In production / Ready / Shipped / Delivered |
| Form responses | Only what has been shared |

**Deliberately not visible:**

- Work order numbers, process steps, and **subcontractors**
- Delivery orders (an internal document)
- Internal memos, raw AI extraction data, assigned plant, sales rep
- Draft documents (only confirmed / issued ones appear)

Progress says how far the order has come, not which machine ran it, when, or who.

## Creating an account

Go to **System → Partner portal** (operation code `SY0H`).

1. Choose the business partner, contact name and e-mail address
2. Decide whether branch documents are included
   - **A branch never reaches up to its parent.** Someone at a branch cannot see
     the head office's or a sibling branch's documents
3. "Include documents where they are the end user or ship-to" is **off by
   default**. It can expose your selling price to an end user, so turn it on only
   when you mean to

A new account **sees nothing**. It can only sign in once you activate it.

> **Activating needs approval** (privileged access, `SY0G`). Giving an outsider a
> standing login is a decision another person signs off on.
> **Deactivating needs no approval** — waiting for a signature when you want
> access stopped would defeat the point. Deactivating also ends any session that
> person currently has open.

## Handing over the sign-in guide

Once the account is active, issue the **guide PDF from Partner portal (`SY0H`)**
and give it to the contact. One sheet carries the QR code, the steps, what they
can see and who to contact — enough to get started without any other document.

- **One page per contact.** "Guide" on a row prints that one person; "Guide for
  all contacts" on the account page prints everyone at that partner
- **The QR carries that person's sign-in address.** Scanning it opens the login
  screen with the address already filled in, so nobody types a long address on a
  phone
- **It cannot be issued before the account is active** — so you never hand
  someone a guide they cannot use
- The sheet is printed in the **partner's language** (the language on the partner
  master), not in the language of the employee looking at the screen

> **Backup codes are not on this sheet.** Those let someone in just by holding
> them, so hand them over separately and directly.

What the guide says about sharing and the sales contact is **a copy taken when it
was issued**. Re-issue it if you change what is shared.

## When they cannot receive e-mail

### Backup codes

Issue 10 codes from **System → Partner portal**. Each works once.

- **They are shown only once, right after issuing.** Print them or write them down
- **Do not e-mail them.** They exist for when e-mail is not available; hand them
  over in person
- Re-issuing invalidates every unused code you handed over before
- Issuing needs approval

### Document links

From a document's detail screen (quote, order acceptance, delivery note, invoice),
"Portal sharing" mints a URL for that one document. **There are two kinds.**

| | How it opens | If forwarded |
|---|---|---|
| **Verified** (recommended) | URL + a code sent to the registered address | The recipient **cannot** open it |
| **Link-only** | Anyone holding the URL | The recipient **can** open it |

For a verified link the code goes **only to the address bound to that link**. If
whoever opens it types a different address, nothing is sent there. That is what
makes a forwarded link worthless to anyone but the intended reader.

Link-only **needs approval**. Choosing it for an invoice or quote asks you to
confirm first.

Both **must have an expiry** (30 days by default, 180 maximum) and can be revoked
at any time.

## Who can administer it

Only people holding the `Partner portal administration` permission. It is **not
given to the operational roles** (department managers, viewers and so on),
because it reads external personal data and can send documents outside the
company. An administrator grants it individually.

## Records

- **Every view by an external person is recorded** (kept 400 days) and shown per
  account under **System → Partner portal**
- Sign-in successes and failures appear in **Login history** (`SY0D`); filter
  "App" by **Partner portal**
- Internal actions (creating, activating, deactivating, minting and revoking
  links) appear in the activity log. **Verification codes, backup codes and link
  URLs are never recorded** — they are keys in themselves

## Troubleshooting

**"The code never arrived"**

The screen shows the same wording in every case, so that nobody outside can tell
whether an address is registered. Two places to check from inside:

1. Whether the account is *Active* under **System → Partner portal**
2. The row and reason for that moment in **Login history** (`SY0D`)

If mail could not be sent at all, the monitoring alert `portal_otp_mail_failed`
fires.

**No code arrives on the test environment**

On dev we only send to addresses on an allow-list, because dev holds real
business-partner data and we do not want a test to mail an actual customer.
Add your own address (`PORTAL_MAIL_ALLOWLIST`).
