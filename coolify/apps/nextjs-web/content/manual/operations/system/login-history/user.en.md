---
title: "Login History — User Guide"
description: "Look up who signed in, when, from where, and on which device — including the attempts that failed."
---
This app shows **who signed in, when, from where, and on which device**, together with **the attempts that did not work**. Its operation code is `SY0D`.

Sign-ins from PCs (Web) and from the shared tablets on the floor (kiosk) appear together in the same list.

This is a view-only app. You cannot correct or erase records from this screen.

## What you can do here

- See **both successful and failed** sign-ins, newest first.
- Notice patterns such as "the same person keeps failing" or "someone is trying from a place we don't recognise".
- Open one record to see the **connection and device details** for that attempt.
- Narrow by IP address range (for example, the whole office network).

## Words used on this page

- **Attempt** — one try at signing in. Both successes and failures count as one record each.
- **IP address** — a number that shows where the connection came from. It hints at whether the person connected from inside the office or from outside.
- **Device signature** — a marker built from the browser's characteristics. It is **a hint for telling "is this the usual PC?"**, not a way to identify a specific machine.
- **Device category** — an automatic judgement of whether the device belongs to the company. Explained in detail below.

## Before you start

- You need **system administration permission** to open this app. If you cannot open it, please ask your system administrator.
- The records include connection origins and PC characteristics. They exist **so that you can investigate when you need to**, not for routinely watching what people do.
- Records are removed automatically: **successes after 180 days, failures after 400 days**.

## Opening the app

On the home screen, under "システム" (System), choose **ログイン履歴** (Login History). Or type `SY0D` into the search box at the top of the screen.

## Device category (company device or not)

Both the list and the detail view show a **device category**. The system works this out automatically, and there are **four levels of certainty**. Hover over the badge to see why it decided that way.

| Shown as | Meaning | Certainty |
|----------|---------|-----------|
| **会社（管理端末）** Company (managed) | Confirmed by a signature from a key held inside the device | Certain |
| **会社（社内NW）** Company (office network) | The connection came from inside the office network range | Circumstantial |
| **未管理** Unmanaged | No evidence that this is a company device | Not a conclusion |
| **未判定** Undetermined | Nothing to judge from | — |

The most important caution:

> ⚠️ "**Company (office network)**" means "**connecting from inside the office**", not "**this is a device the company issued**". A personal laptop brought into the office, or a connection over VPN, shows exactly the same thing.
>
> The only category that really says "company device" is "**Company (managed)**". It appears when a shared tablet running the dedicated app signs its report with a key stored inside the device itself.

This judgement is for display only. **No sign-in is ever refused because of it.**

## Reading the screen

The summary for the last 24 hours sits at the top, with the list of records below it.

### Summary

- **24時間の失敗** (failures in 24h) — how many attempts failed. If this is higher than usual, look through the list below.
- **24時間の成功** (successes in 24h) — how many succeeded.
- **失敗の多い IP（24h）** — the connection origins where failures are concentrated.
- **失敗の多い相手（24h）** — the users where failures are concentrated. When someone tries a username that does not exist, it shows as **(未解決)** — "unresolved" — with a marker instead of the text.

### List

- **日時** — when the attempt happened.
- **結果** — success (green) or failure (red).
- **アプリ** — Web (PC) or kiosk (shared tablet).
- **方式** — how they tried to sign in (password / single sign-on / QR card + PIN, and so on).
- **ユーザー** — whose attempt it was. If the username did not exist, only "**未解決**" (unresolved) and a marker appear — **the characters typed in are deliberately not saved**.
- **理由** — why it failed (password mismatch, card invalid, PIN mismatch, and so on).
- **IP** — where the connection came from.
- **端末区分** — the automatic judgement described above.
- **端末** — the device name for a shared tablet, or a marker such as "Chrome / Windows 11" for a PC.

## Searching and narrowing down

Use the controls at the top to narrow the range.

