---
title: "Business Partner — User Manual"
description: "One ledger for all the companies you do business with. You register the company first, then give it 「ロール」 (roles) — customer, end user, supplier/outsourcing partner — and it becomes a choice on the matching documents."
screenshots: [master-bp-list-01, master-bp-new-01, master-bp-roles-01, master-bp-new-customer-01, master-bp-new-vendor-01, master-bp-vendor-list-01, master-bp-detail-01, master-bp-vendor-detail-01, master-bp-branches-01, master-bp-branch-new-01, master-bp-deactivate-01]
---
This is **one ledger for all the companies you do business with**. The operation code is `MS01`.

It used to be three separate apps — 顧客 (Customer), 最終需要家 (End User) and 外注企業 (Supplier). They are now merged into this single **取引先** (Business Partner) app. You no longer have to register the same company in three places.

The way you use it is very simple:

> **Register the company (business partner) first, then give it a 「ロール」 (role) and use it.**

A 「ロール」 (role) marks **in what position you deal with that company**. A company that sends you orders gets 顧客 (Customer). A company that actually uses the product gets 最終需要家 (End User). A company you buy material from, or ask to do part of the machining, gets 仕入先・外注先 (Supplier / Outsourcing partner). **One company can have as many roles as you like.** If a company both sells you material and sends you orders, just tick both.

A company with no role **does not appear as a choice** on screens such as the quote screen or the material purchase order screen. When new business is decided, register the company on this screen first and give it a role.

## What you can do in this app

- You can register each company you do business with, one record per company.
- You can give a company **roles** — 顧客 (Customer) / 最終需要家 (End User) / 仕入先・外注先 (Supplier / Outsourcing partner). One company can hold several roles.
- With the 顧客 (Customer) role, the company can be chosen as the addressee on the [Price List](/manual/en/operations/sales/price-list/user), the [Quote](/manual/en/operations/sales/quote/user), the [Order Acceptance](/manual/en/operations/sales/order-acceptance/user) and the invoice.
- With the 最終需要家 (End User) role, the company can be chosen as the end user on the [Delivery Note](/manual/en/operations/shipping/delivery-note/user) and the sales order.
- With the 仕入先・外注先 (Supplier / Outsourcing partner) role, the company can be chosen on the [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user), the [Outsource Order](/manual/en/operations/purchasing/outsource-order/user) and as the outsourcing partner of a work order step.
- You can register **branches** under a company.
- You can register any number of **contacts** (the people you talk to at that company) for each company.
- You can keep trade terms such as the closing day, the payment period, the bank account for transfers and the standard lead time.
- When business with a company ends, you can set it to **無効** (Inactive) instead of deleting it.

## Words used on this page

- **取引先 (Business partner)** … the company itself. You register one record per company.
- **ロール (Role)** … the mark that says in what position you use the company. There are three:
  - **顧客 (Customer)** … a company that sends you orders. It becomes the addressee of quotes, order acceptances and invoices.
  - **最終需要家 (End user)** … the company that actually uses the finished product in its plant. Use it when the company that orders and the company that uses the product are different — for example when the order comes through a trading company.
  - **仕入先・外注先 (Supplier / Outsourcing partner)** … a company you buy material from (supplier), or one you ask to do part of the machining such as grinding or coating (outsourcing partner).
- **外注種別 (Vendor type)** … the split inside the 仕入先・外注先 role. You choose either 「**仕入先**」 (Supplier) or 「**外注先**」 (Outsourcing partner).
- **BPコード (BP code)** … one control number for each company. It starts with `BP-`. It is added automatically when you save.
- **支店 (Branch)** … a sales office or plant that belongs under the head office.
- **締日 / 支払サイト (Closing day / Payment terms)** … the day billing or payment is put together, and the number of days until payment.
- **標準リードタイム (Standard lead time)** … the usual number of days from placing a request to the goods arriving.
- **AI照合名 (AI match names)** … a list of "other ways of writing" the company name. It is used to match the company name when an order document you receive is read automatically.

## Before you start

