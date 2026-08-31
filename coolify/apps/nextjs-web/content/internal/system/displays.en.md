---
title: "Displays — how to use"
description: "Operation code SY0I. Decides what each shop-floor TV (managed display) shows. Pair a screen, assign content, disable or revoke it — all without going to the machine."
---

Operation code **SY0I**. Decides what each shop-floor TV shows.

> This app is currently published on the **test environment (dev) only**. Screens
> and steps may still change before it goes live.

> This app requires the **shared-device management** permission. **Pairing** and
> **revoking** are privileged operations — they work only for the period another
> person has approved (Privileged access, SY0G). Every action is recorded in the
> audit log.

## What you can do here

- See every shop-floor TV in one list (where they are, and which are on)
- Decide what each TV shows
- Switch what is shown later, without touching the TV
- Disable or revoke a screen you no longer use

## Words used on this page

- **Display** … One TV on the shop floor.
- **Content** … A setting for "what to show". One content can be shared by
  several TVs.
- **Registration code** … 12 characters shown on the TV, used to identify which
  screen you are pairing.

## Before you start

- Set the TV side up first — see
  [Setting up a display (Raspberry Pi)](/admin-manual/en/system/display-setup).
- It helps to create at least one **content** first, so you can choose it while
  pairing.

## Display states

| State | Meaning |
|---|---|
| Online | Reachable now (seen within the last 5 minutes) |
| Offline | Powered off, or the network is down |
| Active | Normal |
| Disabled | Stopped from here. The TV shows the pairing screen |
| Revoked | Registration cancelled. Pair it again to reuse it |

## Pairing a display

1. Check that the TV is showing a QR code and a 12-character code.
2. Scan the QR code with your phone camera.
   (From a PC, press "Pair a display" instead.)
3. Check the 12 characters are filled in. If not, type them.
4. Enter a name people on the floor will use.
5. Choose the location, site and content.
6. Press "Register".

The TV changes within a few seconds.

> ⚠️ The registration code expires after **10 minutes**. If that happens, press
> "Issue a new code" on the TV to get a fresh one.

## Switching what a display shows

1. Press the display in the list.
2. On the "Settings" tab, choose a different content.
3. Press "Save".

The TV changes immediately. **You do not need to go to the machine.**

## Creating content

Use "Content" from the list to create and edit what can be shown.

| Type | What it shows |
|---|---|
| App page | A screen from this system, such as production status |
| Dashboard | A Metabase dashboard |
| External page | A page at a URL you give |
| Image | A single image (notices, safety alerts) |

"Reload interval (seconds)" is how often the display re-reads what it shows.
Set it to `0` and it will only change when you change it here.

> ⚠️ Content that is in use cannot be deleted. Reassign the displays using it
> first.

### When showing a dashboard

The analytics tool needs setting up too. For each dashboard, enable embedding
and **set the site and line filters to "locked"**. Without locking, a shop-floor
screen could be made to show another site's data. Ask the IT team how.

## Disabling and revoking

| What you want | How | Reversible |
|---|---|---|
| Stop it for now | "Disable" on the detail page | Yes, press "Enable" |
| Stop using it | "Revoke" on the detail page | Needs pairing again |
| Remove the record | Revoke, then "Delete" | No |

**After revoking, the TV returns to the pairing screen on its next load.** You
can carry it elsewhere and reuse it. Use the same action if a display is broken
or lost — nothing more can be seen on it.

## Questions

**Q. A display stays offline**
A. Check the power and LAN cable at the TV and the Raspberry Pi. It returns to
online by itself once it can reach the network.

**Q. It says no content is assigned**
A. Nothing has been chosen for that display. Open it, choose a content and
press Save.

**Q. Pairing says the code has already been used**
A. That code was already paired. Use the fresh code now shown on the TV.

**Q. Can several TVs show the same thing?**
A. Yes. Assign the same content to them. Changing that content switches all of
them at once.
