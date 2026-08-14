---
title: "Purchase Request — User Manual"
description: "An app for asking your company to buy a material. After your manager approves it, it turns into a purchase order."
screenshots: [purchase-request-list-01, purchase-request-new-01, purchase-request-detail-02, purchase-request-detail-01, purchase-request-convert-01]
---
This app is for making a **購買依頼** (purchase request) — a way of asking your company to buy a material for you. The operation code is `PU01`.

> ⚠️ This app is still being prepared, so it may not appear on the live system yet. If you cannot find it, please ask the person in charge at your company.

## What you can do with this app

- You can ask for a material by writing only "what, where to, how many, and by when".
- **You do not write prices or suppliers.** The person who places the order decides those after the request is approved.
- You can check whether your request is still waiting for approval or already approved.
- With one button, an approved request becomes a [material purchase order](/manual/en/apps/purchase-order/user).
- Use it when a material is running low and you want to buy more.

## Words used on this page

- **明細** (line item) … one line inside a request. It says "which material, how many".
- **素材** (material) … the bar stock and other raw material used in machining. You pick one that is already registered in the [material master](/manual/en/masters/material/user).
- **入荷先拠点** (receiving site) … the site (plant or business location) that will receive the material.
- **希望納期** (requested delivery date) … the date by which you want the material.
- **承認** (approval) … your manager agreeing to the request. Without it, the request cannot become an order.
- **差し戻し** (sent back) … your manager returning the request to you and asking you to fix something.

## Before you start

- The **material you want must be registered in the [material master](/manual/en/masters/material/user)**. You cannot choose a material that is not registered.
- If you want to name a receiving place, that **[site](/manual/en/masters/plant/user) must be registered**.
- You need purchasing permission to create and edit requests. If the buttons do not appear, please ask the person in charge at your company.

## The order in which a request moves along

A purchase request moves along in this order. The coloured badge on the screen tells you where it is now.

1. **下書き** (draft) … you have only created it. You can change it as often as you like.
2. **承認依頼中** (waiting for approval) … you are waiting for your manager's answer. You cannot change it during this time.
3. **承認済** (approved) … it was accepted. It can now become a purchase order.
4. **発注済** (ordered) … it has become a purchase order. From here the work continues in [material purchase order](/manual/en/apps/purchase-order/user).

If your manager returns it, it becomes "**差し戻し**" (sent back). If you withdraw it, it becomes "**キャンセル**" (cancelled).

## How to read the screen

When you open the app, you see a list of the purchase requests made so far.

![Purchase request list](../../assets/screenshots/purchase-request-list-01.png)

- **依頼番号** (request number) … a number starting with `PRQ-`. The system adds it for you.
- **状態** (status) … a coloured badge shows the current situation. Grey is 「下書き」 (draft), yellow is 「承認依頼中」 (waiting for approval), blue is 「承認済」 (approved), purple is 「発注済」 (ordered), and red is 「差し戻し」 (sent back) or 「キャンセル」 (cancelled).
- **主要素材** (main material) … the material on the first line. If there are more lines, it adds something like 「他 2 件」 (2 more).
- Type a request number, a requester, or a material code into the search box at the top to narrow down the list.
- The 「状態」 (status) box on the right lets you show only the ones waiting for approval.
- Click a row to open the detail screen for that request.

## Creating a purchase request

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Write why you need the material in 「**依頼理由**」 (reason for the request). You can also leave it blank and still save.
3. Click the 「**素材**」 (material) box on the line item, search by material code or name, and choose one.
4. Choose the site that will receive it in 「**入荷先拠点**」 (receiving site). You can also leave it blank and still save.
5. Enter how many pieces you need in 「**数量**」 (quantity).
6. Check 「**単位**」 (unit). It starts with 「本」 (pieces).
7. Enter the date you want the material by in 「**希望納期**」 (requested delivery date). You may leave it blank.
8. To add another material, press 「**明細を追加**」 (Add line item) and repeat steps 3 to 7.
9. Finally, press 「**保存**」 (Save).

![New purchase request form](../../assets/screenshots/purchase-request-new-01.png)

When you save, the request is registered as 「下書き」 (draft) and the detail screen opens.

> 💡 There is no price box on this screen. The supplier and the price are decided later, when the purchase order is made after approval.

## Asking for approval

Once you have checked the content, ask your manager to look at it.

