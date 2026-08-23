---
title: "Device Management — User Manual"
description: "An app for registering the shared tablets placed in the plant so they can be used."
screenshots: [kiosk-devices-01, kiosk-devices-create-01, kiosk-devices-link-01, kiosk-devices-detail-01]
---
This is an app for registering the **shared tablets** placed in the plant so that they can be used. The operation code is `SY09`.

You can also check on this screen which tablets are running right now and who is using them.

## What you can do with this app

- Register a new tablet and make it ready to use.
- Change a tablet's name, site, and location.
- Check which tablets are online right now, and who is using them.
- Handle broken or replaced tablets.
- Place tablets on a **フロアマップ** (floor map — the layout drawing of the site).
- See a history of who used which tablet, and when.

## Terms used on this page

- **Kiosk device** … the shared tablet placed in the plant. On this screen it is called 「端末」 (device).
- **Device profile** … a **registration slot for one placement**, such as "the tablet in the 1F inspection room". You create this slot first, and connect a real tablet to it afterwards.
- **Linking** … the work of connecting a registration slot with a real tablet.
- **Link code** … a 12-character password shown on the tablet's screen. You use it to link the tablet.
- **Site** … a plant or business location.

## Before you start

- You need the **kiosk management permission** to use this app. If you cannot open it, please ask your system administrator.
- Preparing the tablet itself (installing the dedicated app, connecting it to the network) cannot be done from this screen. Please see your company's internal procedure document.
- For employees to log in, a card must first be issued in [QR Card Management](/manual/en/operations/system/kiosk-card/user).

## How to open it

On the home screen, press **端末管理** (Device Management) under 「システム」 (System). Or type `SY09` into the search box at the top of the screen.

## Reading the screen

When you open the app, the registered tablets are listed.

![Device Management list screen](../../../assets/screenshots/kiosk-devices-01.png)

- **端末名** (Device name) … the name you gave the tablet.
- **場所** (Location) … a note about where it is placed.
- **拠点** (Site) … which site the tablet belongs to.
- **状態** (Status) … the current situation. There are five of them.
  - **リンク待ち** (Awaiting link) … you have only created the registration slot; it is not yet connected to a real tablet.
  - **有効化待ち** (Awaiting activation) … it is connected to a tablet. All that is left is to switch it on.
  - **有効** (Active) … ready to use.
  - **無効** (Disabled) … temporarily stopped. This can be undone.
  - **取り消し** (Revoked) … made completely unusable. This cannot be undone.
- **リンク** (Linked) … the date and time it was connected to a tablet. Before that, it shows 「**未リンク**」 (Not linked).
- **オンライン** (Online) … if it is connected right now, a green dot with 「**オンライン**」 (Online); if it is not, a gray dot with 「**オフライン**」 (Offline).
- **利用者** (User) … the person currently logged in on that tablet.
- **最終アクティビティ** (Last activity) … the date and time it was last used.
- **有効化者** (Activated by) … the person who made that tablet ready to use.

You can search with the box at the top, 「**端末名 / 場所 / 拠点...**」 (Device name / Location / Site...). Narrow the list down with 「**拠点**」 and 「**状態**」, and clear your conditions with 「**リセット**」 (Reset). Click a row to open the detail screen for that tablet.

## Registering a tablet

Registration has 3 stages. **First create the slot, then connect the tablet, and finally make it ready to use.**

### Step 1 — Create the registration slot

1. Press 「**端末プロファイル作成**」 (Create device profile) at the top right of the screen.
2. Enter an easy-to-understand name in 「**端末名**」 (Device name) — for example, 1F Machining Tablet 1.
3. Choose the 「**拠点**」 (Site).
4. Enter a note about where it is placed in 「**場所**」 (Location). This is optional — for example, Inspection room entrance.
5. Press 「**作成**」 (Create).

![Screen for creating a device profile](../../../assets/screenshots/kiosk-devices-create-01.png)

A row with the status 「**リンク待ち**」 (Awaiting link) is created.

### Step 2 — Connect the tablet

