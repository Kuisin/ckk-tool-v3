---
title: "Customer — User Manual"
description: "A ledger for the customer companies that send you orders. The companies you register here become the choices in the 「顧客」 (Customer) field of quotes and other documents."
screenshots: [master-customer-list-01, master-customer-new-01, master-customer-detail-01, master-customer-branches-01, master-customer-branch-new-01]
---
This is a ledger for the customer companies that send you orders. The operation code is `MS01`.

You keep more than the company name and address here. You also keep the **closing day and the payment terms**. A company that is not registered here **does not appear as a choice** on screens such as the quote screen. When business with a new customer is decided, register the company on this screen first.

## What you can do in this app

- You can register the customer companies you do business with.
- After you register a company, you can choose it in the 「顧客」 (Customer) field of the [Price List](/manual/en/operations/sales/price-list/user) and the [Quote](/manual/en/operations/sales/quote/user).
- You can register **branches** under a company.
- You can register any number of **contacts** (the people you talk to at that company) for each company.
- You can keep trade terms such as the closing day and the payment period.
- When business with a company ends, you can set it to **無効** (Inactive) instead of deleting it.

## Words used on this page

- **顧客 (Customer)** … the company that sends you an order. It can be different from the company that actually uses the product (you register that company in [End User](/manual/en/operations/masters/end-user/user)).
- **BPコード (BP code)** … one control number for each company. It starts with `BP-`. It is added automatically when you save.
- **支店 (Branch)** … a sales office or plant that belongs under the head office.
- **締日 / 支払サイト (Closing day / Payment terms)** … the day the billing is put together, and the number of days until payment.
- **AI照合名 (AI match names)** … a list of "other ways of writing" the company name. It is used to match the company name when an order document you receive is read automatically.

## Before you start

There is nothing you need to prepare first. You can start registering from this screen.

The customers you register are used later, all the way through the [Price List](/manual/en/operations/sales/price-list/user) → [Quote](/manual/en/operations/sales/quote/user) → [Order Acceptance](/manual/en/operations/sales/order-acceptance/user). **Please decide how to write the company name carefully the first time, and register it that way.**

## How to read the screen

When you open the app, a list of the registered customers is shown.

![Customer list screen](../../../assets/screenshots/master-customer-list-01.png)

- **BPコード (BP code)** … a control number that starts with `BP-`. The system adds it automatically.
- **支店数 (Branches)** … how many branches are registered for that company. When there is no branch, it shows "—".
- **状態 (Status)** … the green 「**有効**」 (Active) means a company you can still use. The gray 「**無効**」 (Inactive) means a company you can no longer choose.
- If you type a company name or a BP code in the search box at the top (「**BPコード・名称で検索**」 / Search by BP code or name), the list is narrowed down.
- In the 「**状態**」 (Status) field you can show only 「有効」 (Active) or only 「無効」 (Inactive).
- Click a row to open the detail screen for that company.

## Registering a customer

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter the company name in 「**名称（日本語）**」 (Name in Japanese). **This one field must always be filled in.**
3. Fill in 「**名称（English）**」 (Name in English), 「**フリガナ**」 (Kana reading) and 「**略称**」 (Short name) as far as you know them (you can save with them empty).
4. In the 「**住所・連絡先**」 (Address and contact) area, enter the postal code, address, phone number and so on.
5. In the 「**取引条件**」 (Trade terms) area, enter 「**締日**」 (Closing day), 「**支払サイト（日数）**」 (Payment terms in days) and 「**支払日**」 (Payment day).
6. Choose 「**課税区分**」 (Tax type) — 課税 (taxable) / 非課税 (exempt) / 軽減税率 (reduced rate).
7. Choose how the invoice is sent in 「**請求書送付方法**」 (Invoice delivery method) — メール (email) / FAX / 郵送 (post) / ポータル (portal).
8. Finally, press 「**保存**」 (Save).

![New customer form](../../../assets/screenshots/master-customer-new-01.png)

> 💡 You cannot type in the 「**BPコード**」 (BP code) field. As the screen says 「保存時に自動採番」 (numbered automatically on save), a number such as `BP-00001` is added by itself when you save.

> 💡 If you enter `31` in 「**締日**」 (Closing day), it means "end of month". The screen also shows 「31 = 月末」 (31 = end of month) under the field.

