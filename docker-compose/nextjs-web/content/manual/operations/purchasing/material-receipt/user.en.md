---
title: "Material Receipt — User Manual"
description: "An app for recording that material has arrived. Once you record it, the stock at that site goes up by the same amount."
screenshots: [material-receipt-list-01, material-receipt-new-01, material-receipt-detail-01, material-receipt-detail-02]
---
This is the **素材入荷** (material receipt) app, where you record that material has arrived. The operation code is `PU03`.

> ⚠️ This app is still being prepared, so it may not appear on the live system yet. If you cannot find it, please ask the person in charge at your company.

## What you can do with this app

- You can record that material has arrived. When you do, **the stock at that site goes up by the same amount**.
- You can look back at what arrived, when, where, and how many pieces.
- You can keep copies of delivery notes and inspection reports attached to the arrival record.
- Use it when material bought without a purchase order (material brought in directly, for example) arrives.

## Words used on this page

- **入荷** (arrival) … material actually arriving.
- **発注入荷** (arrival from an order) … an arrival of material ordered with a [material purchase order](/manual/en/operations/purchasing/purchase-order/user). **It is recorded automatically.**
- **直接調達** (direct purchase) … an arrival of material bought without a purchase order. **You type it in on this screen.**
- **入荷先拠点** (receiving site) … the site (plant or business location) that receives the material.
- **証憑** (supporting document) … papers you may want to look at later, such as a copy of the delivery note or an inspection report.

## Before you start

- The **material that arrived must be registered in the [material master](/manual/en/operations/masters/material/user)**. You cannot choose a material that is not registered.
- To choose the site whose stock should go up, that **[site](/manual/en/operations/masters/plant/user) must be registered**.
- You need material receipt permission to register arrivals. If the buttons do not appear, please ask the person in charge at your company.

> ⚠️ When material you ordered with a purchase order arrives, do not register it here. Press 「**入荷完了**」 (Receiving complete) on the [material purchase order](/manual/en/operations/purchasing/purchase-order/user) screen and the arrival record is created automatically.

## How to read the screen

When you open the app, the arrival records are listed with the newest first.

![Material receipt list](../../../assets/screenshots/material-receipt-list-01.png)

- **素材** (material) … the material code on top and the material name below.
- **発注明細** (order line) … for material that came from a purchase order, the order number starting with `PO-` appears as a blue link. For material that did not go through a purchase order, a grey 「**直接調達**」 (direct purchase) badge appears.
- Type a material code, a name, a supplier, or an order number into the search box at the top to narrow down the list.
- The 「**入荷区分**」 (arrival type) box on the right lets you show only 「発注入荷」 (arrivals from an order) or only 「直接調達」 (direct purchases).
- Click a row to open the detail screen for that arrival.

## Registering material that arrived (direct purchase)

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Click the 「**素材**」 (material) box, search by material code or name, and choose one. You must choose one.
3. Choose the 「**仕入先**」 (supplier). You may leave it blank.
4. Choose the site that received the material in 「**入荷先拠点**」 (receiving site).
5. Check the 「**入荷日**」 (arrival date). It starts with today's date.
6. Enter how many pieces arrived in 「**数量**」 (quantity).
7. Check the 「**単位**」 (unit). It starts with 「本」 (pieces).
8. To keep a copy of the delivery note with the record, press 「**ファイルを選択**」 (Choose file) under 「**証憑（任意）**」 (supporting document, optional) and choose the file.
9. Finally, press 「**登録**」 (Register).

![New material receipt form](../../../assets/screenshots/material-receipt-new-01.png)

When you register it, the material stock at the site you chose goes up by that amount, and the detail screen opens.

> ⚠️ If you register with 「入荷先拠点」 (receiving site) left blank, the material does not go into any site's stock — it is treated as stock with no site. This cannot be fixed afterwards, so please always choose the site that received it.

You can attach PDF, PNG, JPG, WEBP, HEIC, XLSX, and CSV files, up to 20MB each.

## Looking at what you recorded

Click a row in the list to open the detail screen for that arrival.

![Detail screen of an arrival from a purchase order](../../../assets/screenshots/material-receipt-detail-01.png)

- You can check the material, supplier, receiving site, quantity, arrival date, and notes.
- **発注明細** (order line) … for material that came from a purchase order, a link to the original [material purchase order](/manual/en/operations/purchasing/purchase-order/user) is shown. Click it to check the order.
- For a direct purchase, the screen shows 「**直接調達（発注書なし）**」 (direct purchase — no purchase order).

![Detail screen of a direct purchase arrival](../../../assets/screenshots/material-receipt-detail-02.png)

- You can add or delete files later from the 「証憑」 (supporting documents) box.

## Questions and problems

**Q. Material I ordered has arrived. Do I register it here?**
A. No. Please press 「**入荷完了**」 (Receiving complete) on the [material purchase order](/manual/en/operations/purchasing/purchase-order/user) screen. The arrival record is created from there automatically. If you type it in here as well, the same material goes into stock twice.

**Q. Only part of the order arrived first.**
A. 「入荷完了」 (Receiving complete) on the purchase order handles all the remaining quantity at once. For a partial delivery, register only the number of pieces that arrived on this screen.

**Q. I want to change what I registered.**
A. An arrival record is a fixed record made after the stock has already moved, so it cannot be changed or deleted. There are no 「編集」 (Edit) or 「削除」 (Delete) buttons. Please check the quantity and the site carefully before you register.

**Q. I see 「素材を選択してください」 (Please select a material) and cannot register.**
A. The 「素材」 (material) box is still empty. Click the box, search by material code or name, and choose from the list. Just typing the text does not count as choosing.

**Q. I see 「20MB を超えるファイルは添付できません」 (Files over 20MB cannot be attached).**
A. The file you chose is too big. If it is a photo, take it again at a smaller size, or combine the pages into a PDF and choose that instead.

**Q. I registered it, but the stock at that site has not gone up.**
A. Please open the detail screen and check whether it was registered with 「入荷先拠点」 (receiving site) left blank. If no site was chosen, it is recorded as stock with no site instead of stock at that site.
