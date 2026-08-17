---
title: "Activity Log — User Manual"
description: "An app that lets you look up, across the whole system, who changed which data, when, and how."
screenshots: [settings-activity-01, settings-activity-filter-01, settings-activity-detail-01, settings-activity-diff-01]
---
This app lets you look up, across the whole system, **who changed which data, when, and how**. The operation code is `SY07`.

It is a view-only app. You cannot correct or erase any record from this screen.

## What you can do with this app

- See the change records from every app together, in time order.
- Search by a document number or by the name of the person who made the change.
- Pick one record and compare **what the data looked like before and after** the change.
- Jump straight from a record to the screen of the document that was changed.
- Use it when you want to find out "who changed this number?" or "when did the amount change?"

## Terms used on this page

- **レコード** (Record) … one item of data. One quotation, one product, and so on. On this screen it is shown by that document's number (for example `QOT-…`).
- **対象** (Target) … what kind of data it is. Quotation, trial estimate, price list, site, and so on.
- **変更内容** (Changes) … a short summary of which fields changed and how.

## Before you start

- You need **system administration permission** to open this app. If it will not open, please ask your system administrator.
- If you only want the history of one particular document, the **「履歴」 (History) tab on that document's own screen** will find it faster. The contents are the same.

## How to open it

On the home screen, under 「システム」 (System), press **操作履歴** (Activity Log). Or type `SY07` into the search box at the top of the screen.

## What is recorded and what is not

A record is created automatically **when data is saved**.

- **作成** (Create) … when new data was made.
- **更新** (Update) … when existing data was corrected.
- **削除** (Delete) … when data was erased.
- **初期データ** (Seed data) / **マイグレーション** (Migration) … records of the system putting data in at the start, or moving data over in bulk. These are not actions by a person.

On the other hand, **actions where you only looked at something are not recorded**. Opening a screen, logging in, or downloading a PDF will not appear here.

## Reading the screen

When you open the app, the records are listed newest first.

![The Activity Log list screen](../../../assets/screenshots/settings-activity-01.png)

- **日時** (Date/time) … when the action took place.
- **操作** (Operation) … normally one of 作成 (create) / 更新 (update) / 削除 (delete). For work done by the system rather than a person, it can also show 「**初期データ**」 (seed data) or 「**マイグレーション**」 (migration).
- **対象** (Target) … what kind of data it is (quotation, trial estimate, price list, and so on).
- **レコード** (Record) … the number of that document. For data with no number, "—" is shown.
- **ユーザー** (User) … the name of the person who did it. Work done by the system rather than a person is shown as 「**システム**」 (System).
- **変更内容** (Changes) … a summary of what changed and how. It is listed in the form "field name: before → after".

> 💡 This screen shows up to the **300 newest** records. If you need to look into anything older than that, please ask your system administrator.

## Searching and narrowing down

1. Type a document number or a person's name into the search box at the top, 「**レコード・ユーザー・内容で検索**」 (Search by record, user, or content).
2. Use 「**操作**」 (Operation) to narrow down to one kind of operation. Create, update, and delete are the usual choices; when the system has done work of its own, 「初期データ」 (seed data) and 「マイグレーション」 (migration) can be chosen too.
3. Use 「**対象**」 (Target) to narrow down to a kind of data, such as quotations or products.
4. To clear all of the conditions, press 「**リセット**」 (Reset).

![Narrowing down by operation and target](../../../assets/screenshots/settings-activity-filter-01.png)

When nothing matches, 「**操作履歴がありません**」 (There is no activity log) is shown.

## Looking at one record in detail

Click a row in the list and the screen for that single record opens.

![The Activity Log detail screen](../../../assets/screenshots/settings-activity-detail-01.png)

Near the top you will see the date/time, operation, target, record, and user.

- Click the name under 「**ユーザー**」 (User) and that person's details open in [ユーザー管理](/manual/en/operations/system/user-management/user) (User Management).
- When a document name appears under 「**関連ページ**」 (Related page), you can move to that document's screen.
- A button also appears at the top right of the screen: 「**〈app name〉を開く**」 (Open 〈app name〉). Press it and the document that was changed opens directly. If the document cannot be narrowed down to a single one, the button reads 「**〈app name〉で表示**」 (Show in 〈app name〉) instead, and it opens that app's list already filtered.

## Comparing before and after

Lower down on the detail screen, the recorded contents are shown just as they are.

![The contents before and after the change](../../../assets/screenshots/settings-activity-diff-01.png)

- 「**変更内容（要約）**」 (Changes — summary) … a short summary of only the fields that changed. Normally this is all you need to look at.
- 「**変更前（before）**」 (Before) … the contents before the correction.
- 「**変更後（after）**」 (After) … the contents after the correction.

For a record of something newly made, 「変更前（before）」 shows 「**なし**」 (none). For a record of a deletion, 「変更後（after）」 shows 「**なし**」.

> 💡 The contents of 「変更前」 and 「変更後」 are shown in the form the system stores them in. English field names and symbols are mixed in, but there is nothing wrong. The easy way to check what changed is 「変更内容（要約）」.

## Input fields

Activity log is a **read-only screen**. There is nothing to type — you only choose filters. The records themselves cannot be edited or deleted.

| Filter | What it changes |
|--------|-----------------|
| [Period](#field-period) | Which dates are shown |
| [User](#field-user) | Whose actions are shown |
| [Target](#field-target) | Which documents or master data are shown |

### Period [#field-period]

The date range of records to show.

### User [#field-user]

Filters by who acted. Actions from a shop-floor tablet also carry a **badge** showing which device it was.

### Target [#field-target]

Filters by what the record is about, such as quotes or work orders. Clicking a row opens the detail with **before and after** side by side.

## Frequently asked questions and troubleshooting

**Q. I only want to see the history of one particular quotation.**
A. The quickest way is to open that quotation's screen and look at the 「**履歴**」 (History) tab. If you want to look here instead, type the quotation number into the search box.

**Q. The old record I am looking for does not appear.**
A. This screen shows only the 300 newest records. If you need anything earlier than that, please ask your system administrator.

**Q. I want to know who logged in.**
A. You cannot tell from this screen. Only records of data being made, corrected, or erased are kept here. If you need login records, please ask your system administrator.

**Q. 「ユーザー」 says 「システム」. Who did it?**
A. It was not a person — the system did it automatically. Overnight automatic processing and data imports are examples of this.

**Q. What are the records where 「対象」 says 「アプリ管理」 (App Management)?**
A. They are records of apps being switched on or off for display in [アプリ管理](/manual/en/operations/system/app-management/user) (App Management).

**Q. The 「〈app name〉を開く」 button does not appear at the top right.**
A. If the record cannot be narrowed down to a single document, the button does not appear. Note down the number shown under 「レコード」 and look for it on that app's screen.
