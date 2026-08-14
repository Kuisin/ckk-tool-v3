---
title: "QR Card Management — User Manual"
description: "Operation code SY08. Issue, assign, and manage the QR cards used to log in to the shared plant-floor tablets (kiosk devices)."
screenshots: [kiosk-cards-01]
---
Operation code **SY08**. Issue, assign, and manage the **QR cards** used to log in to the shared plant-floor tablets (kiosk devices).

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- **Issue** QR cards (1–100 at a time).
- **Assign** cards to users (one card per user; temporary cards with a validity period are also possible).
- **Print** cards from a print sheet (10 business-card-size cards per A4 page).
- **Suspend / resume / revoke** cards, and **reset / unlock PINs**.
- Set each card's **concurrent login limit** and **validity period**, and review recent logins.

This app requires the **kiosk management (kiosk) permission**.

## Card statuses

- **Unassigned** … issued but not yet assigned to anyone.
- **Assigned** … assigned to a user and usable for login.
- **Suspended** … login temporarily blocked. Restore with "Resume".
- **Revoked** … permanently disabled. **Cannot be undone** (loss, resignation, etc.).

## From issuing to first use

1. Use **Issue cards** and specify the count (1–100). Cards are created as "Unassigned".
2. Use the row action **Assign to user** to pick the user. Only active users can be assigned, and it is **one card per user**. Assigning from the detail page also lets you set a **valid-from / valid-until date** — setting a period makes it a temporary card (login is blocked outside the period; the end date is valid through the whole day).
3. Check the cards and press **Print selected cards** (or the row action **Print**) — the print sheet opens in a new tab. It lays out business-card-size (91×55 mm) cards on A4 portrait, **10 per page** (2 columns × 5 rows), with corner crop marks for cutting.
4. Hand the printed card to the user. They scan the QR on a tablet and set a **PIN** on first login.

For security, the list shows only the **last 8 characters** of each card ID. The full ID exists only inside the printed QR.

## List and search

- Search by card ID or user name, and filter by status.
- Columns: **Card ID** (masked) / **Assigned user** / **Status** / **PIN** (set / not set, plus locked) / **Validity** (unlimited or a period, with expired / not-yet-started warning badges) / **Last used** / **Use count**.
- Click a row to open the card detail.

![QR Card Management list](../../assets/screenshots/kiosk-cards-01.png)

## PIN operations

- The PIN is set by the user on the tablet. Administrators can never see or set PIN values.
- Repeated wrong PIN entries lock the card for a while; the PIN column shows "Locked" (see the authentication policy in [Kiosk Settings](/manual/en/system/kiosk-settings/user) for the counts and durations).
- **Unlock PIN** … clears only the lock. The PIN itself is kept.
- **Reset PIN** … erases the PIN, for when the user has forgotten it. They set a new PIN on their next login.

## Suspension, revocation, and limits

- **Suspend** … blocks login with this card. "Resume" restores it.
- **Revoke** … permanently disables the card. **Cannot be undone.** Any open kiosk sessions on the card are terminated immediately. To reassign, revoke the existing card and assign a different one (assigned cards cannot be transferred).
- **Concurrent login limit** (detail page) … how many devices can be logged in with one card at the same time (1–10). Logging in beyond the limit automatically logs out the oldest device's session.
- **Edit validity period** (detail page) … extend, shorten, or return to unlimited. Cards outside their period cannot log in.
- The **Recent logins** panel on the detail page shows the card's latest logins (device, plant, time).

## FAQ

- **A card was lost** … **Revoke** it and issue/assign a new card.
- **An "expired" warning is shown** … The card is past its validity period. Extend it via "Edit validity period" on the detail page, or revoke the card.
- For device-side management (linking, activation, floor maps), see [Device Management](/manual/en/system/kiosk-device/user). For detailed tablet setup steps, see the internal documentation.
