---
title: "User Management — User Manual"
description: "Operation code SY01. A read-only directory of every user in the system, showing each user's role assignments, assigned plants, and effective permissions."
screenshots: [settings-users-list-01, settings-users-detail-01]
---
Operation code **SY01**. A **read-only** directory of every user registered in the system, showing each user's role assignments, assigned plants, and effective permissions.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do with this app

- Browse all users in a list with search and filters.
- On each user's detail page, review role assignments (including history), assigned plants, and the user's **effective permissions** (permission code × action × scope).

This app requires the **system permission**. It is essentially read-only — users cannot be created, edited, or deleted from this screen (user records are managed by synchronization with the company identity directory). The one exception is **assigned plants**, which only administrators with the system admin action can edit.

## How to open

- Home (System) → **User Management**, or type `SY01` in the search box.

## List and search

The list shows the following columns.

- **Username** … the login ID (monospaced).
- **Display name** … the name shown on screens.
- **Email** … the registered email address ("—" if none).
- **Group** … a badge: **System** / **Employee** / **Guest**.
- **Roles** … badges for the assigned roles (multiple allowed).
- **Status** … **Active** / **Inactive**.
- **Last login** … the last login timestamp ("—" if the user has never logged in).

The search box matches username, display name, email, and role names. Narrow the list with the **Group** and **Status** selects, and clear everything with **Reset**. Click a row to open the detail page.

![User Management list](../../assets/screenshots/settings-users-list-01.png)

## User detail

The detail page consists of a summary and three cards.

- **Summary** … username, group, email, **login method** (**password + SSO** or **SSO only**), last login, and employee ID.
- **Role assignments** … the assignment history: role name, rolename (internal name), status, assigned date, and deactivation date. Past (deactivated) assignments remain visible.
- **Assigned plants** … the plants targeted by PLANT / REGION scoped permissions. Normally shown as badges only; administrators with the system admin action see a plant picker and a Save button and can edit the assignment.
- **Effective permissions** … the permissions granted to this user via active roles. For each permission code (e.g. `quote`, `master`, `system`) the action (READ / CREATE / UPDATE / ADMIN, etc.) and scope are shown.

![User detail (role assignments, assigned plants, effective permissions)](../../assets/screenshots/settings-users-detail-01.png)

## Reading effective permissions

- Permissions belong to roles, and a user can hold multiple roles.
- The same permission and action may appear on multiple rows (when granted by more than one role). What the user can actually do is the **union** of all displayed rows.
- The scope is the range the operation covers (ALL = everything, PLANT = assigned plants, REGION = assigned region, OWN = the user's own data, etc.). When a PLANT / REGION scope is limited to specific plants, the plant codes are shown next to the scope.

## FAQ

- **I want to add or edit a user** … Not possible from this screen. Contact your system administrator.
- **I want to change roles** … This screen is view-only. Role assignment changes are made by system administrators.
- **A user's permissions look wrong** … Check the "Effective permissions" and "Assigned plants" cards on the detail page. PLANT / REGION scoped permissions cover nothing when no plants are assigned.
- To see who changed what and when, use the [Activity Log](/manual/en/system/activity-log/user). For app visibility ON/OFF, see [App Management](/manual/en/system/app-management/user).