You need the **master data permission** to use this app. If the screen does not open, please ask your administrator.

There is nothing else you need to prepare. You can start registering from this screen.

The partners you register are used later, all the way through the [Price List](/manual/en/operations/sales/price-list/user) → [Quote](/manual/en/operations/sales/quote/user) → [Order Acceptance](/manual/en/operations/sales/order-acceptance/user), and through the [Material Purchase Order](/manual/en/operations/purchasing/purchase-order/user) → [Outsource Order](/manual/en/operations/purchasing/outsource-order/user). **Please decide how to write the company name carefully the first time, and register it that way.**

## How to read the screen

When you open the app, a list of the registered business partners is shown.

![Business partner list screen](../../../assets/screenshots/master-bp-list-01.png)

- **BPコード (BP code)** … a control number that starts with `BP-`. The system adds it automatically.
- **名称 (Name)** … the company name.
- **ロール (Roles)** … the roles given to that company appear as badges. The 仕入先・外注先 role shows as 「**仕入先**」 (Supplier) or 「**外注先**」 (Outsourcing partner) according to the vendor type. A company with no role shows 「**ロール未設定**」 (No role set).
- **支店数 (Branches)** … how many branches are registered for that company. When there is no branch, it shows "—".
- **状態 (Status)** … the green 「**有効**」 (Active) means a company you can still use. The gray 「**無効**」 (Inactive) means a company you can no longer choose.
- If you type a company name or a BP code in the search box at the top (「**BPコード・名称で検索**」 / Search by BP code or name), the list is narrowed down.
- In the 「**ロール**」 (Role) field you can narrow the list down to, for example, only customers or only suppliers and outsourcing partners.
- In the 「**状態**」 (Status) field you can show only 「有効」 (Active) or only 「無効」 (Inactive).
- Click a row to open the detail screen for that company.

Only **head offices (parent companies)** appear in the list. Branches appear in the 「支店一覧」 (Branches) tab of the company's detail screen.

For example, choosing 仕入先・外注先 in the 「ロール」 (Role) field lists only the companies you buy material from or send machining to.

![List filtered by the supplier / outsourcing partner role](../../../assets/screenshots/master-bp-vendor-list-01.png)

## Registering a business partner

### 1. Enter the company information

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter the company name in 「**名称（日本語）**」 (Name in Japanese). **This one field must always be filled in.**
3. Fill in 「**名称（English）**」 (Name in English), 「**フリガナ**」 (Kana reading), 「**略称**」 (Short name) and 「**法人番号**」 (Corporate number) as far as you know them (you can save with them empty).
4. In the 「**住所・連絡先**」 (Address and contact) area, enter the postal code, address, phone number, fax and email address.

![New business partner form](../../../assets/screenshots/master-bp-new-01.png)

> 💡 You cannot type in the 「**BPコード**」 (BP code) field. As the screen says 「保存時に自動採番」 (numbered automatically on save), a number such as `BP-00001` is added by itself when you save.

### 2. Choose the roles

In the 「**ロール**」 (Roles) area, tick the positions in which you use this company. **You can tick as many as you like.**

![Role selection area](../../../assets/screenshots/master-bp-roles-01.png)

- **顧客 (Customer)** … lets you choose the company as the addressee of quotes, order acceptances and invoices.
- **最終需要家 (End user)** … lets you choose the company as the end user on delivery notes and sales orders.
- **仕入先・外注先 (Supplier / Outsourcing partner)** … lets you choose the company on material purchase orders, outsource orders and as the outsourcing partner of a work order step.

When you tick a role, **that role's own set of fields appears below**. When you untick it, those fields are hidden again.

> ⚠️ You can save with no role ticked. But such a company **does not appear as a choice on any document**. You can add roles later, so registering the company alone first is perfectly fine.

### 3. Enter the customer information (when 顧客 is ticked)

A 「**顧客情報**」 (Customer information) area appears.

![Customer information fields](../../../assets/screenshots/master-bp-new-customer-01.png)

