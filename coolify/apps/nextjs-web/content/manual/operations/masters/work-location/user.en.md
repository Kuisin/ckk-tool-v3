---
title: "Work Location — User Manual"
description: "An app for registering the machines and areas where work is really done, such as NC lathe no. 1. They become selectable in the work plan of a work order."
screenshots: [master-work-location-01, master-work-location-models-01, master-work-location-model-new-01, master-work-location-group-new-01, master-work-location-add-01, master-work-location-types-01, master-work-location-qr-01, master-work-location-qr-print-01]
---
This app is for registering the **machines and areas where work is really done**, such as NC旋盤 1号機 (NC lathe no. 1). The operation code is `MS0D`.

The places registered here become selectable as "where the work is done" in the work plan of a step on a [指示書 (work order)](/manual/en/operations/production/work-order/user).

> ⚠️ This app is in trial release. Depending on your environment, it may not be shown yet.

## The difference between three similar apps

There are three apps about places, and they are easy to mix up. Please take care.

| App | What you register | Example |
|--------|----------------|-----|
| [拠点 (Site)](/manual/en/operations/masters/plant/user) | The factory itself | Head office plant, second plant |
| **作業場所 (Work location)** (this page) | A place or machine inside the site where work is done | NC lathe no. 1, polishing area |
| [保管場所 (Storage location)](/manual/en/operations/masters/storage-location/user) | A warehouse or shelf inside the site where things are kept | Shelf A-1 in material warehouse A |

**Places where people work** belong in this app; **places where things are kept** belong in the storage location app.

## What you can do with this app

- You can register machines and areas sorted into **groups** (sets by machine kind or by area).
- For each machine you can decide **how many jobs can be put on it at the same time** (the capacity).
- You can check how many work plans are using that machine right now.
- You can add your own **types** for sorting the groups.
- You can register **machine models** that group machines of the same type, and set which model each machine is. Machining programs are assigned to machine models.

## Words used on this page

- **Group** … the unit that brings work locations together. You make them by machine kind or by area, such as 「NC旋盤」 (NC lathe) or 「研磨エリア」 (polishing area). A group always belongs to one of the sites.
- **Work location** … one machine, or one area. It is always registered under one of the groups.
- **Capacity** … the number of jobs that can be put on that place at the same time. Leave it empty and there is no limit.
- **計画 / 実績** (plan / actual counts) … the number of work plans and work actuals that use that place.
- **Type** … the division used for sorting the groups. 「機械」 (machine) and 「エリア」 (area) are there from the start.
- **Machine model** … a name that groups machines of the same type (for example NC旋盤 A型, NC lathe type A). Choose one per machine. Machining programs on [drawings](/manual/en/operations/production/design-file/user) are assigned to machine models, so one program is enough however many machines of that type you have.

## Before you start

- You need the **master permission** to use this app.
- A group is given a site. Please register the [site (拠点)](/manual/en/operations/masters/plant/user) first.
- You register **the group first and the machine after that**. You cannot register a machine on its own without making a group.

As a diagram:

```mermaid
flowchart TD
  plant["Site"] --> group["Group<br/>(e.g. NC lathe)"]
  group --> loc["Work location<br/>(e.g. NC lathe no. 1)"]
  loc -.-> wo["Chosen as where the work is done<br/>in a work order's work plan"]
```

## How to read the screen

This app is not split into a list and a detail screen. **You do everything on one screen.**

![Work location screen](../../../assets/screenshots/master-work-location-01.png)

- At the top of the screen there are two tabs, 「**作業場所**」 (Work locations) and 「**機種**」 (Machine models). The Work locations tab opens first.
- At the top right of the screen there are the 「**種別管理**」 (Manage types) and 「**グループ追加**」 (Add group) buttons (「**機種を追加**」 (Add machine model) on the Machine models tab).
- The groups are shown as cards. The top of a card shows the code, name, type, site and status of that group.
- At the right of a card there are the 「**場所を追加**」 (Add location), 「**QR印刷**」 (Print QR), 「**編集**」 (Edit) and 「**削除**」 (Delete) buttons. 「QR印刷」 cannot be pressed while the group has no locations.
- The table inside a card lists the machines of that group in the order **コード** (code) / **名称** (name) / **機種** (machine model) / **キャパシティ** (capacity) / **計画 / 実績** (plan / actual counts) / **状態** (status).
- When nothing is registered yet, 「**作業場所が未登録です。グループ（機械種別・エリアなど）を作成し、配下に物理的な場所（機械 1 台・1 区画）を追加してください。**」 (no work locations are registered; create a group such as a machine kind or area, and add physical places under it, one machine or one area at a time) is shown.

## Make a group

First make the container that brings the machines together.

1. Press 「**グループ追加**」 (Add group) at the top right of the screen.
2. Enter text that stands for this group in 「**コード**」 (code), for example `NC-LATHE`.
3. Choose 「**種別**」 (type): machine, area, or a type you added yourself.
4. In 「**拠点**」 (site), choose the site this group is in.
5. Enter a number in 「**表示順**」 (display order). A smaller number comes higher.
6. Enter the name of the group in 「**名称（日本語）**」 (name, Japanese), for example NC旋盤 (NC lathe).
7. Press 「**作成**」 (Create).