> ⚠️ Choose a company in 「**請求先（別法人の場合）**」 (Billing party, if a different company) only when the invoice goes to another company. If you leave it empty, the invoice goes to this company itself.

## Looking at what you registered

The screen of a saved customer has four tabs.

![Customer detail screen](../../../assets/screenshots/master-customer-detail-01.png)

- **概要** (Overview) … the trade terms and the list of contacts at that company.
- **支店一覧** (Branches) … the list of branches of this company.
- **見積・受注履歴** (Quote and order history) … the record of quotes and other documents made for this company.
- **履歴** (History) … the record of when and who changed this registration.

To correct the content, press 「**編集**」 (Edit) at the top right of the screen.

## Registering a contact at the customer

You can register the name and contact details of the person you deal with.

1. Open the 「**概要**」 (Overview) tab.
2. Press 「**担当者を追加**」 (Add contact) to the right of 「**担当者**」 (Contacts).
3. Enter 「**氏名**」 (Name). **This field must always be filled in.**
4. Fill in 「**部署**」 (Department), 「**役職**」 (Title), 「**メールアドレス**」 (Email) and 「**電話番号**」 (Phone) as far as you know them.
5. If that person is your main contact, tick 「**主担当にする**」 (Set as primary contact).
6. Press 「**追加**」 (Add).

The person you set as the main contact gets a 「**主担当**」 (Primary contact) badge.

## Registering a branch

1. On the customer screen, open the 「**支店一覧**」 (Branches) tab.
2. Press 「**支店を追加**」 (Add branch).
3. Enter the branch name in 「**名称（日本語）**」 (Name in Japanese).
4. Enter the address and phone number.
5. If the branch has a contact person, enter the name in 「**担当者名**」 (Contact name) (you can leave it empty).
6. Press 「**保存**」 (Save).

![Branches tab of the customer screen](../../../assets/screenshots/master-customer-branches-01.png)

![New branch form](../../../assets/screenshots/master-customer-branch-new-01.png)

The BP code of a branch is added automatically. It is the number of the head office with a sub-number after it (for example `BP-00001-01`).

## What to do with a company you stopped working with

Even after business with a company ends, **please do not delete it**. Past quotes and other documents point to that company. Set it to "Inactive" instead.

1. Press the menu (the button with three dots) at the top right of the customer screen.
2. Choose 「**無効化**」 (Deactivate).
3. On the confirmation screen, press 「**無効化する**」 (Deactivate).

Once a company is inactive, you can no longer choose it in new quotes and other documents, but **the past data stays as it is**. If business starts again, you can turn it back with the same steps using 「有効化」 (Activate).

## Questions and problems

**Q. I see 「名称（日本語）を入力してください」 (Please enter the name in Japanese) and cannot save.**
A. The Japanese company-name field is empty. Fill in 「名称（日本語）」 (Name in Japanese) and press 「保存」 (Save) again. The English name can stay empty.

**Q. I see 「メールアドレスの形式が正しくありません」 (The email address format is not correct).**
A. The email address is written in the wrong way. Check that no full-width characters are mixed in and that it has an `@`. If you do not use it, leave it empty.

**Q. When I try to delete, I see 「この取引先を参照するデータ（試算・価格表・見積書）が存在するため削除できません。無効化を検討してください。」 (This partner cannot be deleted because data that refers to it — trial estimates, price lists, quotes — exists. Please consider deactivating it instead).**
A. Quotes and other documents that use that company already exist, so it cannot be deleted. This is normal. Please use 「無効化」 (Deactivate).

**Q. When I try to delete, I see 「支店が存在するため削除できません。先に支店を削除してください。」 (It cannot be deleted because branches exist. Please delete the branches first).**
A. Branches are registered for that company. If you really want to delete it, delete all the branches first. Normally 「無効化」 (Deactivate) is enough.

**Q. I cannot find the customer name when I try to choose one on the quote screen.**
A. The company is not registered yet, or it is 「無効」 (Inactive). On the list screen, set 「状態」 (Status) to 「無効」 (Inactive) and look for it. If you find it, turn it back with 「有効化」 (Activate).

**Q. What should I enter in 「AI照合名」 (AI match names)?**
A. It is a field for the different ways the company name may be written on an order document. For example, enter 「㈱デモ商事」, 「デモ商事株式会社」 and 「デモ商事」, pressing the Enter key after each one. You can also register the company with this field empty.
