---
title: "Supplier / Outsourcing Company — User Manual"
description: "A ledger for the companies you buy materials from and the companies you ask to do part of the machining. The companies you register here become the choices for purchase orders and outsourcing requests."
screenshots: [master-supplier-list-01, master-supplier-new-01, master-supplier-new-terms-01, master-supplier-detail-01]
---
This is a ledger for the companies you buy materials from and the companies you ask to do part of the machining. The operation code is `MS03`.

You keep more than the company name and address here. You also keep the **closing day, the payment terms and the bank account for transfers**. A company that is not registered here **cannot be chosen** as the partner on a [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user) or an [Outsourcing Request](/manual/en/operations/purchasing/outsource-order/user).

> ⚠️ This app is currently available **only in the development environment (the environment for testing)**. The screens and the steps may change before it becomes available for real work.

## What you can do in this app

- You can register the companies you buy materials from (suppliers).
- You can register the companies you ask to do part of the machining, such as grinding or coating (outsourcing companies).
- After you register a company, you can choose it as the partner on a [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user) or an [Outsourcing Request](/manual/en/operations/purchasing/outsource-order/user).
- You can register the closing day, the payment terms and the bank account for transfers.
- You can register the usual number of days from the request until the goods arrive (standard lead time).

## Words used on this page

- **仕入先 (Supplier)** … the company you buy materials or supplies from.
- **外注先 (Outsourcing company)** … the company you ask to do part of the machining.
- **外注種別 (Vendor type)** … whether that company is a 「仕入先」 (Supplier) or an 「外注先」 (Outsourcing company).
- **標準リードタイム (Standard lead time)** … the usual number of days from the request until the goods arrive.
- **BPコード (BP code)** … one control number for each company. It starts with `BP-`. It is added automatically when you save.
- **締日 / 支払サイト (Closing day / Payment terms)** … the day the payment is put together, and the number of days until payment.

## Before you start

You need **master data permission** to use this app. If the screen does not open, please ask your administrator.

Before you buy material, the company must be registered here. Without it, you cannot choose the company in the 「仕入先」 (Supplier) field of a [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user).

## How to read the screen

When you open the app, a list of the registered companies is shown.

![Supplier list screen](../../../assets/screenshots/master-supplier-list-01.png)

- **BPコード (BP code)** … a control number that starts with `BP-`. The system adds it automatically.
- **外注種別 (Vendor type)** … either 「**仕入先**」 (Supplier) or 「**外注先**」 (Outsourcing company) is shown as a badge.
- **標準リードタイム (Standard lead time)** … shown like "7日" (7 days). When it is not registered, it shows "—".
- **状態 (Status)** … the green 「**有効**」 (Active) means a company you can still use. The gray 「**無効**」 (Inactive) means a company you can no longer choose.
- Use the search box at the top (「**BPコード・名称で検索**」 / Search by BP code or name) to narrow the list by company name.
- In the 「**外注種別**」 (Vendor type) field you can show only suppliers or only outsourcing companies.
- Click a row to open the detail screen for that company.

## Registering a company

### Entering the company information

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter the company name in 「**名称（日本語）**」 (Name in Japanese). **This field must always be filled in.**
3. Fill in 「**フリガナ**」 (Kana reading), 「**略称**」 (Short name) and 「**法人番号**」 (Corporate number) as far as you know them.
4. In the 「**住所・連絡先**」 (Address and contact) area, enter the postal code, address, phone number and so on.

![New supplier form](../../../assets/screenshots/master-supplier-new-01.png)

### Entering the trade terms and the bank account

5. Choose 「**外注種別**」 (Vendor type) in the 「**取引条件**」 (Trade terms) area. **This must also always be chosen.**
   - A company you buy materials or supplies from → 「**仕入先**」 (Supplier)
   - A company you ask to do part of the machining → 「**外注先**」 (Outsourcing company)
6. Enter 「**締日**」 (Closing day), 「**支払サイト（日数）**」 (Payment terms in days) and 「**支払日**」 (Payment day).
7. In 「**標準リードタイム（日数）**」 (Standard lead time in days), enter the usual number of days from the request until the goods arrive.
8. In the 「**振込先**」 (Bank account) area, enter 「**銀行名**」 (Bank name), 「**支店名**」 (Branch name), 「**口座種別**」 (Account type) and 「**口座番号**」 (Account number).
9. Press 「**保存**」 (Save).

![Trade terms and bank account on the supplier form](../../../assets/screenshots/master-supplier-new-terms-01.png)

> 💡 If you enter `31` in 「**締日**」 (Closing day), it means "end of month". The screen also shows 「31 = 月末」 (31 = end of month) under the field.

> 💡 If you fill in 「**標準リードタイム（日数）**」 (Standard lead time in days), it is used as a guide for the expected arrival date when you make an [Outsourcing Request](/manual/en/operations/purchasing/outsource-order/user). If you do not know it, you can save with the field empty.

> ⚠️ You cannot type in the 「**BPコード**」 (BP code) field. As the screen says 「保存時に自動採番」 (numbered automatically on save), the number is added by itself when you save.

## Looking at what you registered

Click a row in the list to open the screen for that company.

![Supplier detail screen](../../../assets/screenshots/master-supplier-detail-01.png)

Next to the company name you see a 「**仕入先**」 (Supplier) or 「**外注先**」 (Outsourcing company) badge, together with an 「**有効**」 (Active) or 「**無効**」 (Inactive) badge. Below that, the screen is split into two tabs.

- **概要** (Overview) … the trade terms (closing day, payment terms, standard lead time and so on), the bank account and the notes.
- **履歴** (History) … the record of when and who changed this registration.

To correct the content, press 「**編集**」 (Edit) at the top right of the screen.

## What to do with a company you stopped working with

Even after business with a company ends, **please do not delete it**. Past purchase and receipt records point to that company. Set it to "Inactive" instead.

1. Press the menu (the button with three dots) at the top right of the company screen.
2. Choose 「**無効化**」 (Deactivate).
3. On the confirmation screen, press 「**無効化する**」 (Deactivate).

Once a company is inactive, you can no longer choose it on new purchase orders, but **the past data stays as it is**. If business starts again, you can turn it back with the same steps using 「有効化」 (Activate).

## Questions and problems

**Q. I see 「名称（日本語）を入力してください」 (Please enter the name in Japanese) and cannot save.**
A. The Japanese company-name field is empty. Fill in 「名称（日本語）」 (Name in Japanese) and press 「保存」 (Save) again.

**Q. I see 「外注種別を選択してください」 (Please choose the vendor type) and cannot save.**
A. 「外注種別」 (Vendor type) in 「取引条件」 (Trade terms) has not been chosen yet. Choose 「仕入先」 (Supplier) for a company you buy materials from, or 「外注先」 (Outsourcing company) for a company you ask to do machining.

**Q. The company does not appear in the 「仕入先」 (Supplier) field of a material purchase order.**
A. The vendor type may be set to 「外注先」 (Outsourcing company). To use it as a company you buy materials from, change it to 「仕入先」 (Supplier). Please also check that it is not 「無効」 (Inactive).

**Q. When I try to delete, I see 「関連するデータが存在するため実行できません」 (This cannot be done because related data exists).**
A. Purchase or receipt records that use that company already exist, so it cannot be deleted. This is normal. Please use 「無効化」 (Deactivate).

**Q. One company sells us material and also does machining for us. Which one should I choose?**
A. You can choose only one vendor type. Choose the one you use more often, and write the other side in the notes so it is easy to understand.

**Q. If I correct the company name or address, does the content of past purchase orders change?**
A. No. Past documents keep the content they had at that time.