1. In 「**旧システムコード**」 (Old system code), enter the customer code from your previous system if there is one (it can stay empty).
2. Enter 「**締日**」 (Closing day), 「**支払サイト（日数）**」 (Payment terms in days) and 「**支払日**」 (Payment day).
3. Enter 「**与信限度額**」 (Credit limit) if you have one.
4. Choose 「**課税区分**」 (Tax type) — 課税 (taxable) / 非課税 (exempt) / 軽減税率 (reduced rate).
5. Choose how the invoice is sent in 「**請求書送付方法**」 (Invoice delivery method) — メール (email) / FAX / 郵送 (post) / ポータル (portal).
6. If the company is a consignment partner, tick 「**委託先（委託販売の対象）**」 (Consignment partner).

> 💡 If you enter `31` in 「**締日**」 (Closing day), it means "end of month". The screen also shows 「31 = 月末」 (31 = end of month) under the field. The closing day you set here is used by the [Monthly Billing Close](/manual/en/operations/billing/billing-closing/user).

> ⚠️ Choose a company in 「**請求先（別法人の場合）**」 (Billing party, if a different company) only when the invoice goes to another company. If you leave it empty, the invoice goes to this company itself.

### 4. Enter the end user information (when 最終需要家 is ticked)

A 「**最終需要家情報**」 (End user information) area appears. Enter the company's line of business in 「**業種**」 (Industry) — for example 自動車部品 (automotive parts). There is no fixed list; any wording your team understands is fine. You can also save it empty.

### 5. Enter the supplier information and the bank account (when 仕入先・外注先 is ticked)

Two areas appear — 「**仕入先・外注先情報**」 (Supplier / outsourcing partner information) and 「**振込先**」 (Bank account for transfers).

![Supplier information and bank account fields](../../../assets/screenshots/master-bp-new-vendor-01.png)

1. Choose 「**外注種別**」 (Vendor type). **This must always be chosen.**
   - A company you buy material or supplies from → 「**仕入先**」 (Supplier)
   - A company you ask to do part of the machining → 「**外注先**」 (Outsourcing partner)
2. In 「**旧システムコード**」 (Old system code), enter the supplier code from your previous system if there is one.
3. Enter 「**締日**」 (Closing day), 「**支払サイト（日数）**」 (Payment terms in days) and 「**支払日**」 (Payment day).
4. In 「**標準リードタイム（日数）**」 (Standard lead time in days), enter the usual number of days from the request to the goods arriving.
5. Under 「**振込先**」 (Bank account), enter 「**銀行名**」 (Bank name), 「**支店名**」 (Branch name), 「**口座種別**」 (Account type) and 「**口座番号**」 (Account number).

> 💡 If you fill in 「**標準リードタイム（日数）**」 (Standard lead time), it is used as the guide for the expected arrival date when you create an [Outsource Order](/manual/en/operations/purchasing/outsource-order/user). If you do not know it, you can save it empty.

### 6. Save

Finally, press 「**保存**」 (Save). After saving, the detail screen of that business partner opens.

## Adding and removing roles later

When you later decide "we will buy material from this company too", you only have to add a role.

1. Open the company's screen and press 「**編集**」 (Edit) at the top right.
2. In the 「**ロール**」 (Roles) area, tick the role you want to add.
3. Fill in the fields that appear and press 「**保存**」 (Save).

Removing a role works the same way — untick it and press 「保存」 (Save).

> 💡 **Unticking a role does not delete what you entered.** The role assignment simply becomes unused; the closing day, the bank account and so on stay as they are. Tick it again and everything you entered before comes back. So there is nothing to worry about if you untick one by mistake.

## Looking at what you registered

Click a row in the list to open that company's screen. The summary area at the top shows the **roles**, and below it the screen is split into five tabs.

![Business partner detail screen](../../../assets/screenshots/master-bp-detail-01.png)

