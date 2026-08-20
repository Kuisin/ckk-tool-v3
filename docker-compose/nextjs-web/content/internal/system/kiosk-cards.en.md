---
title: "QR Card Management — User Manual"
description: "Operation code SY08. Issues and manages the QR cards employees use to log in to shared plant-floor tablets (kiosk dev…"
---
Operation code **SY08**. Issues and manages the **QR cards** employees use to log in to shared plant-floor tablets (kiosk devices).

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

> This app requires the **kiosk administration permission**. All operations are recorded in the audit log.

## What you can do here

- **Issue** QR cards (1–100 at a time)
- **Assign** cards to users (one card per user)
- **Print** cards from the print sheet (business-card size)
- **Suspend / resume / revoke** cards
- **Reset a PIN / clear a PIN lock**

## Card statuses

- **未割当 (Unassigned)** … issued but not yet assigned to anyone.
- **割当済 (Assigned)** … assigned to a user and usable for login.
- **一時停止 (Suspended)** … login temporarily blocked. Use "再開" (Resume) to restore.
- **取り消し (Revoked)** … permanently disabled. **Cannot be undone** (use for lost cards, leavers, etc.).

## From issuing to first use

1. Click **カードを発行** (Issue cards) and enter a count (1–100). Cards are created as unassigned.
2. From the row menu, choose **ユーザーに割当** (Assign to user). Only active users can be selected, and each user can hold **only one card**.
3. Check the cards and click **選択したカードを印刷** (Print selected cards) — or use **印刷** (Print) in the row menu. A print sheet opens in a new tab: business-card size (91×55mm), 10 cards per A4 portrait page (2 × 5), positioned for A4 business-card stock (10 per sheet), with corner crop marks for cutting. The PDF page box is deliberately a little smaller than A4 so that a viewer's "fit to printable area" never kicks in — it always prints **at actual size (100%)**. Do not override the scale in the print dialog.
4. Hand the printed card to the employee. They hold the QR up to the tablet and set a **PIN** (4–6 digits) on first login.

For security, the list shows only the **last 8 characters** of each card ID. The full ID exists only inside the QR on the print sheet.

## How PINs work

- The employee sets their own PIN (4–6 digits) at first login on the tablet. Administrators can never see or set the PIN value.
- If the card was used **on that same device within 48 hours** and the last PIN verification was **within 2 weeks**, scanning the QR alone is enough. Otherwise the PIN is asked again (the first login on a new device always asks for the PIN).
- **5 consecutive** wrong PIN entries lock the card for **15 minutes**. The PIN column then shows "ロック中" (Locked).
- **PINロック解除** (Clear PIN lock) … clears only the lock; the PIN itself is kept.
- **PINリセット** (Reset PIN) … erases the PIN. Use this when the employee has forgotten it; they set a new PIN at the next login.

After login, sessions end automatically after **5 minutes** of inactivity, with a hard limit of **8 hours**.

## Suspending and revoking

- **一時停止** (Suspend) … blocks login with this card. Reversible via **再開** (Resume).
- **取り消し** (Revoke) … permanently disables the card. **Cannot be undone.** Any open kiosk sessions on that card are terminated immediately.

To move a card to a different user, **revoke** the existing card first, then assign a new (or unassigned) card. An assigned card cannot be transferred directly to another user.

## List and search

- Search by card ID or user name; filter by status.
- Columns: card ID / assigned user / status / PIN (set, not set, locked) / last used / use count.

## Related pages

- Device-side management (linking, activation, floor maps): see [Kiosk Device Management](/internal-docs/en/system/kiosk-devices).
- Initial setup of the tablet itself: see [Kiosk Device Setup](/internal-docs/en/system/kiosk-device-setup).
