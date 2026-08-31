---
title: "Displays (Devices) — how to use"
description: "The \"Displays\" tab of Devices (SY09). Decides what each shop-floor TV shows. Registration follows the same three steps as a shared tablet (create, link, activate); assigning content and stopping a screen need no visit to the machine."
---

The **"Displays" tab of Devices (SY09)**. Decides what each shop-floor TV shows.

It sits alongside shared tablets because both are equipment installed at a site,
and the registration steps are the same (create, link, activate).

> This app is currently published on the **test environment (dev) only**. Screens
> and steps may still change before it goes live.

> This app requires the **shared-device management** permission. **Linking**,
> **activating** and **revoking** are privileged operations — they work only for the period another
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
- **Link code** … 12 characters shown on the TV. Same format as a shared
  tablet's, so it is read the same way.

## Before you start

- Set the TV side up first — see
  [Setting up a display (Raspberry Pi)](/admin-manual/en/system/display-setup).
- It helps to create at least one **content** first, so you can choose it while
  creating the display.

## Display states

| State | Meaning |
|---|---|
| Awaiting link | Created, but not yet tied to a TV |
| Awaiting activation | Tied to a TV. Press "Activate" to start showing |
| Active | Normal |
| Disabled | Stopped from here. The TV shows the link screen |
| Revoked | Registration cancelled. Register again to reuse it |

Online / offline is separate from the state — it means whether the screen has
answered within the last 5 minutes.

## Registering a display (three steps)

Exactly the same as a shared tablet.

1. **Create** — "Add a display", then set the name, location, site and content.
   It is not tied to a TV yet (awaiting link).
2. **Link** — type the 12-character link code shown on the TV, from "Link" in
   the list.
3. **Activate** — press "Activate" and the TV starts showing.

Step 1 can be done before the TV is ready, leaving only linking and activating
for the site visit.

> ⚠️ The link code expires after **10 minutes**. If that happens, press
> "Issue a new code" on the TV to get a fresh one.

## Matching the screen size (display scale)

How large text needs to be depends on the TV and how far away people stand.
A 43-inch screen at arm's length and a 65-inch screen 10 m away are not the same.

1. Press the display in the list.
2. On the "Settings" tab, use "Display scale" — press Smaller / Normal / Larger,
   or use the slider for finer steps (50–200%).
3. Press "Save".

The TV changes immediately. **Adjust while looking at the wall** — there is no
single correct percentage.

> 💡 A larger scale makes each row bigger, so fewer fit on one screen. The rest
> move to the next page automatically; nothing is dropped.

## Switching what a display shows

1. Press the display in the list.
2. On the "Settings" tab, choose a different content.
3. Press "Save".

The TV changes immediately. **You do not need to go to the machine.**

## Creating content

Use "Content" from the list to create and edit what can be shown.

| Type | What it shows |
|---|---|
| App page | A screen from this system (choose from the list below) |
| Dashboard | A Metabase dashboard |
| External page | A page at a URL you give |
| Image | A single image |

App pages and their settings:

| Screen | What it shows | Settings |
|---|---|---|
| Production status | Work orders in progress, current step, assignees | Site / rows / include not-started |
| Pending arrangements | Order lines with no work order yet, by delivery date | Site / rows / days ahead / overdue only |
| Shipping schedule | Delivery orders not yet shipped | Site / rows / days ahead |
| Quality | Recent defects counted by type | Site / rows / days back |
| Announcement | A message shown large | Text / style (normal, caution, alert) / clock |

Every setting is a choice — there is no special format to type.

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
| Swap the hardware | "Unlink" on the detail page | Name and content are kept |
| Stop using it | "Revoke" on the detail page | Needs registering again |
| Remove the record | Revoke (or unlink), then "Delete" | No |

**After revoking, the TV returns to the link screen on its next load.** You
can carry it elsewhere and reuse it. Use the same action if a display is broken
or lost — nothing more can be seen on it.

## Questions

**Q. A display stays offline**
A. Check the power and LAN cable at the TV and the Raspberry Pi. It returns to
online by itself once it can reach the network.

**Q. It says no content is assigned**
A. Nothing has been chosen for that display. Open it, choose a content and
press Save.

**Q. Linking says the code was not found or has expired**
A. Use the fresh code now shown on the TV.

**Q. Can several TVs show the same thing?**
A. Yes. Assign the same content to them. Changing that content switches all of
them at once.
