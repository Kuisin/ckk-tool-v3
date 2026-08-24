---
title: "Link Management — Operation Manual"
description: "An app for reviewing external links posted in memos/comments and blocking access to unsafe sites."
---
An app for reviewing **external links** posted in the body of memos and comments, and **blocking** access to unsafe sites. The operation code is `SY0B`.

## What you can do with this app

- See a list of every external link that has been posted in internal documents (memos/comments on quotes, order acceptances, work orders, and more).
- Check how many times a link has been clicked and when it was last used.
- Specify the hostname of a dangerous or unwanted site and block moving to it.
- A block you add later **also applies retroactively to links that were already posted**.

## Words used on this page

- **Short link** … when you paste an external URL into a memo or comment, it is automatically replaced on save with an internal address of the form `/l/xxxxxxxx`. The actual destination is recorded only in this app's index.
- **Confirmation page** … the page a short link passes through once when clicked. It shows the destination site's name and URL, and the person who clicked it chooses "Continue" to proceed.
- **Hostname** … the core part of a site's address, such as `example.com`. Blocking is specified at this hostname level.

## Before you start

You need **system administration permission** to open this app. If you cannot open it, please ask your system administrator.

## How to open it

Press **リンク管理** (Link Management) inside 「システム」 (System) on the home screen. Or type `SY0B` into the search box at the top of the screen.

## How to read the screen

The screen has two tabs: 「索引」 (Index) and 「ブロック」 (Blocked).

### Index tab

A list of external links posted in internal documents.

- **短縮コード** (Short code) … the `/l/xxxxxxxx` part. Press it to open the confirmation page.
- **ホスト** (Host) … the name of the destination site. Links currently blocked show a 「**ブロック中**」 (Blocked) mark.
- **遷移先** (Destination) … the actual URL. Hover over it to see the full text.
- **利用** (Uses) … how many times this link was followed via "Continue" on the confirmation page.
- **最終利用** (Last used) … when it was last used. Shows 「—」 if it has never been used.

The same destination URL, however many times it is posted, is consolidated into a single short code.

### Blocked tab

A list of blocked hostnames and a field for adding a new one.

- **ホスト名** (Hostname) … the address of the site you want to block (e.g. `evil.example`). Its subdomains (such as `sub.evil.example`) are blocked as well.
- **理由** (Reason) … an optional note (e.g. "reported as phishing").
- **該当リンク** (Matching links) … the number of already-indexed links that match this block. Use it as a rough gauge of the impact.
- **有効** (Active) … a switch to turn the block on or off temporarily. Turning it off stops the block without deleting it.

## Adding a block

1. Open the 「**ブロック**」 (Blocked) tab.
2. Enter the address of the site you want to block in 「**ホスト名**」 (Hostname). Pasting a full URL is fine — only the hostname is taken.
3. Enter a 「**理由**」 (Reason) if needed.
4. Press 「**追加**」 (Add).

Once added, links to that host show as blocked **the moment the confirmation page is opened**. This also takes effect immediately on links that were already posted in existing documents.

## Removing a block

To stop a block temporarily, turn off that row's 「**有効**」 (Active) switch. To remove it completely, choose 「**削除**」 (Delete) from that row's actions. After deletion, links to that host can be opened normally again.

## What happens on the viewer's side

When someone pastes an external URL into a memo or comment and saves it, it is automatically replaced with a short link. When another person clicks it, the confirmation page opens first, showing the destination site's name and URL, and only after pressing 「**続行して移動**」 (Continue) do they move to the external site. If the host is blocked, the confirmation page shows "cannot move" along with the reason, and stops there.

## Questions and problems

**Q. There's a link in the index I don't recognize.**
A. This screen does not show which document a link was posted in. If you have no idea where it came from, block the host first and handle the internal notice or investigation separately.

**Q. I blocked a site, but people can still reach it.**
A. Blocking is checked the instant the confirmation page opens. Please check that the 「有効」 (Active) switch is on and that the hostname is specified correctly (including subdomains as needed).

**Q. I only want to block one subdomain.**
A. A hostname entry blocks "that host and all of its subdomains." There is no way to target only a specific subdomain while excluding its parent domain.

**Q. If I delete a block entry, does the link disappear from the original document too?**
A. No. Deleting only removes the block entry. This app cannot edit the memo/comment body of a document, and there is no way to delete an indexed link itself.
