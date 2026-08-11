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

## Updating devices (automatic)

The app **updates itself**. It checks for a new release about once an hour and applies it with an automatic restart at night (1:00–6:00 AM) so work is never interrupted (an update found right after app start is applied immediately). Just release a new APK — no work on the tablets is needed.

- Locked kiosk devices: fully automatic (no dialog)
- Unlocked test tablets: the OS shows an install confirmation dialog — tap Install

> Only devices still running a pre-self-update version (v0.2.x or older) need the old methods: `adb install -r` over USB, or factory-reset and re-scan the new QR.
