---
title: "Site — User Manual"
description: "An app for registering the site (plant or business location) itself. Stock and shipping are managed for each site registered here."
screenshots: [master-plant-list-01, master-plant-new-01, master-plant-detail-01, master-plant-floor-maps-01, master-plant-regions-01]
---
This app is for registering **the site (plant or business location) itself**. The operation code is `MS0C`.

[Product stock (製品在庫)](/manual/en/apps/product-inventory/user) and [material stock (素材在庫)](/manual/en/apps/material-inventory/user) are kept separately for each site, and the delivery place for incoming materials is also chosen from the sites registered here.

> ⚠️ This app is in trial release. Depending on your environment, it may not be shown yet.

## The difference between three similar apps

There are three apps about places, and they are easy to mix up. Please take care.

| App | What you register | Example |
|--------|----------------|-----|
| **拠点 (Site)** (this page) | The factory itself | Head office plant, second plant |
| [作業場所 (Work location)](/manual/en/masters/work-location/user) | A place or machine inside the site where work is done | NC lathe no. 1, polishing area |
| [保管場所 (Storage location)](/manual/en/masters/storage-location/user) | A warehouse or shelf inside the site where things are kept | Shelf A-1 in material warehouse A |

For both work locations and storage locations, you choose which site they are in when you register them. So please **register the site first**.

## What you can do with this app

- You can register the basic information of a site (code, name, address, phone number and so on).
- You can register **regions** that group sites together.
- You can register a **drawing** (floor map) for each floor of the site.

## Words used on this page

- **Site** … a factory where production, stock keeping and shipping are done.
- **Region** … a group that brings several sites together, for example 関東 (Kanto). It is used for permission settings such as "in charge of the sites in this region only".
- **Floor map** … the drawing of a floor of the site. On this drawing you can place marks for storage locations and shared tablets.

## Before you start

- You need the **master permission** to use this app.
- The **warehouses and shelves** inside a site are not registered in this app. You register them in [storage location (保管場所)](/manual/en/masters/storage-location/user). This app only handles the drawings.

## How to read the screen

When you open the app, a list of the registered sites is shown.

![List screen of sites](../../assets/screenshots/master-plant-list-01.png)

- The list columns are **コード** (code) / **名称** (name) / **国** (country) / **地域** (region) / **状態** (status) / **更新日** (updated on).
- Use the 「**コード・名称で検索**」 (search by code or name) box at the top to narrow down to the site you are looking for. You can also narrow it by 「**状態**」 (status).
- At the top right there is a 「**地域管理**」 (Manage regions) button as well as 「**新規作成**」 (New).
- Click a row to open the detail screen of that site.

## Register a site

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Enter a short text that stands for this site in 「**拠点コード**」 (site code), for example `F01`.
3. Enter the name of the site in the Japanese box of 「**名称**」 (name), for example 本社工場 (head office plant).
4. Enter how it is read in 「**よみがな**」 (reading), for example ほんしゃこうじょう.
5. Choose 「**国**」 (country) under 「**連絡先・住所**」 (contact and address). 日本 (Japan) is filled in at the start.
6. Choose 「**地域**」 (region). If you have not registered any, you can leave it empty.
7. Enter 「**郵便番号**」 (postal code), 「**住所**」 (address), 「**電話番号**」 (phone number), 「**メールアドレス**」 (email address) and 「**担当者**」 (contact person).
8. Press 「**保存**」 (Save).

![New entry form for a site](../../assets/screenshots/master-plant-new-01.png)

> ⚠️ 「**拠点コード**」 (site code) cannot be changed after you save. The name and the address can be corrected later.

## Check a registered site

Click a row in the list to open the detail screen of that site.

![Detail screen of a site](../../assets/screenshots/master-plant-detail-01.png)

The site code, name, reading, country, postal code, address, phone number, email address and contact person are shown at the top. Below there are two tabs.

