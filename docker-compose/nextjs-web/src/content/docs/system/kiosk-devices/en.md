# Kiosk Device Management — User Manual

Operation code **SY09**. Registers and manages the shared factory-floor tablets (kiosk devices): linking, activation, floor-map placement, and usage history.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

> This app requires the **kiosk administration permission**. All operations are recorded in the audit log.

## What you can do here

- Create device profiles, then **link** and **activate** tablets
- Edit device info (name, factory, location); disable / re-enable, unlink, revoke
- Place device pins on **floor maps** with live online status
- View usage history (login / logout, online / offline)

## Device statuses

- **リンク待ち (Awaiting link)** … profile created, no tablet linked yet.
- **有効化待ち (Awaiting activation)** … linked to a tablet, waiting for activation.
- **有効 (Active)** … usable as a kiosk.
- **無効 (Disabled)** … temporarily stopped. Restore with "再有効化" (Re-enable).
- **取り消し (Revoked)** … permanently disabled. **Cannot be undone.**

## Registering a device (link → activate)

Registration is "profile first". For preparing the tablet itself (installing the dedicated app, etc.), see [Kiosk Device Setup](/docs/system/kiosk-device-setup).

1. Click **端末プロファイル作成** (Create device profile) and enter a name, factory, and optional location. The status becomes "Awaiting link".
2. The tablet's setup screen shows a **12-character link code** with a QR (valid for **10 minutes**).
3. From the row menu, choose **端末をリンク** (Link device) and type the code — or **scan the QR with your camera** (works on any browser, including phones). On success the status becomes "Awaiting activation".
4. Click **有効化** (Activate). The status becomes "Active" and the tablet detects this automatically and switches to the login screen.

If the code expires, have the tablet display it again and retry. Only profiles in "Awaiting link" can be linked.

## Reading the list

- **Online** … a green / gray dot showing the connection state of active devices. Normally updated in real time (WebSocket); when that is unavailable it falls back to a 30-second auto refresh, or to activity within the last 5 minutes.
- **利用者 (Current user)** … the user currently logged in on that device.
- The value with a 🔑 under the device name is the device app's **attestation key** (fingerprint).
- Click a row to open the **device detail** page with recent users and usage history. The row menu's **利用履歴** (Usage history) opens the same history.

## Editing and the device settings code

- **編集** (Edit) changes the name, factory, and location. **Changing the factory removes the pin from the floor map** (maps are per factory).
- The edit dialog shows the **device settings code** (6 digits). It unlocks the tablet's settings screen, opened by tapping the header 5 times; share it with the floor staff for resetting or re-linking a device. You can show / hide it and **regenerate** it (the new code is shown once, on the spot).

## Replacing or stopping a device

- **リンク解除** (Unlink) … detaches the tablet from the profile and returns it to "Awaiting link". Name, factory, location, and the map pin are kept; sessions, the device token, and the attestation key are destroyed. Use this to replace a broken tablet, then re-link the new one to the same profile.
- **鍵リセット** (Key reset) … clears only the attestation key. The next time that device's app connects, a new key is bound (use after re-initializing a tablet).
- **無効化 / 再有効化** (Disable / Re-enable) … temporarily stop / resume use. A disabled device cannot be used as a kiosk.
- **取り消し** (Revoke) … permanently disables the device. **Cannot be undone.** The device token is destroyed and open sessions are terminated; re-registration via a new profile is required to use the tablet again.
- **削除** (Delete) … only profiles that have never been linked ("Awaiting link") can be deleted.

## GPS location

Each device reports its GPS position automatically **every 5 minutes**, kept as a history (90-day retention). The device detail page shows the latest coordinates under "GPS 位置（最新）", with a link that opens Google Maps. "未取得" (not acquired) means the tablet has not granted location permission or cannot get a GPS fix. The dedicated app (v0.5.0+) shows the location permission dialog on first use.

## Floor maps

Open via the **フロアマップ** (Floor map) button at the top right of the list. Choose a factory, then each floor (level / area) tab shows its map with device pins. Pin colors follow the online status, and the name of the logged-in user is shown too.

In edit mode (toggle switch) you can:

- **Drag** pins to move them (positions are saved automatically).
- Click an unplaced device in the sidebar to drop it at the center, then drag to adjust.
- Remove a pin with **解除** (Unpin) on a placed device.
- **Add, rename, and delete** floors (a floor with placed devices cannot be deleted).
- Upload or replace the **floor drawing image** (PNG / JPG / WEBP / SVG, up to 10MB).

## Related pages

- Issuing and assigning login QR cards: see [QR Card Management](/docs/system/kiosk-cards).
- Setting up the tablet itself (APK, kiosk lock, auto-update): see [Kiosk Device Setup](/docs/system/kiosk-device-setup).