1. Open the request screen.
2. Press 「**承認依頼**」 (Request approval) in the 「**承認・変換状況**」 (approval and conversion status) box.

The status changes to 「**承認依頼中**」 (waiting for approval), and the request reaches the person who approves it. The same request also appears on the [approval management](/manual/en/apps/approval/user) screen.

![Purchase request waiting for approval](../../assets/screenshots/purchase-request-detail-02.png)

While it is waiting for approval, you cannot change the content. If you need to change it, either press 「**キャンセル**」 (Cancel) from the 「**…**」 button (the one with three dots) and make it again, or ask your manager to send it back to you.

## Approving or sending back (for the approver)

Only the person who approves sees these buttons.

- If the content is fine, press 「**承認**」 (Approve). The status becomes 「承認済」 (approved).
- If something needs fixing, press 「**差し戻し**」 (Send back). A small window called 「差し戻しの確認」 (confirm send back) appears, so write your reason in 「**差し戻し理由**」 (reason for sending back) and press 「**差し戻す**」 (Send back).

> ⚠️ Please always write a reason for sending back. If you press the button with it empty, the screen shows 「**差し戻し理由を入力してください**」 (Please enter a reason for sending back).

A request that was sent back gets the status 「**差し戻し**」 (sent back), and the reason appears on the screen of the person who made it. They can fix the content and press 「承認依頼」 (Request approval) again. There is no need to make a new request.

## Turning it into a purchase order

An approved request becomes a purchase order, which is what you send to the supplier.

1. Open a request with the status 「承認済」 (approved).
2. Press 「**発注書へ変換**」 (Convert to purchase order).

![Approved purchase request](../../assets/screenshots/purchase-request-detail-01.png)

3. A small window called 「発注書へ変換の確認」 (confirm conversion to purchase order) appears.
4. Choose the 「**仕入先**」 (supplier).
5. Press 「**変換する**」 (Convert).

![Confirm conversion to purchase order screen](../../assets/screenshots/purchase-request-convert-01.png)

A [material purchase order](/manual/en/apps/purchase-order/user) is created as a draft with the same line items, and you move to its screen. The request becomes 「**発注済**」 (ordered) and shows a link to the new purchase order number.

> 💡 On the new purchase order, **every unit price is 0 yen**. Please open 「編集」 (Edit) on the purchase order, enter the prices, and then request approval for the purchase order.

## Checking the content

The request screen has three tabs.

- **明細** (line items) … the list of material, receiving site, quantity, and requested delivery date.
- **概要** (overview) … the reason for the request and any notes.
- **履歴** (history) … a record of who changed what and when.

The 「承認・変換状況」 (approval and conversion status) box shows how far the request has moved along — request → approval → conversion to purchase order — and who approved it and when.

## Questions and problems

**Q. The 「承認」 (Approve) and 「差し戻し」 (Send back) buttons do not appear.**
A. Only people in the first approval group (or a stand-in for them) can approve. Instead of the buttons, the screen shows 「**第一承認グループのメンバーのみ承認・差し戻しできます**」 (Only members of the first approval group can approve or send back).

**Q. The 「編集」 (Edit) button does not appear.**
A. You can only change a request while it is 「下書き」 (draft) or 「差し戻し」 (sent back). You cannot change it while it is waiting for approval, approved, or ordered. If you try anyway, the screen shows 「**下書き・差し戻しの購買依頼のみ編集できます**」 (Only draft or sent-back purchase requests can be edited).

**Q. I see 「明細を1件以上追加してください」 (Please add at least one line item) and cannot save.**
A. There is no material line at all. Choose a material in 「素材」 and press 「保存」 (Save) again.

**Q. I see 「素材を選択してください」 (Please select a material).**
A. The 「素材」 (material) box on the line item is empty. Click the box, search by material code or name, and choose from the list. Just typing the text does not count as choosing.

**Q. I want to withdraw a request.**
A. Before it becomes a purchase order (draft, waiting for approval, approved, or sent back), you can choose 「**キャンセル**」 (Cancel) from the 「**…**」 button at the top right of the screen. You must enter a reason. After it has become a purchase order, it cannot be withdrawn.

**Q. I cannot find a box for the price.**
A. A purchase request has no price box. You enter the price after it becomes a [material purchase order](/manual/en/apps/purchase-order/user).
