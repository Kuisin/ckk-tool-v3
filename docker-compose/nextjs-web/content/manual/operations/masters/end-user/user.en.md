---
title: "End User — User Manual"
description: "A ledger for the companies that actually use the products you make. Use it when you want to keep a record separate from the company that sends you the order."
screenshots: [master-end-user-list-01, master-end-user-new-01, master-end-user-detail-01, master-end-user-deactivate-01]
---
This is a ledger for the companies that **actually use** the products you make. The operation code is `MS02`.

Sometimes the company that sends you the order ([Customer](/manual/en/operations/masters/customer/user)) is not the company that actually uses the product in its plant. This happens, for example, when the order comes through a trading company. In such cases, you register the company that actually uses the product here.

## What you can do in this app

- You can register the companies that actually use your products.
- After you register a company, you can choose it as the 「最終需要家」 (End user) on delivery notes and other documents.
- You can record the **業種** (Industry) of each company.
- When business with a company ends, you can set it to **無効** (Inactive) instead of deleting it.

## Words used on this page

- **最終需要家 (End user)** … the company that actually uses the product you made.
- **顧客 (Customer)** … the company that sends you the order. It may be the same company as the end user, or a different one.
- **BPコード (BP code)** … one control number for each company. It starts with `BP-`. It is added automatically when you save.
- **業種 (Industry)** … what kind of business that company does (for example, car parts).

## Before you start

Registering in this app is **optional**. You do not have to register anything here.

It is mainly used for large accounts, when you want your team to know "which plant is using this product". Register the company that sends you the order in [Customer](/manual/en/operations/masters/customer/user) instead.

## How to read the screen

When you open the app, a list of the registered end users is shown.

![End user list screen](../../../assets/screenshots/master-end-user-list-01.png)

- **BPコード (BP code)** … a control number that starts with `BP-`. The system adds it automatically.
- **業種 (Industry)** … shown here if you registered it.
- **状態 (Status)** … the green 「**有効**」 (Active) means a company you can still use. The gray 「**無効**」 (Inactive) means a company you can no longer choose.
- In the search box at the top (「**BPコード・名称・業種で検索**」 / Search by BP code, name or industry) you can search **not only by company name but also by industry**.
- Click a row to open the detail screen for that company.

## Registering an end user

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter the company name in 「**名称（日本語）**」 (Name in Japanese). **This one field must always be filled in.**
3. Fill in 「**フリガナ**」 (Kana reading) and 「**略称**」 (Short name) as far as you know them (you can save with them empty).
4. In the 「**住所・連絡先**」 (Address and contact) area, enter the address and phone number.
5. In 「**業種**」 (Industry) under 「**需要家情報**」 (End user information), enter the business field of that company (for example, car parts).
6. Press 「**保存**」 (Save).

![New end user form](../../../assets/screenshots/master-end-user-new-01.png)

> 💡 You cannot type in the 「**BPコード**」 (BP code) field. As the screen says 「保存時に自動採番」 (numbered automatically on save), the number is added by itself when you save.

## Looking at what you registered

Click a row in the list to open the screen for that company.

![End user detail screen](../../../assets/screenshots/master-end-user-detail-01.png)

Besides the company name, address and contact details, the screen shows 「**業種**」 (Industry), 「**備考**」 (Notes) and 「**需要家メモ**」 (End user memo). To correct the content, press 「**編集**」 (Edit) at the top right of the screen.

## What to do with a company you stopped working with

Even after business ends, **please do not delete the company**. Past delivery records point to it. Set it to "Inactive" instead.

1. Press the menu (the button with three dots) at the top right of the company screen.
2. Choose 「**無効化**」 (Deactivate).
3. A screen named 「最終需要家の無効化」 (Deactivate end user) opens. Press 「**無効化する**」 (Deactivate).

![End user deactivation confirmation screen](../../../assets/screenshots/master-end-user-deactivate-01.png)

Once a company is inactive, you can no longer choose it on new documents, but **the past data stays as it is**. If business starts again, you can turn it back with the same steps using 「有効化」 (Activate).

## Activating or deactivating several companies at once

When you have re-registered many companies, you can switch them together.

1. Tick the checkbox on the left of each row in the list.
2. 「**一括有効化**」 (Bulk activate), 「**一括無効化**」 (Bulk deactivate) and 「**一括削除**」 (Bulk delete) appear at the top of the screen.
3. Press the one you want to use.

> ⚠️ When you press 「**一括削除**」 (Bulk delete), a confirmation appears: 「選択中の◯件の最終需要家を削除します。この操作は取り消せません。」 (The selected ◯ end users will be deleted. This cannot be undone.) Because it cannot be undone, please use 「一括無効化」 (Bulk deactivate) in normal work.

## Questions and problems

**Q. I see 「名称（日本語）を入力してください」 (Please enter the name in Japanese) and cannot save.**
A. The Japanese company-name field is empty. Fill in 「名称（日本語）」 (Name in Japanese) and press 「保存」 (Save) again. The English name can stay empty.

**Q. I see 「メールアドレスの形式が正しくありません」 (The email address format is not correct).**
A. The email address is written in the wrong way. Check that no full-width characters are mixed in and that it has an `@`. If you do not use it, leave it empty.

**Q. The company that sends the order and the company that uses the product are the same. Do I need to register it in both places?**
A. No. Register it only in [Customer](/manual/en/operations/masters/customer/user). This screen is for when "the company that orders" and "the company that uses" are different.

**Q. What should I write in 「業種」 (Industry)?**
A. There is no fixed list; you can type freely. Any wording your team understands is fine (for example, car parts, electronic parts). You can also save it empty.

**Q. I cannot find a company when I search the list.**
A. It may be 「無効」 (Inactive). Choose 「無効」 (Inactive) in the 「**状態**」 (Status) field at the top and look again. If you find it, open the company and turn it back with 「有効化」 (Activate).