1. The tablet's own settings screen shows a **12-character code** and a QR code.
2. In the list, press the 「**…**」 button (the three dots) on that slot's row.
3. Choose 「**端末をリンク**」 (Link device).
4. Enter the 12 characters shown on the tablet into 「**リンクコード**」 (Link code).
5. Or press 「**タブレットのQRをスキャン**」 (Scan the tablet's QR) and read the tablet's QR code with the camera.
6. Press 「**リンク**」 (Link).

![Screen for linking a tablet](../../../assets/screenshots/kiosk-devices-link-01.png)

The status changes to 「**有効化待ち**」 (Awaiting activation).

> ⚠️ The code is valid for **only 10 minutes**. If the time has passed, have the tablet display it again.

### Step 3 — Make it ready to use

1. From 「**…**」 on that row, choose 「**有効化**」 (Activate).
2. A confirmation screen appears — read it, then press 「**有効化**」.

The status changes to 「**有効**」 (Active), and **the tablet's screen automatically switches to the login screen**. Employees can now use it.

## Changing the name or location

1. From 「**…**」 on that row, choose 「**編集**」 (Edit).
2. Correct 「**端末名**」 (Device name), 「**拠点**」 (Site), and 「**場所**」 (Location).
3. Press 「**保存**」 (Save).

> ⚠️ **If you change the site, the pin placed on the floor map is removed.** This is because the layout drawings are separated by site. After changing the site, please place the pin again on the new site's floor map.

## Replacing or stopping a tablet

From 「**…**」 on the row, you can do the following, depending on your situation.

- 「**無効化**」 (Disable) … temporarily makes it unusable. You can undo this with 「**再有効化**」 (Re-enable). Use it while the tablet is out for repair, for example.
- 「**再有効化**」 (Re-enable) … makes a stopped tablet usable again.
- 「**リンク解除**」 (Unlink) … removes the connection between the tablet and the registration slot, and returns it to "Awaiting link". The name, site, location, and floor-map pin all stay as they are. **Use this when you replace a tablet with a new machine.** You can connect the new tablet to the same slot again.
- 「**鍵リセット**」 (Key reset) … use this when you have factory-reset or replaced a tablet. After you press it, the tablet's app is registered afresh the next time it connects.
- 「**削除**」 (Delete) … you can only delete registration slots that have not been connected yet (Awaiting link).
- 「**取り消し**」 (Revoke) … makes the tablet completely unusable.

> ⚠️ 「**取り消し**」 **cannot be undone**. Any open logins are cut off on the spot. To use it again, you have to start over from a new registration slot.

## The tablet's detail screen

Click a row in the list to open the screen for that one tablet.

![Device detail screen](../../../assets/screenshots/kiosk-devices-detail-01.png)

Near the top you will see the online status, the user, the site, the location, the link date and time, and so on.

- 「**アテステーション鍵**」 (Attestation key) … something like a per-tablet password, used to confirm that the tablet is the genuine one. When it has not been decided yet, it shows 「**未束縛**」 (Not bound).
- 「**GPS 位置（最新）**」 (GPS position (latest)) … the newest position received from the tablet. When nothing has been received, it shows 「**未取得**」 (Not received).

### PIN and setting codes

There are 2 numbers for operating the tablet on the floor. Both are normally hidden as "••••••", and you can see them by pressing 「**表示**」 (Show). They hide again after 60 seconds.

- 「**メンテナンス PIN（全端末共通・毎日 4:00 自動更新）**」 (Maintenance PIN (same for all devices, updated automatically at 4:00 every day)) … a number that temporarily unlocks the tablet's screen for free use. Use it when changing Wi-Fi settings, for example. Tap the top left of the device screen 5 times in a row and an input box appears.
- 「**端末設定コード（この端末・左上 5 タップ用）**」 (Device setting code (this device only, for 5 taps at the top left)) … a number for that one tablet only. Use it when resetting a device or connecting it again. Press 「**再生成**」 (Regenerate) to get a new number — **the previous number then stops working**.

> ⚠️ Pressing 「**表示**」 is recorded. Tell the numbers only to the staff on the floor, and do not post them on a wall or similar.

### Usage records

- 「**最近の利用者**」 (Recent users) … the people who use that tablet often, and how many times.
- 「**利用履歴**」 (Usage history) … a list of who logged in and when, and when they logged out. When it has not been used yet, it shows 「**利用履歴はまだありません**」 (No usage history yet).

## Floor map (placing tablets on the layout drawing)

If you place the tablets' positions on the site's layout drawing, you can see at a glance which machines are running and where.

1. Press 「**フロアマップ**」 (Floor map) at the top right of the list screen.
2. Choose the site you want to see in 「**拠点**」 (Site) at the top.
3. Tabs for each floor are shown — choose the floor you want to see.

Green pins are online and gray pins are offline. If someone is logged in, that person's name is also shown. Double-click a pin to open the detail screen for that tablet. Storage-location pins are also shown alongside, for reference.

### Editing the layout drawing

Turn on the 「**編集モード**」 (Edit mode) switch at the top of the screen, and you can do the following.

- You can **drag pins to move them**. When you let go, that position is saved automatically.
- Click a tablet in 「**未配置の端末**」 (Unplaced devices) on the right and it is placed in the middle of the drawing. After that, drag it into place.
- To remove a tablet you have placed, press the mark on its row under 「**配置済み**」 (Placed) on the right — 「**ピンを解除**」 (Remove pin).
- Add floors with 「**フロアを追加**」 (Add floor). Change a floor's name with 「**名称変更**」 (Rename).
- Put in an image of the layout drawing with 「**図面をアップロード**」 (Upload drawing) or 「**図面を差し替え**」 (Replace drawing) — PNG / JPG / WEBP / SVG, up to 10 MB.
- Delete a floor with 「**フロアを削除**」 (Delete floor). However, you cannot delete a floor that has tablets or storage locations placed on it. Remove those pins first.

At a site that does not have a layout drawing yet, 「**この拠点にはフロアマップがありません。**」 (This site has no floor map.) is shown. Turn on edit mode and create one from 「**フロアを追加**」.

## Input fields

| Field | Required | What to enter |
|-------|----------|---------------|
| [Device name (Japanese / English)](#field-name) | Required | The name shown in lists and logs |
| [Plant](#field-plant) | Required | Where the device lives |
| [Location](#field-location) | Optional | Where within that plant |
| [Link code](#field-link-code) | Required | The code shown on the tablet |
| [Default work location](#field-default-work-location) | Optional | Work location auto-recorded on actuals from this device |

### Device name (Japanese / English) [#field-name]

The name shown in the list, on the floor map, and on activity-log badges. Use a name that **lets someone find the physical device**, such as "Plant 1 entrance". Fill in both Japanese and English.

### Plant [#field-plant]

Where the device lives. Devices are listed per plant.

### Location [#field-location]

Where it sits inside the plant. Placing a pin on the floor map also shows its position on screen.

### Default work location [#field-default-work-location]

The work location (machine / area) automatically recorded on work actuals when a step is **started or resumed** on this tablet. Set it to where the tablet is physically placed. Only work locations belonging to the device's plant (or groups with no plant) can be selected.

- Changing the plant clears the default work location
- It can also be changed from the tablet's **device settings screen** (tap the header 5 times → settings code)
- If work actually happened elsewhere, scanning a work-location QR code on the step execution screen overrides the location on that actual record

### Link code [#field-link-code]

The code shown on the tablet's own screen. **Create the device entry here first**, then scan (or type) the code from the tablet to tie that entry to the physical device.

- An entry that is not tied to a device **cannot be activated**
- To swap a device, **unlink** it. The name, plant and pin stay, so a new device can be tied to the same entry

## FAQ and troubleshooting

**Q. I get 「コードが無効か期限切れです。タブレット側で再表示してください」 (The code is invalid or expired. Please display it again on the tablet).**
A. The link code is 12 characters and is valid for only 10 minutes. Have the tablet show the code again, and try once more.

**Q. I get 「オープンな（未リンクの）プロファイルにのみリンクできます」 (You can only link to an open (unlinked) profile).**
A. Another tablet is already connected to that registration slot. If you want to swap in a new tablet, press 「**リンク解除**」 (Unlink) first, then link again.

**Q. I activated it, but it stays offline forever.**
A. Please check that the tablet's power is on and that it is connected to the network. The display can take a little while to catch up.

**Q. A tablet broke, so I am replacing it with a new machine.**
A. Press 「**リンク解除**」 (Unlink) on that device. The name, site, location, and floor-map pin all stay as they are, so you can link the new tablet to the same slot.

**Q. The camera cannot read the QR code.**
A. If 「**カメラを起動できません。カメラ権限と HTTPS 接続を確認してください。**」 (The camera cannot be started. Please check the camera permission and the HTTPS connection.) is shown, allow the browser to use the camera. If that does not work, you can also register by typing the 12-character code by hand.

**Q. I changed the site, and the tablet disappeared from the floor map.**
A. That is normal behavior. The layout drawings are separated by site, so changing the site removes the pin. Please place it again on the new site's floor map.

**Q. I get 「リンク済み・有効化済みの端末は削除できません（取り消しを使用してください）」 (Linked or activated devices cannot be deleted — please use Revoke).**
A. 「削除」 (Delete) can only remove registration slots that are not yet connected to a tablet. For tablets you no longer use, please use 「**取り消し**」 (Revoke).
