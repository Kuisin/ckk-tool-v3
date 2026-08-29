---
title: "Kiosk Device Setup"
description: "Distribution and enrollment manual for the shared plant-floor tablets (kiosk devices). For administrators. QR cards a…"
---
Distribution and enrollment manual for the shared plant-floor tablets (kiosk devices). For administrators. QR cards are issued in QR Card Management (SY08); devices are managed in Device Management (SY09).

## The dedicated app (APK)

Each tablet runs a dedicated Android app. The latest APK is always served at:

- Production: `https://ckk-kiosk.kai-lab.net/apk/ckk-kiosk.apk`
- Development: `https://ckk-kiosk-dev.kai-lab.net/apk/ckk-kiosk-dev.apk`

## Enrolling a new device (QR provisioning)

Configure a freshly plant-reset tablet as a dedicated kiosk device — no cable, no PC.

1. Plant-reset the tablet
2. On the setup "Welcome" screen, **tap 6 times** (a QR scanner opens)
3. Connect to Wi-Fi and scan the provisioning QR below
4. The APK downloads and installs automatically, and the device locks into kiosk mode

> **Pre-installed apps (bloatware) are disabled automatically.** These tablets are dedicated to the business app, so the manufacturer's pre-installed apps are disabled during registration (those that appear in the launcher). Everything needed for the keyboard, the display, auto-update and the maintenance 「設定を開く」 is kept, so operation is unaffected.
>
> This applies **only to devices newly registered with this procedure**. To clean up a device already in service, factory-reset it and repeat these steps.

**Production QR:**