![Screen for adding a group](../../../assets/screenshots/master-work-location-group-new-01.png)

## Add a machine (work location)

Once the group is made, register the machines inside it one at a time.

1. On the card of the group you want to add to, press 「**場所を追加**」 (Add location).
2. Enter text that stands for this machine in 「**コード**」 (code), for example `NC-01`.
3. Enter the number of jobs that can be on it at the same time in 「**キャパシティ**」 (capacity). If it is one at a time on one machine, that is `1`. Leave it empty for "no limit".
4. In 「**機種**」 (machine model), choose this machine's model (register the [machine models](#machine-models) first). Leave it empty for places without a model, such as areas or benches.
5. Enter a number in 「**表示順**」 (display order).
6. Enter the name of the machine in 「**名称（日本語）**」 (name, Japanese), for example NC旋盤 1号機 (NC lathe no. 1).
7. Press 「**追加**」 (Add).

![Screen for adding a work location](../../../assets/screenshots/master-work-location-add-01.png)

The machines you register are listed in the table on that group's card. Use the buttons at the right of a table row to edit or delete it.

> 💡 If you set the capacity to `1`, it is easier to notice when two or more jobs are on that machine at the same time.

## Register machine models [#machine-models]

**Machine models**, which group machines of the same type, are registered on the 「**機種**」 (Machine models) tab.

![Machine models tab](../../../assets/screenshots/master-work-location-models-01.png)

1. Open the 「**機種**」 (Machine models) tab at the top of the screen.
2. Press 「**機種を追加**」 (Add machine model) at the top right.
3. Enter text that stands for the model in 「**コード**」 (code), for example `NC-LATHE-A`.
4. Enter the model's name in 「**名称（日本語）**」 (name, Japanese), for example NC旋盤 A型 (NC lathe type A). Names in English and Chinese can be added with 「多言語」 (Translations).
5. Enter 「**メーカー**」 (maker), 「**表示順**」 (display order) and 「**備考**」 (notes) if needed.
6. Press 「**追加**」 (Add).

![Screen for adding a machine model](../../../assets/screenshots/master-work-location-model-new-01.png)

The table lists **code / name / maker / number of machines and programs / status** for each model. After registering, edit the machines on the Work locations tab and choose their 「**機種**」 (machine model).

- When a step is worked on a machine that has a model, the step execution screen lists the machining programs for that model first, marked 「**この機種用**」 (for this machine model).
- A model used by machines or programs cannot be deleted. When it is no longer used, turn off 「**有効**」 (active) to disable it (a disabled model is no longer offered for new choices).

## Add more types

You can add your own divisions for sorting the groups. Use this when you want groupings such as 「ライン」 (line) or 「検査室」 (inspection room).

1. Press 「**種別管理**」 (Manage types) at the top right of the screen.
2. Press 「**種別を追加**」 (Add a type) at the bottom to add a row.
3. In the left box, enter text that stands for the division, for example `line`. Small letters, numbers, hyphens and underscores can be used.
4. In the middle box, enter the Japanese display name, for example ライン (line).
5. Press 「**保存**」 (Save).

![Type management screen](../../../assets/screenshots/master-work-location-types-01.png)

「**機械**」 (machine) and 「**エリア**」 (area) are prepared from the start. They are shown as 「**組み込み**」 (built in) and cannot be deleted or renamed.

## Print QR labels

You can print **QR labels** to stick on machines and areas. When a worker scans the QR on a shared floor tablet while running a step, "where the work happened" is recorded on the work actual.

- The 「**QR印刷**」 (print QR) button on a group prints all locations in that group at once
- The QR icon on a row prints just that one location

![The QR print button on a group](../../../assets/screenshots/master-work-location-qr-01.png)

The print sheet opens in a new tab. Print it on plain A4 paper as-is, cut along the cross marks, and stick the labels somewhere easy to see on the machine or area.

![The QR label print sheet](../../../assets/screenshots/master-work-location-qr-print-01.png)

> 💡 Print from the browser at 100% scale. If the "50mm" ruler printed at the top of the sheet measures 50mm with a real ruler, the labels are actual size.
>
> ⚠️ If you change a work location's **code**, printed labels stop working. Re-print and replace them after a change.

## How it connects to work orders

In the 「**作業計画**」 (work plan) and 「**作業実績**」 (work actuals) of a step on a work order, you can choose 「**作業場所（任意）**」 (work location, optional) for each row. The chosen location is shown in the lists, and can also be seen on the shared tablet screen on the floor.

When a step is started or resumed from a shared floor tablet, the tablet's **default work location** is recorded on the actual automatically (set in [Devices](/manual/en/operations/system/kiosk-device/user#field-default-work-location)). Scanning a work-location QR overrides it.

