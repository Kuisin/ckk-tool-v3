---
title: "App Management — Operation Manual"
description: "An app that uses switches to choose which apps appear on everyone's screen."
screenshots: [settings-apps-01, settings-apps-filter-01, settings-apps-switch-01, launcher-01]
---
An app that **uses switches** to choose which apps appear on everyone's screen. The operation code is `SY05`.

When you turn a switch off, that app disappears from everyone's home screen. The data is not deleted.

## What you can do with this app

- You can see every app in the system in one list.
- For each app, you can separately turn it on or off for the **practice screen** and the **real screen**.
- When a new app is ready, you can turn on its real switch and release it.
- You can also use it when you want to hide an app for a while.

## Words used on this page

- **dev（検証）(dev — testing)** … the screen used for practice and checking. It is a place to try things out, not the real work data.
- **main（本番）(main — production)** … the real screen that everyone uses for their daily work.
- **操作コード (operation code)** … the four-character code fixed for each app (such as `SA02`). Type it into the search box at the top of the screen to jump to that app.

## Before you start

- You need **system administration permission** to open this app. If you cannot open it, please ask your system administrator.
- When you flip a switch, **it changes on everyone's screen straight away**. If you turn off a real switch during working hours, the app stops working for people at that moment. Please take care over the timing.

## How to open it

Press **アプリ管理** (App Management) inside 「システム」 (System) on the home screen. Or type `SY05` into the search box at the top of the screen.

## How to read the screen

When you open the app, the apps in the system are listed.

![App Management list screen](../../assets/screenshots/settings-apps-01.png)

- **カテゴリ** (Category) … the group the app belongs to (販売 (sales) / 購買 (purchasing) / 生産 (production) / 出荷 (shipping) / 請求 (billing) / マスタ (master data) / ドキュメント (documents) / システム (system)).
- **アプリ** (App) … the name of the app.
- **操作コード** (Operation code) … the four-character code such as `SY05`.
- **dev（検証）** … the switch for whether the app appears on the practice screen.
- **main（本番）** … the switch for whether the app appears on the real screen.

When you type into the search box at the top, 「**アプリ名・操作コードで検索**」 (Search by app name or operation code), only the app you are looking for stays in the list. You can also narrow the list by group with 「**カテゴリ**」. To clear all of the conditions, press 「**リセット**」 (Reset).

![Narrowing the list by category](../../assets/screenshots/settings-apps-filter-01.png)

## Turning an app on or off

1. Find the row for the app you want to change.
2. Press the 「**dev（検証）**」 or 「**main（本番）**」 switch.
3. When 「**有効化しました**」 (Turned on) or 「**無効化しました**」 (Turned off) appears at the bottom right of the screen, the change has been made.

![A switch just after being flipped](../../assets/screenshots/settings-apps-switch-01.png)

The change **reaches everyone's screen straight away**. Press it again and you can put it back at any time.

> ⚠️ If the change fails, the switch moves back to its original position by itself and a red 「**エラー**」 (Error) message appears. In that case nothing has been changed.

## The difference between the two switches

Even for the same app, the practice screen and the real screen have separate switches. They start out differently, so please note the following.

- **dev（検証）** … if you do nothing, the app **is shown**. You only turn off the switch for apps you want to hide.
- **main（本番）** … if you do nothing, the app **is not shown**. **Only the apps whose switch you turn on** appear on the real screen.

In other words, **turning on the main switch is itself the release of that app to the company**. Before you turn it on, please check the app thoroughly on the practice screen.

An app that has not yet been released to the real screen is shown on the practice screen with an orange 「**DEV**」 mark. It is a sign meaning "this app cannot be used on the real screen yet".

## What happens when you turn a switch off

![The app list (launcher)](../../assets/screenshots/launcher-01.png)

- The app **disappears** from everyone's home screen and from the app list.
- It no longer comes up when you type its operation code.
- It also disappears for people who had added it to their favourites.
- Opening the old address directly no longer works either.
- **The data you have entered is not deleted.** Turn the switch back on and everything works just as before.

## Questions and problems

**Q. I pressed a switch, a red 「エラー」 (Error) appeared, and it went back.**
A. Either you do not have permission to change it, or the connection failed. Changing a switch needs system administration permission. Please ask your system administrator.

**Q. I turned a switch on, but the app does not appear on someone's screen.**
A. The switch only decides whether the app appears on screen at all. Separately from that, the person also needs permission to use that app. Please check that person's permissions in [User Management](/manual/en/system/user-management/user).

**Q. The app I want to use is not in this list.**
A. This list is built automatically from the apps that are part of the system. Adding a new app needs work by the development side. Please ask your system administrator.

**Q. I turned off a real switch by mistake.**
A. Press it again to turn it back on and it returns immediately. No data has been lost.

**Q. I want to know who changed a switch, and when.**
A. You can check in the [Activity Log](/manual/en/system/activity-log/user). Narrow 「**対象**」 (Target) to 「**アプリ管理**」 (App Management) and only the switch changes are listed.

**Q. I want to hide an app just during maintenance.**
A. Please turn off that app's switch. When the work is finished, turn it back on to resume. The data stays as it was.