![Production provisioning QR](https://ckk-kiosk.kai-lab.net/apk/provisioning-prod.png)

**Development QR:**

![Development provisioning QR](https://ckk-kiosk-dev.kai-lab.net/apk/provisioning-dev.png)

> The QR is bound to the APK checksum and updates automatically with every release. If you print it, always use the latest QR from this page after a release.

## Linking and activating the device (SY09)

Once the app starts, register the device with the system.

1. Create a device profile in Device Management (SY09)
2. The tablet shows a link code (QR), valid for 10 minutes
3. Scan or type that code in SY09 to link it to the profile
4. **Activate** the linked device — QR-card login is now available on the tablet

## Installing on an unlocked tablet (for testing)

To try the app without kiosk lock, open the APK URL in Chrome on the tablet, allow installs from the source, and install.

## Connection indicator (dot at the top right of the header)

The kiosk header shows a connection-status dot at the top right (tap it for a description).

- **Gray**: no connection (the server is unreachable)
- **Red**: the server is reachable but the device is not linked
- **Orange**: linked, but running in a plain browser (no dedicated-app hardware key)
- **Green**: connected through the dedicated app (hardware key)
- **Blinking orange/green**: the connection is unstable (recent communication failures)

The check probes the kiosk URL itself, so **no internet access is required** — it works as-is when the URL resolves inside the LAN.

## Offline mode

When the server becomes unreachable, the web UI switches to a full-screen "cannot connect" view and returns automatically once the connection recovers. The dedicated app (v0.4.0+) also shows an in-app offline screen when the page itself fails to load, and reloads automatically as soon as the server is reachable again. No action is needed on the tablet.

## Always-on display (clock, battery, connection)

The kiosk runs full-screen with the OS status bar hidden, so the app header always shows the **connection dot, battery level, and current time** at the top right. The battery shows a green bolt while charging and turns red below 15%. The UI is always dark-themed.

## Screen sleep (kept awake while charging)

- **Dedicated app**: the screen stays on whenever the app is showing
- **Browser use**: the screen is kept awake **only while charging** (on battery it sleeps per OS settings)

## Changing Wi-Fi (network)

Even while kiosk-locked, an administrator can temporarily lift the lock to open Android Settings:

1. **Tap the top-right corner 5 times within 3 seconds** (the maintenance dialog opens)
2. Enter the **admin PIN** and tap **設定を開く** (Open Settings) — the PIN is **shared by all devices and auto-rotates daily at 4:00**; check it on the device detail page in Device Management (SY09) under "PIN・設定コード" (revealing is audit-logged)
3. Android Settings opens — **change the Wi-Fi**
4. Return to the app (back button etc.) and it **re-locks automatically**

> The BOTTOM-LEFT 5-tap is a different feature (device settings, unlocked with the 6-digit settings code). Network changes use the **top right**.

## Recovering a device the PIN no longer opens

On a device that has lost Wi-Fi, the procedure above can stop working. **The device keeps the PIN locally and cannot receive a new one while offline**, so the current PIN shown in SY09 will not open it. Work down this list — each step costs more than the one above it.

### 1. Look up the PIN that device is holding

SY09 → device detail → "PIN・設定コード" → 「**この端末が保持している PIN**」 → 表示 (Show). It shows the number **last handed to that device**. Enter that.

If 「**最終同期**」 reads 「**未同期**」 (never synced), the device has never received a number. The server has none for it — it is still on the PIN **built into the APK**. Check `KIOSK_UNLOCK_PIN` in `~/.gradle/gradle.properties` on the build Mac (`246810` if unset).

### 2. Connect over USB and fix the Wi-Fi (no PIN needed)

Kiosk lock only pins the **screen** (Lock Task); it does not close USB debugging — the app sets no user restrictions such as `DISALLOW_DEBUGGING_FEATURES`. If USB debugging was enabled at provisioning, it is still enabled.

```bash
~/Library/Android/sdk/platform-tools/adb devices -l
```

- `device` — continue
- `unauthorized` — on the tablet, accept "Allow USB debugging?" (tick *Always allow from this computer*). If no dialog appears, unplug and replug — it only fires on connect
- nothing at all — most likely a **charge-only cable**. Swap for one that carries data

Once connected you can fix the Wi-Fi without any PIN:

```bash
~/Library/Android/sdk/platform-tools/adb shell svc wifi enable
~/Library/Android/sdk/platform-tools/adb shell cmd wifi connect-network "SSID" wpa2 "PASSWORD"
~/Library/Android/sdk/platform-tools/adb shell cmd wifi status
```

Use `open` instead of `wpa2 "PASSWORD"` for an open network. Once it associates the device heals itself — the PIN updates on the next sync.

On a debug build you can also read the PIN it is holding:

```bash
~/Library/Android/sdk/platform-tools/adb shell run-as jp.co.ckk.kiosk.dev \
  cat /data/data/jp.co.ckk.kiosk.dev/shared_prefs/kiosk.xml
```

Look for `<string name="unlock_pin">`. `not debuggable` / `unknown package` means a release build — not available. No `unlock_pin` line means it never synced.

### 3. Force a factory reset (last resort)

> ⚠️ **This is the last resort. Do not rush it.** A reset cannot be undone, and with re-provisioning (QR + unlink/re-link in SY09) it is half a day of work. **Always try 1 and 2 first** — swapping the cable or trying three PINs fixes this more often than not.

#### When a reset is justified

Reset **only when all of these hold**:

- The PIN from 「この端末が保持している PIN」 does not open it (and if 未同期, the build-time PIN failed too)
- **Even with a known-good data cable**, `adb devices` shows nothing, or stays `unauthorized` with no consent dialog appearing on the tablet
- There is no prospect of getting the device back on Wi-Fi (no way to recreate the old SSID, e.g. via a hotspot)

**When NOT to reset — or not yet:**

| Situation | Do this first |
|---|---|
| `adb devices` shows `unauthorized` | Accept the dialog on the tablet (replug to re-show it). USB debugging is alive |
| `adb devices` shows nothing | **Suspect a charge-only cable.** Swap it |
| Device is still online, or can be | Recreate the old SSID so it auto-joins. Once online the PIN updates itself |
| Google account status unknown | **Check first.** See FRP below |
| You just don't know the PIN | Use 「この端末が保持している PIN」 / 「履歴」 in SY09 |

#### Check before you commit

**Was a Google account ever added to this device?** If so, Factory Reset Protection demands that account after the wipe, and **the device is unusable** if nobody knows it. Device-owner provisioning requires no accounts, so normally there is none — but confirm rather than assume.

You lose only the device token, the attestation key, and the PIN cached on the device. Sessions, activity history and audit logs live on the server and survive.

1. **Unplug the USB cable** (charging sends it to a charge screen instead)
2. Power off (long-press → power off; the power menu works even in kiosk mode)
3. From fully off, hold **Volume Up + Power** for ~10 seconds until it vibrates → boot menu
4. **Scroll the menu with the volume keys** and look for **Recovery Mode**. If present, select it and skip to step 6

**If there is no Recovery entry and you only see "enter meta mode" / "enter fastboot mode"** (MediaTek devices such as the TB330FU):

> **Do not choose META mode** — it is a factory diagnostic mode, not what you want.

5. Choose **enter fastboot mode**, connect USB, then:

   ```bash
   ~/Library/Android/sdk/platform-tools/fastboot devices        # shows <serial> fastboot
   ~/Library/Android/sdk/platform-tools/fastboot reboot recovery # or: fastboot oem reboot-recovery
   ```

   Fastboot needs **no adb consent dialog**, so this works even when step 2 was stuck at `unauthorized`.

   > **Do not run `fastboot -w` and do not unlock the bootloader.** `-w` fails while locked, and unlocking wipes the device and can trip FRP.

6. Recovery boots to an Android robot with **"No command"**. This is not an error. **Hold Power and tap Volume Up once**, then release — the menu appears
7. Select **Wipe data / factory reset**

> Boot-menu key combinations vary by model. If Volume Up + Power does nothing, try **Volume Down + Power**, or both volume keys with Power.

### 4. Re-registering after a reset

**1. Reinstall the app.** Repeat "Registering a new device (QR provisioning)" above. On the fresh Welcome screen **tap the same spot 6 times** → QR scanner → join Wi-Fi → scan the QR. APK install and device-owner setup complete automatically. No cable needed — which matters if the cable was the problem.

**2. Open the setup screen.** When the app starts it has no device cookie, so it **redirects to the registration screen automatically** (showing a link code and QR). If it is stuck elsewhere, open the address directly:

| Environment | URL |
|---|---|
| dev | `https://ckk-kiosk-dev.kai-lab.net/setup` |
| production | `https://ckk-kiosk.kai-lab.net/setup` |

The screen shows a 12-character link code and a QR. It **expires after 10 minutes** — reload the page to issue a new one.

**3. Reopen the profile in SY09.** Open the device in Device Management (SY09) and press 「**リンク解除**」 (Unlink). It returns to PENDING (open) and **keeps its name, plant and floor-map pin** (creating a new profile instead would mean placing the pin again — always unlink). Only PENDING profiles can be linked.

**4. Link and activate.** In SY09 enter the tablet's link code (or scan its QR) → LINKED → press 「**有効化**」 (Activate) → ACTIVE. The tablet detects this by polling, issues its own device token and enters the kiosk screen.

**5. Verify.** On the SY09 device detail page:

- 「**最終同期**」 is populated — this device is now receiving PINs (if it stays 未同期, you will end up here again)
- 「**この端末が保持している PIN**」 matches the current PIN

If you rebuild the APK, set `KIOSK_UNLOCK_PIN` in `~/.gradle/gradle.properties` to an intended value now (never ship the default).

## When the camera (QR scan) will not start

If the QR scan screen shows 「**カメラを起動できません。カメラ権限と HTTPS 接続を確認してください。**」 (Cannot start the camera. Check camera permission and the HTTPS connection.), work through these in order.

### First, get the app up to date

**An old app causes this.** On the SY09 device detail page, if 「プロファイル取得」 is blank and 「鍵フィンガープリント」 reads 未束縛, that device is running an app **older than v0.6.0**.

The app auto-updates (checks roughly hourly, applies at night), so first check whether **the published APK itself is stale**. If the published build is old, factory-resetting and re-registering the device just installs the same old app again.

### Camera permission

As device owner the app **grants itself camera permission**, so normally nothing is asked. If it did ask and 「Don't allow」 was chosen, go through maintenance (5 taps top-right → PIN → 「設定を開く」) to Android Settings → Apps → Permissions → Camera and set it back to Allow.

### Is it served over HTTPS?

The camera **only works over https** (a browser rule). Opening the LAN address (`*.ckk-tools.loc`) over **http** will not start the camera. Use the public address (`ckk-kiosk.kai-lab.net` / `ckk-kiosk-dev.kai-lab.net`), or the **https** LAN address with the internal CA installed.

### When the camera switcher is missing

If the camera is showing but the gear (camera selection) is not, there used to be a bug where **a failure to list cameras turned into an error message and also removed the switcher** (reproduced on a TB330FU). This is fixed — update the app first.

If it is still missing after that, the device has only one camera and there is nothing to switch to. **The gear only appears when there are 2 or more.**

### If it still fails

Another app can hold the camera open. **Reboot** the device and try again. If it still fails after a reboot, suspect the camera hardware and swap the device.

## Updating devices (automatic)

The app **updates itself**. It checks for a new release about once an hour and applies it with an automatic restart at night (1:00–6:00 AM) so work is never interrupted (an update found right after app start is applied immediately). Just release a new APK — no work on the tablets is needed.

- Locked kiosk devices: fully automatic (no dialog)
- Unlocked test tablets: the OS shows an install confirmation dialog — tap Install

> Only devices still running a pre-self-update version (v0.2.x or older) need the old methods: `adb install -r` over USB, or plant-reset and re-scan the new QR.