- **概要 (Overview)** … a series of panels. The first is 「**一般**」 (General — remarks and anything else that belongs to the company itself, whatever its roles), followed by one panel for **each role the company actually has**. A role panel holds the trade terms for 「**顧客**」 (customer), the industry for 「**最終需要家**」 (end user), and the trade terms plus the bank account for 「**仕入先・外注先**」 (supplier / outsourcing partner). The dot to the left of a panel heading uses the same colour as that role's badge in the list.
- **担当者 (Contacts)** … the list of people you talk to at that company.
- **支店一覧 (Branches)** … the list of branches of this company.
- **見積・受注履歴 (Quote and order history)** … the record of quotes and other documents made for this company.
- **履歴 (History)** … the record of when and who changed this registration.

For a supplier or outsourcing partner, the 「概要」 (Overview) tab shows the vendor type, the standard lead time and the bank account.

![Supplier detail screen](../../../assets/screenshots/master-bp-vendor-detail-01.png)

To correct the content, press 「**編集**」 (Edit) at the top right of the screen.

## Registering a contact at the partner

You can register the name and contact details of the person you deal with. The steps are the same for a customer and for a supplier.

1. Open the 「**担当者**」 (Contacts) tab.
2. Press 「**担当者を追加**」 (Add contact) at the top right.
3. Enter 「**氏名**」 (Name). **This field must always be filled in.**
4. Fill in 「**フリガナ**」 (Kana reading), 「**部署**」 (Department), 「**役職**」 (Title), 「**メールアドレス**」 (Email) and 「**電話番号**」 (Phone) as far as you know them.
5. If that person is your main contact, tick 「**主担当にする**」 (Set as primary contact).
6. Press 「**追加**」 (Add).

The person you set as the main contact gets a 「**主担当**」 (Primary contact) badge.

## Registering a branch

1. On the business partner screen, open the 「**支店一覧**」 (Branches) tab.
2. Press 「**支店を追加**」 (Add branch).
3. Enter the branch name in 「**名称（日本語）**」 (Name in Japanese).
4. Enter the address and phone number.
5. If the branch has a contact person, enter the name in 「**担当者名**」 (Contact name) (you can leave it empty).
6. Press 「**保存**」 (Save).

![Branches tab of the business partner screen](../../../assets/screenshots/master-bp-branches-01.png)

![New branch form](../../../assets/screenshots/master-bp-branch-new-01.png)

The BP code of a branch is added automatically. It is the number of the head office with a sub-number after it (for example `BP-00001-01`).

## What to do with a company you stopped working with

Even after business with a company ends, **please do not delete it**. Past quotes, purchase orders and delivery notes point to that company. Set it to "Inactive" instead.

1. Press the menu (the button with three dots) at the top right of the business partner screen.
2. Choose 「**無効化**」 (Deactivate).
3. The 「取引先の無効化」 (Deactivate business partner) window appears. Press 「**無効化する**」 (Deactivate).

![Deactivation confirmation window](../../../assets/screenshots/master-bp-deactivate-01.png)

Once a company is inactive, you can no longer choose it in new quotes or purchase orders, but **the past data stays as it is**. If business starts again, you can turn it back with the same steps using 「有効化」 (Activate).

> 💡 When you mean "we no longer order from this company, but we still take orders from it", it is more natural to **untick the 仕入先・外注先 role** than to deactivate the company. The company itself stays active and can still be used as a customer.

## Turning several companies active or inactive at once

When you have re-registered many companies, you can switch them together.

1. Tick the checkbox on the left of each row in the list.
2. 「**一括有効化**」 (Bulk activate), 「**一括無効化**」 (Bulk deactivate) and 「**一括削除**」 (Bulk delete) appear at the top of the screen.
3. Press the one you want.

> ⚠️ 「**一括削除**」 (Bulk delete) cannot be undone. Normally please use 「一括無効化」 (Bulk deactivate).

## Input fields

A business partner has **fields common to every company** and **fields that appear only once you give it a role** (customer, supplier or outsourcer, end user).

### Common fields