1. **期間** (period) — 24 hours / 7 days / 30 days / 90 days / all. It starts at 7 days.
2. **結果** (outcome) — failures only, or successes only. When investigating, choosing "失敗" (failure) first makes things much easier to read.
3. **アプリ** — Web only, or kiosk only.
4. **端末区分** — for example, show only "未管理" (unmanaged).
5. **Search box (IP / CIDR)** — type an IP address directly, or **give a whole range**. For example `192.168.50.0/24` covers everything from `192.168.50.1` to `192.168.50.254`.
6. To clear every condition, press **リセット** (reset).

## Looking at one record

Click a row and the details open on the right.

- **注意すべき兆候** (signs worth noting) — appears in orange at the top only when there is something to flag. For example "the automation flag is set (this may be a program rather than a person)" or "the device clock is far off".
- **日時・方式・理由・ユーザー** — the same content as the list.
- **送信元 IP** and **プロキシチェーン** — where the connection came from and the route it took.
- **判定理由** — the basis for the device category (`wrapper:device-owner`, `cidr:inside`, and so on). It stays in English; system administrators use it when tracing a cause.
- **端末シグネチャ** — the marker built from the browser's characteristics. Comparing it with the same person's other records hints at whether this was the usual PC.
- **収集シグネチャ** — the full set of information used for the judgement. You do not normally need to read it.

> 💡 Opening the details is itself recorded in [Activity Log](/manual/en/operations/system/activity-log/user), so that there is a record of who looked at the contents. Simply browsing the list is not recorded.

## What is deliberately not recorded

For safety, some information is **deliberately never saved**.

- **Passwords and PINs** — never saved at all.
- **Usernames that do not exist** — the characters typed in are not saved (a mistyped password could end up among them). Only a marker is kept, enough to tell whether the same input keeps recurring.
- **The contents of a QR card** — the scanned value is not saved. Only **the kind** is kept: whether it was a card QR or a work-order QR.

## Fields

Login History is a **view-only screen**. There is nothing to fill in — you only choose how to narrow the list.

| Filter | What it changes |
|--------|-----------------|
| [Period](#field-days) | How many days of records to show |
| [Outcome](#field-outcome) | Successes only or failures only |
| [App](#field-app) | Web only or kiosk only |
| [Device category](#field-ownership) | Narrow by whether it is a company device |
| [IP / CIDR](#field-ip) | Narrow by connection origin (ranges allowed) |

### Period [#field-days]

How many days of records to show. It starts at 7 days. Widen it when looking for older records.

### Outcome [#field-outcome]

Narrow to successes only or failures only. When investigating, choose failures first.

### App [#field-app]

Narrow to sign-ins from PCs (Web) or from the shared tablets on the floor (kiosk).

### Device category [#field-ownership]

Narrow by the automatic judgement of whether it is a company device. See the "Device category" section for what each level means and how certain it is.

### IP / CIDR [#field-ip]

Narrow by connection origin. Give a single address such as `192.168.50.10`, or **a whole range** such as `192.168.50.0/24`.

## Questions and problems

**Q. Failures suddenly increased. What should I do?**
A. Set "結果" to failure and look at "failures by IP" and "failures by user" at the top. If the same person keeps recurring, check whether they are simply mistyping. If unfamiliar connection origins appear, please contact your system administrator.

**Q. The user column says "未解決". Who is it?**
A. It is a record of someone trying a username that does not exist. The characters typed in are **deliberately not saved**. If the marker beside it is the same, the same text is being used repeatedly.

**Q. The device signature shows "—". Is something wrong?**
A. No. It is not collected on routes that skip the sign-in screen, such as returning directly from an external authentication page.

**Q. It says "未管理" even though it is my own work PC.**
A. "Unmanaged" means "no evidence that this is a company device". It is not a statement that the device is personal. Connecting from outside the office or from another network produces this result.

**Q. I want to know what someone did after signing in.**
A. This screen only covers the sign-in itself. For what happened afterwards, use [Activity Log](/manual/en/operations/system/activity-log/user) (`SY07`).

**Q. I only want records from the shared tablets.**
A. Set "アプリ" to kiosk. To look at one specific tablet, the device detail page in [Device Management](/manual/en/operations/system/kiosk-device/user) (`SY09`) has an authentication-error list.

**Q. Older records do not appear.**
A. Records are removed automatically (successes after 180 days, failures after 400 days). If you need to investigate something older, please ask your system administrator.
