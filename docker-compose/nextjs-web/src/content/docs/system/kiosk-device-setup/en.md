# Kiosk Device Setup

Distribution and enrollment manual for the shared factory-floor tablets (kiosk devices). For administrators. QR cards are issued in QR Card Management (SY08); devices are managed in Device Management (SY09).

## The dedicated app (APK)

Each tablet runs a dedicated Android app. The latest APK is always served at:

- Production: `https://ckk-kiosk.kai-lab.net/apk/ckk-kiosk.apk`
- Development: `https://ckk-kiosk-dev.kai-lab.net/apk/ckk-kiosk-dev.apk`

## Enrolling a new device (QR provisioning)

Configure a freshly factory-reset tablet as a dedicated kiosk device — no cable, no PC.

1. Factory-reset the tablet
2. On the setup "Welcome" screen, **tap 6 times** (a QR scanner opens)
3. Connect to Wi-Fi and scan the provisioning QR below
4. The APK downloads and installs automatically, and the device locks into kiosk mode

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
2. Enter the **admin PIN** and tap **設定を開く** (Open Settings) — the PIN is the `KIOSK_UNLOCK_PIN` set at build time
3. Android Settings opens — **change the Wi-Fi**
4. Return to the app (back button etc.) and it **re-locks automatically**

> The top-LEFT 5-tap is a different feature (device settings, unlocked with the 6-digit settings code). Network changes use the **top right**.

## Updating devices (automatic)

The app **updates itself**. It checks for a new release about once an hour and applies it with an automatic restart at night (1:00–6:00 AM) so work is never interrupted (an update found right after app start is applied immediately). Just release a new APK — no work on the tablets is needed.

- Locked kiosk devices: fully automatic (no dialog)
- Unlocked test tablets: the OS shows an install confirmation dialog — tap Install

> Only devices still running a pre-self-update version (v0.2.x or older) need the old methods: `adb install -r` over USB, or factory-reset and re-scan the new QR.
