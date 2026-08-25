---
title: "User Management — User Manual"
description: "Operation code SY01. A directory of every user registered in the system, where you can review each user's role assign…"
---
Operation code **SY01**. A directory of every user registered in the system, where you can review each user's role assignments, effective permissions, and assigned plants.

> This app requires **system permission**. Users cannot be created, edited, or deleted from this screen, and roles cannot be changed. The one exception is **assigned plants**, which only system administrators (`system:ADMIN`) can edit (changes are recorded in the audit log).

## What you can do here

- Browse all users in a list, with search and filters.
- Open a user's detail page to see their assigned roles (including history).
- Check the user's **effective permissions** (permission code × action × scope) — what they can actually do right now.
- Review the **assigned plants** (what PLANT / REGION scopes apply to); system administrators can edit them.

## Opening it

- Home (System) → **ユーザー管理 (User Management)**, or type `SY01` in the search box.

## List and search

The list shows the following columns.

- **Username** — the login ID (monospace).
- **Display name** — the name shown on screen.
- **Email** — the registered email address ("—" when none).
- **Group** — a **System** / **Employee** / **Guest** badge.
- **Roles** — badges for the currently active roles (multiple allowed).
- **Status** — **Active** / **Inactive**.
- **Last login** — when the user last logged in.

The search box matches username, display name, email, and role name. The **group** and **status** selects narrow the list, and **Reset** clears every filter. Click a row to open the detail page.

## User detail

The detail page has four blocks.

- **Summary** — username, group, email, login method (**password + SSO** or **SSO only**), last login, and employee ID.
- **Role assignments** — the assignment history: role name, rolename (internal system name), status (active/inactive), assigned date, and deactivation date. Past, deactivated assignments are also shown.
- **Assigned plants** — the plants that "plant" / "region"-scoped permissions apply to. System administrators (`system:ADMIN`) see a select box and a save button and can edit this block only (`updateUserPlants` — changes are recorded in the audit log). Everyone else sees badges only.
- **Effective permissions** — a list of the grants coming through active roles: what this user can do right now. For each permission code (e.g. `quote`, `master`, `system`) it shows the action (READ / CREATE / UPDATE, …) and the scope.

## How to read effective permissions

- Permissions belong to roles, and a user can hold several roles.
- The list shows **every grant row (role × permission × action)**. The same permission code and action can appear more than once, coming from different roles — that is not an anomaly (actual access is resolved by the app as the **union** of all rows — e.g. with both PLANT and ALL, the result is equivalent to ALL).
- The scope is the range the action covers (ALL = everything, PLANT = assigned plants, OWN = own data, and so on). The plants that PLANT / REGION resolve against are set in the "Assigned plants" block.

## FAQ

- **I want to add or edit a user** — not possible on this screen. User records are managed via synchronization with the company directory (AD) and by system administrators.
- **I want to change roles** — this screen is for review only. Role assignment changes are made by a system administrator.
- **Permissions look wrong** — check "Effective permissions" on the detail page. All grant rows from every role are listed, and actual access is their union. If someone has a "plant" / "region"-scoped permission but sees no data, also check that their "Assigned plants" is not empty.
- **I want to change someone else's language or date display** — not possible from this screen. Language, date/time format and time zone are personal settings that **only the user themselves** can change, from **Display Settings** in the avatar menu (web) or the kiosk launcher (tablet). The language setting is shared between the web app and the kiosk.
- To see who changed what and when, use the [Activity Log](/admin-manual/en/system/activity-log).
- For app visibility ON/OFF, see [App Management](/admin-manual/en/system/app-management).
