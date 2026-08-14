# User Management — User Manual

Operation code **SY01**. A **read-only** directory of every user registered in the system, where you can review each user's role assignments and effective permissions.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

> This app requires **system permission**. Users cannot be created, edited, or deleted from this screen (view only).

## What you can do here

- Browse all users in a list, with search and filters.
- Open a user's detail page to see their assigned roles (including history).
- Check the user's **effective permissions** (permission code × action × scope) — what they can actually do right now.

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

The detail page has three blocks.

- **Summary** — username, group, email, login method (**password + SSO** or **SSO only**), last login, and employee ID.
- **Role assignments** — the assignment history: role name, rolename (internal system name), status (active/inactive), assigned date, and deactivation date. Past, deactivated assignments are also shown.
- **Effective permissions** — the aggregate of all active roles: what this user can do right now. For each permission code (e.g. `quote`, `master`, `system`) it shows the action (READ / CREATE / UPDATE, …) and the scope.

## How to read effective permissions

- Permissions belong to roles, and a user can hold several roles.
- When the same permission and action come from multiple roles, **only the widest scope** is shown (e.g. with both PLANT and ALL, only ALL appears).
- The scope is the range the action covers (ALL = everything, PLANT = own plant, OWN = own data, and so on).

## FAQ

- **I want to add or edit a user** — not possible on this screen. User records are managed via synchronization with the company directory (AD) and by system administrators.
- **I want to change roles** — this screen is for review only. Role assignment changes are made by a system administrator.
- **Permissions look wrong** — check "Effective permissions" on the detail page. Multiple roles are aggregated and only the highest scope per action applies.
- To see who changed what and when, use the [Activity Log](/docs/system/activity-log).
- For app visibility ON/OFF, see [App Management](/docs/system/app-management).
