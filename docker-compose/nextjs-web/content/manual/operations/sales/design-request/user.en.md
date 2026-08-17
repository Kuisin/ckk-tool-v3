---
title: "Design Request — User Manual"
description: "An app for asking the design department to make a drawing, and for keeping each version of the finished drawing file."
screenshots: [design-request-list-01, design-request-new-01, design-request-detail-01, design-request-detail-02, design-request-files-01]
---
An app for asking the design department to make a drawing, and for **keeping each version** of the finished drawing file. The operation code is `SA05`.

> ⚠️ This app is still in trial release. The screens and the steps may change later.

## What you can do with this app

- You can write what you want designed and register it as a request.
- You can record whether the request came at quotation time or after the order.
- You can follow how the request is going with **未着手 (not started) → 進行中 (in progress) → 完了 (done)**.
- You can attach the finished drawing file and keep it **as separate versions, v1, v2 and so on**.
- If you set a product, the newest drawing on the [product master](/manual/en/operations/masters/product/user) is replaced when the request is done.

Use this when a customer asks about a special shape and a drawing is needed.

## Words used on this page

- **トリガー (trigger)** … what starts the design request. You choose either **見積時 (at quotation)** or **受注時 (at order)**.
- **見積時 (at quotation)** … when the drawing is made alongside the work, before the quote goes out.
- **受注時 (at order)** … when the drawing is made after the order is decided.
- **依頼内容 (request details)** … the text field where you write what you want designed.
- **バージョン（版）(version)** … a number that goes up each time the drawing is made again. It goes v1, v2, and the newest one is marked 「最新」(newest).
- **未着手 (not started) / 進行中 (in progress) / 完了 (done)** … where the request stands now.

## Before you start

- If the [product](/manual/en/operations/masters/product/user) the drawing is for is registered, the drawing can be kept as that product's newest drawing when the request is done. You can also make a request without choosing a product.
- If you register it as 見積時 (at quotation), having the [quote](/manual/en/operations/sales/quote/user) first lets you link the request to it.
- If you register it as 受注時 (at order), having the 注文請書 (sales order) first lets you link the request to it. Sales orders are made by 「伝票展開」(deploy) in [Order Acceptance](/manual/en/operations/sales/order-acceptance/user).
- To finish a request, **at least one drawing file must be attached**.

## Reading the screen

When you open the app, the requests so far are shown as a list.

![Design request list screen](../../../assets/screenshots/design-request-list-01.png)

- **依頼番号 (request number)** … a number starting with `DSG-`. It is added automatically when you save.
- **トリガー (trigger)** … 「見積時」(at quotation) or 「受注時」(at order) is shown as a badge.
- **状態 (status)** … a colored badge shows where it stands now. Gray is 「未着手」(not started), blue is 「進行中」(in progress), green is 「完了」(done).
- Type a request number, a product name, or a word from the request details in the search box at the top to narrow down the list. You can also narrow it down with「トリガー」(trigger) and「状態」(status) on the right.
- Click a row to open the detail screen for that request.

## Asking for a design

1. Press「**新規作成**」(New) at the top right of the list screen.
2. In「**トリガー**」(trigger), press「**見積時**」(at quotation) or「**受注時**」(at order) to choose it.
3. If you chose 見積時, choose the quote it is based on in the「**見積書**」(quote) field. You can also leave it empty.
4. If you chose 受注時, search for and choose the sales order it is based on in the「**注文請書**」(sales order) field. You can also leave it empty.
5. Choose the product in the「**製品**」(product) field. You can also leave it empty.
6. Write what you want designed in「**依頼内容**」(request details).
7. Press「**保存**」(save).

![New design request form](../../../assets/screenshots/design-request-new-01.png)

When you save, a request number is added and the detail screen opens.

> ⚠️ The「トリガー」(trigger), and the quote or sales order you chose there, **cannot be changed afterwards**. If you made a mistake, make a new request.

## Moving the request along

Right after you make it, the status is「**未着手**」(not started).

1. When the design work starts, press「**着手**」(start) at the top right of the screen.
2. The status changes to「**進行中**」(in progress).

![Design request that has not started](../../../assets/screenshots/design-request-detail-01.png)

While it is 未着手 (not started) or 進行中 (in progress), pressing「**編集**」(edit) at the top right lets you change the **製品 (product)** and the **依頼内容 (request details)**.

![Design request in progress, with the action menu open](../../../assets/screenshots/design-request-detail-02.png)

## Attaching a drawing file

1. Open the「**ファイル**」(files) tab on the request screen.
2. Press「**アップロード**」(upload) at the top right.
3. Choose the file (PDF, image, Excel or CSV; up to 20MB each).
4. If you like, write a note in「**ラベル（任意）**」(label, optional).
5. Press「**アップロード**」(upload).

![Files tab with the list of versions](../../../assets/screenshots/design-request-files-01.png)

To remove an attachment, press the bin mark to the right of the file, then press「**削除する**」(delete).

You can only attach files **before the status becomes 完了 (done)**.

## Finishing the request

1. Press「**…**」at the top right of the screen.
2. Choose「**完了**」(done).
3. A confirmation screen appears — press「**完了**」(done).

When it is done, the newest attached file at that moment is **registered as a version (v1, v2 …)** and marked「**最新**」(newest). The completion date is recorded too. On a request where you set a product, that product's newest drawing is switched to this version as well.

If a correction is needed after it is done, press「**差し戻し**」(send back) from「**…**」, then press「**差し戻す**」(send back). The status returns to 進行中 (in progress), and you can edit it and add files again. The completion date is cleared.

## Questions and problems

**Q. It says「設計ファイルを添付してから完了してください」(please attach a design file before finishing) and I cannot finish.**
A. No drawing file is attached yet. Upload the drawing from the「**ファイル**」(files) tab, then press「完了」(done) again.

**Q. I cannot edit a finished request.**
A. The rule is that a finished request cannot be edited and no files can be added. To change it, first use「**差し戻し**」(send back) to return it to 進行中 (in progress).

**Q. I cannot change the trigger or the quote field.**
A. The trigger, and the quote or sales order chosen there, cannot be changed after the request is made. If you made a mistake, make a new request, and either leave the wrong one as it is or talk to the person in charge.

**Q. Do I always have to choose a quote or a sales order?**
A. Both are optional. You can make a request without linking anything.

**Q. It says「未着手の設計依頼書のみ着手できます」(only design requests that have not started can be started).**
A. That request is already in progress or done. You do not need to press「着手」(start) again.

**Q. I want to replace the file after finishing.**
A. Use「差し戻し」(send back) to return it to 進行中 (in progress), upload the new file, then press「完了」(done) again. The old version stays, and the new version is added.