- **概要** (overview) … shows what you wrote in the remarks.
- **フロアマップ** (floor maps) … where you manage the floor drawings. See the explanation below.

To correct the content, press 「**編集**」 (Edit) at the top right. From the 「**…**」 (the three-dot button) to its right, you can use **無効化** (Deactivate) and **削除** (Delete).

## Register a region

When you want to group several sites together, register a region. You can make a group such as "all the sites in Kanto".

1. Press 「**地域管理**」 (Manage regions) at the top right of the list screen.
2. In the bottom row of the table, enter a 「**コード**」 (code), for example `jp`.
3. Enter 「**名称（日本語）**」 (name in Japanese), for example 日本, and 「**名称（英語）**」 (name in English), for example Japan.
4. Press 「**追加**」 (Add).

![Region management screen](../../assets/screenshots/master-plant-regions-01.png)

The table has the columns **コード** (code) / **名称（日本語）** (name in Japanese) / **名称（英語）** (name in English) / **拠点数** (number of sites) / **状態** (status) / **操作** (actions). 「**拠点数**」 (number of sites) is the number of sites that have chosen that region. Use the buttons at the right of a row to edit, deactivate or delete it.

The regions you register become selectable in 「**地域**」 (region) on the site edit screen.

> ⚠️ The **code** of a region cannot be changed after you make it. Also, only a region whose number of sites is 0 can be deleted.

## Register a floor map

Once you register a drawing of a floor of the site, you can place marks on it for storage locations and shared tablets.

1. On the detail screen of the site, open the 「**フロアマップ**」 (floor maps) tab.
2. Press 「**フロアを追加**」 (Add floor).
3. Enter 「**フロア名**」 (floor name), for example `1F 加工場` (1F machining shop).
4. Press 「**追加**」 (Add).
5. Choose the floor you added and pick the image of the drawing from 「**図面をアップロード**」 (Upload drawing).

![Floor maps tab of a site](../../assets/screenshots/master-plant-floor-maps-01.png)

- To swap the drawing, press 「**図面を差し替え**」 (Replace drawing).
- To change the name of the floor, press 「**名称変更**」 (Rename).
- When there are two or more floors, 「**重ね表示**」 (Overlay) lets you show another floor's drawing faintly on top. You can use it to line the floors up with each other.
- To remove a floor, press 「**フロアを削除**」 (Delete floor).

Registering and swapping drawings is done only in this app. On the [storage location (保管場所)](/manual/en/masters/storage-location/user) screen you can only place marks on this drawing.

## Questions and problems

**Q. The storage location screen shows 「この拠点にはフロアマップがありません」 (this site has no floor map).**
A. No drawing has been registered for that site yet. Add a floor on the 「フロアマップ」 (floor maps) tab of this app and upload a drawing.

**Q. I cannot delete a floor.**
A. Marks for shared tablets or storage locations are still placed on that floor's drawing. Remove the marks first and then try again. The confirmation screen also shows 「**端末・保管場所のピンが残っている場合は削除できません。**」 (it cannot be deleted while tablet or storage location pins remain).

**Q. I cannot delete a site.**
A. It cannot be deleted while there are stock or step records that used that site. For a site you no longer use, choose 「**無効化**」 (Deactivate) instead of deleting. Once it is inactive it can no longer be chosen for new stock, shipping or steps, and the past records stay as they are.

**Q. I see 「この地域は 2 件の拠点から参照されているため削除できません（先に拠点の地域を変更してください）」 (this region cannot be deleted because 2 sites refer to it; please change the region of the sites first).**
A. There are still sites that have chosen that region. Change 「**地域**」 (region) on the site edit screen to another one (or empty it), and then it can be deleted.

**Q. Where do I register warehouses and shelves?**
A. Not in this app. You register them in [storage location (保管場所)](/manual/en/masters/storage-location/user).

**Q. Where do I register machines and places where work is done?**
A. Not in this app. You register them in [work location (作業場所)](/manual/en/masters/work-location/user).
