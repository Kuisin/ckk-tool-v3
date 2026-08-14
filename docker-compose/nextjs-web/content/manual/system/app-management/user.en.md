---
title: "App Management — User Manual"
description: "Operation code SY05. Toggles each app's visibility per environment (dev = staging / main = production). A single switch publishes or hides an app."
screenshots: [settings-apps-01]
---
Operation code **SY05**. Toggles each app's visibility per environment (**dev** = staging / **main** = production). A single switch publishes or hides an app.

## What you can do with this app

- Review the full list of apps registered in the system, with category and operation code.
- Toggle each app's **dev (staging)** and **main (production)** switches independently.
- Search by app name or operation code, and filter by category.

This app requires the **system permission** (toggling requires the update action). Changes take effect immediately for all users.

## How to open

- Home (System) → **App Management**, or type `SY05` in the search box.

## How environments work

Visibility is managed per environment, and the default behavior differs.

- **dev (staging)** … visible **by default**. Only apps explicitly turned OFF are hidden.
- **main (production)** … hidden **by default**. **Only apps explicitly turned ON are visible.** This keeps the production launcher limited to published apps.

In other words, **turning the main switch ON is itself the production release**. Before flipping it, confirm the app has been sufficiently verified on dev. Apps whose main switch is OFF are shown in the dev environment with an "unreleased (DEV)" ribbon.

## What happens when an app is OFF

- The app disappears from the launcher, the home screen, and operation code search.
- Direct URL access is also blocked (screen guard).
- No data is deleted. Turn it back ON and the app works as before.

## Reading the list

- **Category** … a badge: Sales / Purchasing / Production / Shipping / Billing / Master / Documents / System.
- **App** … the app name.
- **Operation code** … the jump code such as `SA02` (monospaced).
- **dev (staging)** / **main (production)** … the per-environment visibility switches.

Toggling shows an "Enabled / Disabled" notification and takes effect immediately. If it fails, the switch reverts and an error is shown.

![App Management list with per-environment switches](../../assets/screenshots/settings-apps-01.png)

## Change records

Every ON/OFF operation is written to the audit log. In the [Activity Log](/manual/en/system/activity-log/user) (target "App Management") you can see who toggled which app, in which environment, and when.

## FAQ

- **I want to publish a new app to production** … Once it is verified on dev, turn the app's **main (production)** switch ON.
- **I want to hide an app temporarily for maintenance** … Turn OFF the switch for that environment. Data is untouched; turn it back ON to resume.
- **I want to add an app to the list** … The list is generated from the system's built-in app registry. Adding an app requires development work.
- Per-user permissions can be reviewed in [User Management](/manual/en/system/user-management/user).