| Field | Required | What to enter |
|-------|----------|---------------|
| [BP code](#field-bp-code) | Automatic | The partner's number |
| [Name](#field-name) | Required | The company name |
| [Kana / short name](#field-name-kana) | Optional | For searching and for narrow screens |
| [Country](#field-country) | Optional | The partner's country |
| [Corporate number](#field-tax-number) | Optional | Corporate or tax number |
| [AI matching names](#field-match-names) | Optional | Other spellings used on documents |
| [Postal code / address](#field-address) | Optional | Where they are |
| [Phone / fax / email / website](#field-contact) | Optional | Contact details |
| [Active](#field-active) | — | Whether it appears in pick lists |
| [Notes](#field-notes) | Optional | Notes |

### BP code [#field-bp-code]

The partner's number, assigned automatically.

### Name [#field-name]

The company name. **It appears on documents exactly as written**, so use the formal name.

### Kana / short name [#field-name-kana]

Kana is used when searching by name. A short name is for showing it briefly where space is tight, such as lists.

### Country [#field-country]

The partner's country. It is used to tell overseas partners apart.

### Corporate number [#field-tax-number]

A corporate or tax identification number. It is used when matching up billing and accounting.

### AI matching names [#field-match-names]

Other spellings that should be **recognised as the same company** when a received document is read automatically. Listing former names and different ways of writing the company suffix makes intake less likely to pick the wrong company.

### Postal code / address [#field-address]

Where they are. It appears on delivery notes and invoices.

### Phone / fax / email / website [#field-contact]

Company-level contact details. Details for individual people are registered separately as contacts.

### Active [#field-active]

Turning it off means the company **can no longer be picked** on quotes, purchase orders and so on. Documents already made for it stay. Turn this off rather than deleting a company you stopped working with.

### Notes [#field-notes]

Notes. Writing down why something was decided, or anything to watch out for, helps whoever reads it later.

---

### Fields for the customer role

| Field | Required | What to enter |
|-------|----------|---------------|
| [Billing partner (if different)](#field-billing-bp) | Optional | When invoices go to another company |
| [Closing day / payment terms / payment day](#field-payment-terms) | Optional | The payment agreement |
| [Credit limit](#field-credit-limit) | Optional | How much may be on account |
| [Tax treatment](#field-tax-type) | Optional | How tax is handled |
| [Invoice delivery method](#field-invoice-method) | Optional | How invoices reach them |
| [Consignment](#field-consignment) | — | Whether consignment applies |

### Billing partner (if different) [#field-billing-bp]

Set it when invoices go to a different company. Empty means the company itself.

### Closing day / payment terms / payment day [#field-payment-terms]

The payment agreement. **The closing run works from the closing day set here**, and the terms and payment day decide the invoice due date.

### Credit limit [#field-credit-limit]

A guide to how much may be outstanding on account.

### Tax treatment [#field-tax-type]

How consumption tax is handled; used when calculating invoices.

### Invoice delivery method [#field-invoice-method]

Whether invoices go by email, fax, post or portal.

### Consignment [#field-consignment]

Whether consignment selling applies. Set it only for partners you sell on consignment with.

---

### Fields for the supplier / outsourcer role

| Field | Required | What to enter |
|-------|----------|---------------|
| [Vendor type](#field-vendor-type) | Required | Buying materials or sending out work |
| [Standard lead time (days)](#field-lead-time) | Optional | How long work usually takes |
| [Closing day / payment terms / payment day](#field-vendor-payment) | Optional | The payment agreement |
| [Bank / branch / account type / number](#field-bank) | Optional | Where to pay |

### Vendor type [#field-vendor-type]

Whether they are a **supplier** (you buy materials from them) or an **outsourcer** (you send part of a process to them). The company appears only on the corresponding screens.

### Standard lead time (days) [#field-lead-time]

Roughly how long between sending work out and getting it back; used as a guide for the expected date.

### Closing day / payment terms / payment day [#field-vendor-payment]

The agreement for paying them.

### Bank / branch / account type / number [#field-bank]

The account to pay into. It is used when you pay them.

---

### Fields for the end-user role

| Field | Required | What to enter |
|-------|----------|---------------|
| [Industry](#field-industry) | Optional | What industry they are in |

### Industry [#field-industry]

What industry the company is in. **Only the larger end users need registering** — there is no need to register every one.

---

### Branch and contact fields

Branches are registered under a company (**two levels at most**) and use the same fields as the common ones above.

A contact takes a name plus department, title, email and phone. Marking one as the **primary contact** makes them the first suggestion when addressing documents.

## Questions and problems

**Q. Where did the old 顧客 (Customer), 最終需要家 (End User) and 外注企業 (Supplier) apps go?**
A. They are merged into this single 取引先 (Business Partner) app. Opening an old address takes you to this screen automatically. The companies you had already registered are carried over, each with the matching role.

**Q. One company both sells us material and sends us orders. Do I need two records?**
A. No. Register one record and tick **both** the 「**顧客**」 (Customer) and 「**仕入先・外注先**」 (Supplier / Outsourcing partner) roles.

**Q. The company that orders and the company that uses the product are the same. Do I need both roles?**
A. 顧客 (Customer) alone is enough. 最終需要家 (End user) is for when "the company that orders" and "the company that uses" are different — for example when the order comes through a trading company.

**Q. I see 「名称（日本語）を入力してください」 (Please enter the name in Japanese) and cannot save.**
A. The Japanese company-name field is empty. Fill in 「名称（日本語）」 (Name in Japanese) and press 「保存」 (Save) again. The English name can stay empty.

**Q. I see 「外注種別を選択してください」 (Please choose the vendor type) and cannot save.**
A. The 仕入先・外注先 role is ticked but 「外注種別」 (Vendor type) has not been chosen yet. Choose 「仕入先」 (Supplier) for a company you buy material from, or 「外注先」 (Outsourcing partner) for one you send machining to.

**Q. I see 「メールアドレスの形式が正しくありません」 (The email address format is not correct).**
A. The email address is written in the wrong way. Check that no full-width characters are mixed in and that it has an `@`. If you do not use it, leave it empty.

**Q. I cannot find the customer name when I try to choose one on the quote screen.**
A. Check these three things in order. 1) Is the company registered at all? 2) Does it have the 「**顧客**」 (Customer) role? Without it, the company does not appear in the addressee list. 3) Is it 「無効」 (Inactive)? You can narrow the list down with the 「ロール」 (Role) and 「状態」 (Status) fields on the list screen.

**Q. The company does not appear in the 「仕入先」 (Supplier) field of the material purchase order.**
A. It probably does not have the 仕入先・外注先 role, or its vendor type is set to 「外注先」 (Outsourcing partner). To use it as a company you buy material from, change it to 「仕入先」 (Supplier). Also check that it is not 「無効」 (Inactive).

**Q. If I untick a role, do the closing day and bank account I entered disappear?**
A. No. The role assignment simply becomes unused. Tick it again and everything you entered before comes back.

**Q. When I try to delete, I see 「この取引先を参照するデータ（販売・購買・製造の書類）が存在するため削除できません。無効化を検討してください。」 (This partner cannot be deleted because documents in sales, purchasing or production refer to it. Please consider deactivating it instead).**
A. Quotes, purchase orders and other documents that use that company already exist, so it cannot be deleted. This is normal. Please use 「無効化」 (Deactivate).

**Q. When I try to delete, I see 「支店が存在するため削除できません。先に支店を削除してください。」 (It cannot be deleted because branches exist. Please delete the branches first).**
A. Branches are registered for that company. If you really want to delete it, delete all the branches first. Normally 「無効化」 (Deactivate) is enough.

**Q. What should I enter in 「AI照合名」 (AI match names)?**
A. It is a field for the different ways the company name may be written on an order document. For example, enter 「㈱デモ商事」, 「デモ商事株式会社」 and 「デモ商事」, pressing the Enter key after each one. You can also register the company with this field empty.

**Q. If I correct the company name or address, does the content of past documents change?**
A. No. Past documents stay exactly as they were at that time.

**Q. What should I write in 「業種」 (Industry)?**
A. There is no fixed list; you can type freely. Any wording your team understands is fine (for example 自動車部品 / automotive parts, 電子部品 / electronic parts). You can also save it empty.
