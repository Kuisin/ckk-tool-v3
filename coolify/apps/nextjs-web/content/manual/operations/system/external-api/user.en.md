---
title: "API Clients — User Manual"
description: "An app for issuing and managing the credentials (API clients) external systems use to read business data automatically."
---
This app creates and manages **API clients** — the credentials external systems use to **read business data automatically** through `/api/v1`. Its operation code is `SY0I`.

This app only creates an **identity**. **What that client can read** is decided by assigning roles in [User Management](/manual/en/operations/system/user-management/user) (`SY01`). Creating an identity and deciding what it can read are kept as separate operations, so each can be checked independently.

> ⚠️ This feature is currently available **only in the verification environment (dev)**. Bringing it to production (main) needs a separate change.

## What you can do with this app

- Create an API client (it starts **disabled**, with no token).
- Issue a **token** (the key used to connect) to a client. The raw value is only ever shown once, right after issuing it.
- **Activate** a client so it can actually connect.
- **Revoke** a token that is no longer needed, or **disable** a client entirely.
- Set the allowed **IP range** when creating a client.
- Check each client's **last used time**, **number of active tokens**, and **assigned roles**.

## Words used on this page

- **API client** … the identity an external system uses to connect to this system. It is an account for a machine (an external system), not a person.
- **Token** … the key (a string of characters) a client presents when connecting. The value itself is the credential.
- **Allowed IP range** … the range of source IP addresses that connections from that client are accepted from. Leave it empty for no restriction.
- **Role** … the assignment that decides what business data a client can read. It is assigned the same way as for an employee, in User Management (`SY01`).

## Before you start

- You need the **external API client management** permission (`api_client`) to use this app. If you cannot open it, please ask your system administrator.
- **Activating** a client and **issuing a token** each need their own approval in [Privileged Access](/manual/en/operations/system/privileged-access/user) (`SY0G`). Holding the permission alone is not enough to press these buttons.
- A client that has just been created can read nothing. **Activation, a token, and an assigned role** all have to be in place before an external system can read business data through it.

## How to open it

Press **API クライアント** (API Clients) inside 「システム」 (System) on the home screen. Or type `SY0I` into the search box at the top of the screen.

## Reading the screen

When you open the app, the registered clients are listed.

- **Name** … the client's name and, underneath it, the name of the system account behind it.
- **Status** … one of three: **Revoked** (red) / **Enabled** (green) / **Disabled** (gray). A newly created client shows "Disabled".
- **Roles** … the roles assigned to the client. If none are assigned, it shows an orange 「**ロール未割当**」 (No roles), and the client can read nothing.
- **Tokens** … the number of active tokens, shown as, for example, 「**1 / 2**」 against the cap of two.
- **Last used** … the date and time of the client's last connection. If it has never been used, it shows 「**未使用**」 (Never used).

On the right of each row are the 「**トークンを発行**」 (Issue token) and 「**有効化 / 無効化**」 (Enable / Disable) buttons.

If any client has an issued token, a separate **token list** appears below the client list. The raw token value is never shown there — only the last four characters, as `••••••ab3x`.

## Creating a client

1. Press 「**新規作成**」 (New) at the top right of the screen.
2. Enter a 「**名前**」 (Name) — required.
3. Write a 「**説明**」 (Description) explaining what it is for — optional.
4. Enter the 「**許可 IP 範囲**」 (Allowed IP ranges) as comma-separated CIDRs (for example, `10.0.0.0/8, 203.0.113.0/24`). Leave it empty for no restriction.
5. Press 「**保存**」 (Save).

The client starts **disabled**, with no token. Activating it and issuing a token each need separate approval.

> 💡 The allowed IP range can currently only be set **when creating** the client. Ask your system administrator if you need to change it afterward.

## Activating a client

While a client stays "disabled", an external system cannot connect through it even if it has a token.

1. First request 「**API クライアントの有効化**」 (Activate an API client) in [Privileged Access](/manual/en/operations/system/privileged-access/user) (`SY0G`) and get it approved.
2. In the list, press 「**有効化**」 (Enable) on the client you want.

