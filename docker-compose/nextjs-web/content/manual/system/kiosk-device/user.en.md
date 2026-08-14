---
title: "Device Management — User Manual"
description: "Operation code SY09. Register and manage the shared plant-floor tablets (kiosk devices): linking, activation, floor-map placement, and usage history."
screenshots: [kiosk-devices-01]
---
Operation code **SY09**. Register and manage the shared plant-floor tablets (kiosk devices): linking, activation, floor-map placement, and usage history.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Create device profiles, then **link** and **activate** tablets.
- Edit device info (name, plant, location), disable / re-enable, unlink, and revoke devices.
- Place device pins on the **floor map** and view online status.
- Review usage history (who used a device, and when).

This app requires the **kiosk management (kiosk) permission**.

## Device statuses

- **Awaiting link** … only the profile exists; no tablet is linked yet.
- **Awaiting activation** … a tablet is linked and the device is waiting to be activated.
- **Active** … usable as a kiosk.
- **Disabled** … temporarily stopped. Restore with "Re-enable".
- **Revoked** … permanently disabled. **Cannot be undone.**

## Registering a device (link → activate)

Registration is profile-first. For preparing the tablet itself (installing the dedicated app, etc.), see the internal documentation.

1. Use **Create device profile** and enter the device name, plant, and location (optional). The status becomes "Awaiting link".
2. The tablet's setup screen shows a **12-character link code** (with QR, **valid for 10 minutes**).
3. Use the row action **Link device** and type the code, or **scan the QR with a camera**. On success the status becomes "Awaiting activation".
4. Press **Activate** — the status becomes "Active" and the tablet detects it automatically and switches to the login screen.

If the code has expired, have the tablet show a new one and retry. Only "Awaiting link" profiles can be linked, and only "Awaiting activation" devices can be activated.

## Reading the list

- Columns: **Device name** / **Location** / **Plant** / **Status** / **Linked** (link timestamp; "Not linked" before linking) / **Online** / **User** / **Last activity** / **Activated by**.
- **Online** … the connection state of active devices as a green / gray dot. It normally updates live; when a live connection is unavailable it falls back to a 30-second refresh or to activity within the last 5 minutes.
- **User** … the user currently logged in on the device.
- Search by device name, location, or plant, and filter by plant and status. Clicking a row opens the **device detail** with recent users and usage history.

![Device Management list](../../assets/screenshots/kiosk-devices-01.png)

## Editing

- **Edit** changes the device name, plant, and location. **Changing the plant removes the device's pin from the floor map** (maps are per plant).

## Replacing and stopping devices

- **Unlink** … detaches the tablet from its profile and returns it to "Awaiting link". The name, plant, location, and map pin are kept; the device's sessions and credentials are destroyed. Use this when replacing a broken tablet, then re-link the new tablet to the same profile.
- **Key reset** … an operation used after replacing or factory-resetting a tablet; it resets the device app's registration so the device registers anew on its next connection.
- **Disable / Re-enable** … temporarily stop / resume use. A disabled device cannot be used as a kiosk.
- **Revoke** … permanently disables the device. **Cannot be undone.** Open sessions are terminated. To use the tablet again, register it from a new profile.
- **Delete** … only profiles that have never been linked ("Awaiting link") can be deleted.

## Floor map

Open it via **Floor map** at the top right of the list. Pick a plant to see per-floor tabs with the map and device pins. Pin colors follow online status (online = green / offline = gray), and the logged-in user's name is shown. Storage-location pins placed in the storage location app (MS0E) are also shown read-only.

In edit mode (switch) you can:

- **Drag** pins to move them (positions save automatically).
- Click an unplaced device in the sidebar to drop it at the center, then drag it into place.
- Remove a placed device's pin with **Remove pin**.
- **Add, rename, and delete floors** (a floor with devices placed on it cannot be deleted).
- Upload or replace the **floor drawing** (PNG / JPG / WEBP / SVG).

## FAQ

- **The link code is rejected** … Codes are 12 characters and valid for 10 minutes. If expired, have the tablet display a new one. Only "Awaiting link" profiles can be linked.
- **A device never shows as online** … Check that the device is "Active" and connected to the network. The indicator is derived from recent activity, so it can take a moment to update.
- For issuing and assigning login QR cards, see [QR Card Management](/manual/en/system/kiosk-card/user). For the apps shown on the kiosk and the authentication policy, see [Kiosk Settings](/manual/en/system/kiosk-settings/user). For detailed tablet setup steps, see the internal documentation.