[Process steps](/manual/en/operations/masters/process-step/user#field-allowed-locations) can also restrict which work locations a step may use, by type or by individual location.

On the lines of an [order acceptance](/manual/en/operations/sales/order-acceptance/user#field-shipping-work-location), you can choose the place where shipping work is done as 「**出荷作業場所**」 (shipping work location). To see, for each work location, which steps are waiting on a given day, use the [work location board](/manual/en/operations/production/work-location-board/user).

Usage counts appear in the 「**計画 / 実績**」 (plans / actuals) column of the work location table. A place where either count is not 0 is still in use. A place is also treated as in use when it is the default work location of a shared device, the shipping work location of an order acceptance or of an order line, or an allowed work location of a process step. Places in use cannot be deleted — deactivate them instead. When you try to delete one, the confirmation screen lists every place it is used and how many times.

## Input fields

Every field on the Work location screen.

| Field | What to enter |
|-------|---------------|
| [Site](#field-plant) | Which site the work location belongs to |
| [Code / name](#field-code) | The work location's code and name, selectable as where a step is carried out |
| [Type](#field-type) | The kind of work location |
| [Capacity](#field-capacity) | A guide to how much it can handle at once |
| [Machine model](#field-machine-model) | The machine model of this machine |
| [Sort order / active / notes](#field-sort-order) | Ordering, whether it is offered, and notes |
| [Machine model code / name](#field-machine-model-code) | The machine model's code and name (Machine models tab) |
| [Maker](#field-machine-model-maker) | The maker of the machine model (Machine models tab, optional) |

### Site [#field-plant]

Which site the work location belongs to. When picking where a step runs, **only that site's work locations** are offered.

### Code / name [#field-code]

The work location's code and name, selectable as where a step is carried out.

### Type [#field-type]

The kind of group (machine, area, and so on). It is also used when you decide, in process steps, which work locations a step may use by type.

### Capacity [#field-capacity]

How many jobs can be on it at the same time. Leave it empty for no limit. Enter 1 for a single machine that does one job at a time.

### Machine model [#field-machine-model]

The machine model of this machine. Machining programs are assigned to machine models, so programs for the model chosen here are shown first as 「**この機種用**」 (for this machine model) on the step execution screen. Leave it empty for areas and benches.

### Sort order / active / notes [#field-sort-order]

Ordering, whether it is offered, and notes.

### Machine model code / name [#field-machine-model-code]

The machine model's code and name, chosen from both machines and machining programs.

### Maker [#field-machine-model-maker]

The maker of the machine model (optional).

## Questions and problems

**Q. I want to add a machine, but I cannot find the 「場所を追加」 (Add location) button.**
A. This button is inside a group card. When there is no group at all yet, make one first with 「**グループ追加**」 (Add group).

**Q. I see 「この場所は 作業計画 3 件 / 注文明細の出荷作業場所 1 件 から参照されています（削除できません — 無効化をご検討ください）。」 (this location is referred to by 3 work plans / 1 order-line shipping work location; it cannot be deleted, please consider deactivating it).**
A. That machine is in use in the places listed in the message (work plans, work actuals, a shared device's default, the shipping work location of an order acceptance or order line, or a process step's allowed work locations). Do not delete it. Turn off 「**有効**」 (active) on the edit screen to make it inactive. Once it is inactive it can no longer be chosen in plans made from now on.

**Q. I see 「使用中の作業場所は削除できません（作業計画 2 件 / 共有端末の既定 1 台）」 (a work location in use cannot be deleted; 2 work plans / default of 1 shared device).**
A. The place you tried to delete (or, when deleting a group, a machine inside it) is still used somewhere. The parentheses show where and how many. Do not delete it. Turn off 「**有効**」 (active) on the edit screen to make it inactive.

**Q. If I delete a group, what happens to the machines inside it?**
A. They are deleted with it. The confirmation screen shows how many machines will be deleted. This cannot be undone.

**Q. I see 「使用中の種別は削除できません」 (a type in use cannot be deleted).**
A. There is a group that has chosen that type. First change 「**種別**」 (type) of that group to another one, and then try again.

**Q. I see 「存在しない種別です（先に種別を追加してください）」 (this type does not exist; please add the type first).**
A. The type you tried to choose is not registered yet. Add it in 「**種別管理**」 (Manage types) and then save the group.

**Q. I see 「機械 2 台・プログラム 1 本が使っているため削除できません（無効化してください）」 (it cannot be deleted because 2 machines and 1 program use it; please deactivate it).**
A. Some machines have that model selected, or some machining programs are assigned to it. Do not delete it — turn off 「**有効**」 (active) on the machine model's edit screen instead.

**Q. I want to register warehouses and shelves. Is this the right place?**
A. No. Places where things are kept are registered in [storage location (保管場所)](/manual/en/operations/masters/storage-location/user).

<!-- permissions:start -->
## Permissions required

Using this screen requires the **Master data** (`master`) permission.

| What you want to do | Permission needed |
| --- | --- |
| Open the screen, view lists and details | Master data — View |
| Add, change or delete | Master data — Create / Edit / Delete |

Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
