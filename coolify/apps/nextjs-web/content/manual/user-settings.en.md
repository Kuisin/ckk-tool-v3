---
title: "User Settings Manual"
description: "Settings for your own account. Open them from the avatar menu (top right) → Profile / Notification Settings / Home Screen Settings / Display Settings."
screenshots: [profile-home-01, profile-preferences-01]
---
Settings for your own account. Open them from the avatar menu (top right) → **Profile** / **Notification Settings** / **Home Screen Settings** / **Display Settings**.

> 💡 All of your personal settings live in that avatar menu. There is no settings button on the home screen.

## Profile

- **Display name / username**: synced from the company directory (AD). Ask IT to change them. The profile screen also shows your account type and last login (your department appears only in the header avatar menu).
- **Approval groups**: the approval groups you belong to. Whether you can approve documents is decided by the groups listed here. Ask an administrator to change them.
- **Email (notification address)**: the address that receives notifications. If empty, no email notifications are sent.

### Profile photo

- Upload your own photo from "Set photo" on the profile screen ("Change" once one is set). Choosing an image opens a square-crop dialog — adjust the position and size, then save.
- The saved photo is stored in two sizes; the same photo is used for the header icon and for the small icons in lists and history.
- Photos are never pulled from the company directory (AD) — they are set inside this system. The trash button deletes the photo, reverting to your name initials.

## Password

- If you sign in with SSO, your password is managed by your company account.
- To change a system-account password, use **Profile → Change password**: enter your current password and the new password (twice).

## Notifications

- **In-app**: delivered to the bell in the header. Use "Mark all read" to clear them.
- **Email**: sent to the address on your profile.
- **Push**: enable per device under **Profile → Notifications** to receive lock-screen / desktop notifications.
- **Channel toggles**: at the top of **Profile → Notifications** are on/off switches for "Email notifications" and "Push notifications". Turning email notifications off stops approval-request and other emails.

## Enabling push per platform

- **Chrome / Edge (desktop)**: **Profile → Notifications** → "Enable on this device", then choose **Allow** in the browser permission prompt.
- **Android (Chrome)**: same steps. If an "Install app" button appears, installing adds a home-screen icon (optional). Chrome's notifications must also be allowed in the OS settings.
- **iPhone / iPad (iOS 16.4+)**: push cannot be enabled from a Safari tab. Use Safari's Share button → **Add to Home Screen**, reopen the app from the "CKK" home-screen icon, then press "Enable on this device".
- If you blocked notifications by mistake, set the site's notification permission back to **Allow** in the browser settings, then enable again.

## Registered devices

- Under **Profile → Notifications → Registered devices**, review and remove devices where push is enabled. Remove any device you no longer use.

## Home screen settings

Use **Home Screen Settings** in the avatar menu to customize your home screen layout.

- **Favorite apps** — click the cards to select apps; they appear together as "Favorites" at the top of the home screen, in the order you selected them.
- **Display mode** — switch between **Standard (by category)** and **Custom (by group)**. In custom mode, apps are arranged by the groups you create; apps not assigned to any group are collected under "Other".
- **Custom groups** — type a name into "New group" to add one. Each group can be renamed, moved up/down, or deleted, and you choose which apps belong to it (an app can belong to at most one group; apps already in another group cannot be selected).

![Home screen settings](./assets/screenshots/profile-home-01.png)

## Display settings

Use **Display Settings** in the avatar menu to change the language, how dates and times are shown, and how large text is. These apply to **your account only** — language and date/time also apply to the shop-floor tablets (kiosk), while text size and bold text are web only.

- **Language** — 日本語 / English / 中文.
- **Date format** — `2026/03/05`, `2026-03-05`, `05/03/2026` or `03/05/2026`.
- **Time format** — 24-hour (14:30) or 12-hour (2:30 PM).
- **Time zone** — which region's clock dates and times are shown in; set it when working from an overseas site or on a trip. Each option shows the **current time** in that zone, so you can see the offset at a glance.
- **Text size** — five steps: Smallest / Small / Default / Large / Largest. The middle one is the size you have today; changing it scales text **and** spacing across the whole app. Each option is drawn at the size it stands for, so you can see what you are picking.
- **Bold text** — makes body text one step heavier. Headings and emphasis, already bold, stay as they are.

Your choices appear immediately in the **Preview** below, so you can check them before saving. **Text size and bold text are applied to the whole screen right away** — whether it reads well depends on lists and buttons too, not on a small sample.  Once saved they apply **everywhere a date or time appears** — lists, detail pages, history.

![Display settings](./assets/screenshots/profile-preferences-01.png)

> 💡 **Changing the time zone does not change the recorded timestamps.** It only changes which region's clock you read them by.

> 💡 **Leave the page without saving and the text size returns to what it was**, so you can try a size before committing to it. On a narrow screen (a phone) with large text, the operation-code box in the header gives up its place — the same search lives inside the app launcher behind the logo at the top left.

### Some screens are still in Japanese

Even with English or 中文 selected, **screens that are not translated yet stay in Japanese** — this is expected, not a fault. Today the top-right menu, the notification panel and this display-settings screen switch. The date, time and time-zone settings apply to every screen from the start.

### PDFs do not follow these settings

Quotes, delivery notes, invoices and other PDFs are always printed with **Japan time and the same format for everyone**, so a finished document never shows different dates depending on who opens it.

## Manual language

- The manuals (/manual) can be switched between 日本語 / English / 中文 using the language links at the top right. The language of the app itself is changed in **Display Settings** above.