Until approval is granted, the 「有効化」 (Enable) button cannot be pressed — it stays grayed out. Once approved, the moment you first press it within the approved period, the client becomes usable for the granted duration (see the [Privileged Access](/manual/en/operations/system/privileged-access/user) page for details).

Stopping a client with 「**無効化**」 (Disable) does **not** need approval. Anyone can disable a client immediately.

## Issuing a token

A token is the key a client presents when it actually connects.

1. First request 「**API トークンの発行**」 (Issue an API token) in [Privileged Access](/manual/en/operations/system/privileged-access/user) (`SY0G`) and get it approved.
2. In the list, press 「**トークンを発行**」 (Issue token) on the client you want.

Until approval is granted, the 「トークンを発行」 (Issue token) button cannot be pressed.

> ⚠️ Once issued, the raw token value is shown on screen **only once**. Closing that screen means it is gone for good — the raw value is never stored anywhere, not even in the database. **Be sure to copy it down right then.**

If you forget to copy it, it cannot be shown again. Revoke that token using the steps in "Revoking a token" below, and issue a new one.

**At most two tokens can be active per client** at a time — a cap that allows a no-downtime swap when replacing one. Trying to issue a third shows 「**有効なトークンは 2 本までです。先にどれかを失効してください。**」 (At most two tokens can be active. Revoke one first.).

## Revoking a token

1. In the 「**トークン**」 (Tokens) list at the bottom of the screen, find the token you want to revoke (identified by its last four characters).
2. Press 「**失効**」 (Revoke).

Revoking needs no approval — anyone can do it immediately. A revoked token can never be used to connect again.

## Assigning roles

What a client can actually read is decided not in this app, but in [User Management](/manual/en/operations/system/user-management/user) (`SY01`).

1. Open User Management and find the user behind the client (the one with the same name shown in the "Name" column of the client list).
2. Assign roles the same way you would for an employee.

A client with no roles assigned can read no business data at all, even if it is activated and has a token.

## Frequently asked questions

**Q. I cannot press the "Activate" or "Issue token" button.**
A. That operation has not been approved yet. Request 「API クライアントの有効化」 (Activate an API client) or 「API トークンの発行」 (Issue an API token) respectively in [Privileged Access](/manual/en/operations/system/privileged-access/user) (`SY0G`).

**Q. The moment I pressed it, I got "この操作には承認が必要です" (This operation requires approval).**
A. Even if the screen looked approved when you opened it, the system checks again right before running the operation. In the time between, the approval may have expired, or the approval period itself — if you had never used it — may have ended. Check the status under "My requests" in [Privileged Access](/manual/en/operations/system/privileged-access/user).

**Q. I forgot to copy down the token value.**
A. It cannot be shown again. Revoke that token and issue a new one.

**Q. I cannot issue a token because two are already active.**
A. The cap is two active tokens per client. Revoke an unused old token first, then issue a new one.

**Q. I activated the client and issued a token, but the external system still cannot read anything.**
A. Check whether roles are assigned. A client marked 「ロール未割当」 (No roles) can read nothing, even with a valid identity. Assign roles in [User Management](/manual/en/operations/system/user-management/user). If you set an allowed IP range, also check that the connecting IP falls inside it.

**Q. I want to change the allowed IP range later.**
A. The current screen only lets you set it when creating the client. Please ask your system administrator.

<!-- permissions:start -->
## Permissions required

Using this screen requires the **API client administration** (`api_client`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | API client administration — View |
| Add, change or delete | API client administration — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

### Operations that need approval

Holding the permission is not enough for the operations below. You **request them in Privileged Access (SY0G) and may act only for the window someone else approves**.

| Operation | Permission | What it unlocks |
| --- | --- | --- |
| Issue an API token | API client administration（`api_client`）— Create | Mint the key an external system uses to read business data. The minted value is the credential itself, and it carries whatever the assigned roles allow |
| Activate an API client | API client administration（`api_client`）— Edit | Turn a client that passes nothing into one that can actually read business data |

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
