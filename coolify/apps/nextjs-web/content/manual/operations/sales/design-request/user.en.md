---
title: "Design Request — User Manual"
description: "An app for asking the design department to make a drawing, and for keeping each version of the finished drawing file."
screenshots: [design-request-list-01, design-request-new-01, design-request-detail-01, design-request-detail-02, design-request-files-01]
---
An app for asking the design department to make a drawing, and for **keeping each version** of the finished drawing file. The operation code is `SA06`.

> ⚠️ This app is still in trial release. The screens and the steps may change later.

## What you can do with this app

- You can write what you want designed and register it as a request.
- You can raise one **with the source document already linked** from the [quote](/manual/en/operations/sales/quote/user), an order line, or the [product master](/manual/en/operations/masters/product/user).
- You can record whether the request came at quotation time, after the order, or **on its own with neither**.
- You can **name the person who will make the drawing**. They get a notification.
- **New or revision is decided automatically** — 改訂 (revision) if the product already has a past design, 新規 (new) if it does not.
- You can set a **希望納期 (due date)** and a **優先度 (priority)**, then sort and spot late requests in the list.
- You can require **approval before the design starts**. The approval steps are set in [Approval settings](/manual/en/operations/masters/approval-setting/user).
- You can attach the finished drawing file and keep it **as separate versions, v1, v2 and so on**.
- An approved request can be **printed as a PDF document** to hand to manufacturing on paper.
- If you set a product, the newest drawing on the [product master](/manual/en/operations/masters/product/user) is replaced when the request is done.

Use this when a customer asks about a special shape and a drawing is needed.

## The order a request goes through

```
下書き → 承認依頼中 → 未着手 → 進行中 → 完了
(draft)  (awaiting)  (not started) (in progress) (done)
           ↓ (sent back)
        差し戻し → (fix it and send it again)
```

- Right after you make it, it is **下書き (draft)**. This is the only time you can change the contents freely.
- Pressing「承認依頼」(request approval) makes it **承認依頼中 (awaiting approval)** and notifies the approvers.
- Once approved it becomes **未着手 (not started — approved, waiting to begin)**, and **the assignee is notified to start**.
- The assignee presses「着手」(start) for **進行中 (in progress)**, attaches the drawing and presses「完了」(done) for **完了 (done)**.

## Words used on this page

- **トリガー (trigger)** … what starts the design request. You choose **見積時 (at quotation)**, **受注時 (at order)** or **単独 (standalone)**.
- **見積時 (at quotation)** … when the drawing is made alongside the work, before the quote goes out.
- **受注時 (at order)** … when the drawing is made after the order is decided.
- **単独 (standalone)** … tied to neither a quote nor an order line. Use it when **no paperwork exists yet** — exploring a new product, an early enquiry from a customer, an internal improvement.
- **担当者 (assignee)** … the manufacturing person who makes the drawing. They are notified once the request is approved.
- **依頼区分 (request kind)** … either **新規 (new)** or **改訂 (revision)**. Decided automatically when you pick a product.
- **元図面 (base drawing)** … on a revision, which version is being redrawn from.
- **変更理由 (change reason)** … on a revision, why it is being redrawn.
- **依頼内容 (request details)** … the text field where you write what you want designed.
- **バージョン（版）(version)** … a number that goes up each time the drawing is made again. It goes v1, v2, and the newest one is marked「最新」(newest). **Every file uploaded in one completion shares the same version.**
- **プレビュー用 (preview)** … a file for checking the shape on screen (STL and the like). You can rotate it.
- **図面データ (blueprint)** … the file a machining program is written from (CAD and the like). The product master's newest drawing points at this.
- **参考資料 (reference material)** … the other files of the same version — part drawings, dimension tables.
- **下書き (draft) / 承認依頼中 (awaiting approval) / 未着手 (not started) / 進行中 (in progress) / 完了 (done) / 差し戻し (sent back) / キャンセル (cancelled)** … where the request stands now.

## Before you start

- **Approval settings must have steps registered for 設計依頼書 (design request).** Without them, pressing「承認依頼」(request approval) shows a message. Ask an administrator.
- **Register the [product](/manual/en/operations/masters/product/user) the drawing is for first — it is required.** Even a brand-new product can be registered with **just a name and a unit**. Without a product, new-versus-revision cannot be decided.
- If you register it as 見積時 (at quotation), having the [quote](/manual/en/operations/sales/quote/user) first lets you link the request to it.
- If you register it as 受注時 (at order), having the 注文明細 (order line) first lets you link the request to it. Order lines are made by 「注文確定」(deploy) in [Order Acceptance](/manual/en/operations/sales/order-acceptance/user).
- To finish a request, **at least one drawing file must be attached**.

## Reading the screen

When you open the app, the requests so far are shown as a list.

![Design request list screen](../../../assets/screenshots/design-request-list-01.png)

- **依頼番号 (request number)** … a number starting with `DSG-`. It is added automatically when you save.
- **トリガー (trigger)** … 「見積時」(at quotation) or 「受注時」(at order) is shown as a badge.
- **担当者 (assignee)** … the person who makes the drawing.
- **状態 (status)** … a colored badge shows where it stands now. Gray is「下書き」(draft), yellow is「承認依頼中」(awaiting approval), blue is「未着手」(not started), violet is「進行中」(in progress), green is「完了」(done), red is「差し戻し」(sent back) and「キャンセル」(cancelled).
- Type a request number, a product name, or a word from the request details in the search box at the top to narrow down the list. You can also narrow it down with「トリガー」(trigger),「担当者」(assignee) and「状態」(status) on the right.
- Click a row to open the detail screen for that request.

## Asking for a design

1. Press「**新規作成**」(New) at the top right of the list screen.
2. In「**トリガー**」(trigger), press「**見積時**」(at quotation) or「**受注時**」(at order) to choose it.
3. If you chose 見積時, choose the quote it is based on in the「**見積書**」(quote) field. You can also leave it empty.
4. If you chose 受注時, search for and choose the order line it is based on in the「**注文明細**」(order line) field. You can also leave it empty. If you chose 単独, no reference field appears.
5. Choose the product in the「**製品**」(product) field — required. Picking it flips「**依頼区分**」(request kind) below to 新規 (new) or 改訂 (revision) automatically.
6. Choose who will make the drawing in the「**担当者**」(assignee) field.
7. Set「**希望納期**」(due date) and「**優先度**」(priority) if you need them.
8. When the kind is 改訂 (revision), fill in「**元図面**」(base drawing — leave empty for the newest version) and「**変更理由**」(change reason, required).
9. Write what you want designed in「**依頼内容**」(request details).
10. Press「**保存**」(save).

![New design request form](../../../assets/screenshots/design-request-new-01.png)

When you save, a request number is added and the detail screen opens. At this point it is still a **下書き (draft)**.

> ⚠️ The「トリガー」(trigger), and the quote or order line you chose there, **cannot be changed afterwards**. If you made a mistake, make a new request.

### How new versus revision is decided

「**依頼区分**」(request kind) is decided automatically from **whether the product you chose already has a past design version**. The reason is shown on screen too — for example「この製品には v2 まであります → 改訂」(this product has versions up to v2 → revision).

If the call is wrong you can **switch it by hand** right there; it then shows as 手動指定 (set manually). Press「**自動判定に戻す**」(back to automatic) to undo.

The kind is **stored as it was when the request was made**. If another request finishes first later on, this request's kind does not move — otherwise, where approval steps are split by kind, the request would no longer match what was approved.

If you came from a quote or an order line with「**設計依頼を起票**」(raise a design request), the trigger and the reference are already filled in. The trigger cannot be switched in that case, because switching it would quietly break the link back to where you came from.

## Where to raise one from

「新規作成」(New) on the list works, but raising it from these places **opens the form with the reference already filled in**, so there is nothing to link up afterwards.

| From | What gets filled in |
|------|---------------------|
| [Quote](/manual/en/operations/sales/quote/user) →「…」→「設計依頼を起票」 | Trigger = 見積時 (at quotation) + that quote |
| Order line →「…」→「設計依頼を起票」 | Trigger = 受注時 (at order) + that order line |
| [Product master](/manual/en/operations/masters/product/user) →「…」→「設計依頼を起票」 | That product |
| 「設計依頼を起票」 next to「価格表なし」(no price list) on a quote line | That product |

The last one is the way out when **a new product has no price to resolve**. There usually is no price list because there is no drawing yet — so you can ask for the drawing right there.

> Coming from a route that carries a product (product master, or "no price list") opens the form with the required 製品 (product) already filled in. Coming from a quote or an order line, just pick the product — new versus revision is decided the moment you do.

A request you raised is reachable back from the「関連」(related) tab of the source document —「設計」(design) on an order line.

## Requesting approval

1. Open a draft request and a card saying「**承認を依頼できます**」(you can request approval) appears at the top.
2. Press「**承認依頼**」(request approval).
3. The status changes to「**承認依頼中**」(awaiting approval) and the approvers are notified.

People with approval rights see「**承認**」(approve) and「**差し戻し**」(send back) in the same place.

- **承認 (approve)** moves it to the next step. Once the last step passes it becomes「**未着手**」(not started) and the assignee is notified.
- **差し戻し (send back)** asks for a reason. After you send it back the status becomes「**差し戻し**」(sent back) and the requester can fix it and send it again.

How many approval steps there are, and who approves, is decided in [Approval settings](/manual/en/operations/masters/approval-setting/user).

## Moving the request along

Once approval passes, the status is「**未着手**」(not started).

1. When the design work starts, press「**着手**」(start) at the top of the screen.
2. The status changes to「**進行中**」(in progress) and the requester is notified.

![Design request that has not started](../../../assets/screenshots/design-request-detail-01.png)

While it is 未着手 (not started) or 進行中 (in progress),「**…**」lets you change the **担当者 (assignee)** and the **製品 (product)**. The 依頼内容 (request details) is what was approved, so it cannot be changed at this stage — cancel and make a new request if the content itself changes.

![Design request in progress, with the action menu open](../../../assets/screenshots/design-request-detail-02.png)

## Attaching a drawing file

1. Open the「**ファイル**」(files) tab on the request screen.
2. Press「**アップロード**」(upload) at the top right.
3. Choose the file (**no format restriction** — PDF, images, 3D models, Excel and so on; up to 20MB each).
4. If you like, write a note in「**ラベル（任意）**」(label, optional).
5. Press「**アップロード**」(upload).

![Files tab with the list of versions](../../../assets/screenshots/design-request-files-01.png)

To remove an attachment, press the bin mark to the right of the file, then press「**削除する**」(delete).

You can only attach files **between approval and completion** (未着手 and 進行中).

### Viewing a drawing on screen

Registered versions open in the app from「**表示**」(view) next to the file name. PDFs and images show as they are, and **3D models such as STL can be rotated** — drag to orbit, wheel to zoom.

STEP, IGES, DXF and DWG cannot be opened here; download them and use your own software.

## Finishing the request

1. Press「**…**」at the top right of the screen.
2. Choose「**完了**」(done).
3. The confirmation screen has a slot for **図面データ (blueprint)** (required, one file), **プレビュー用 (preview)** (optional, one file) and **参考資料 (reference material)** (optional, as many as you like). Put a file into each slot with「**ファイルを選択**」(choose a file).
4. Each piece of reference material can carry its own short **description** ("part drawing", "dimension table" …), so the version list later tells you what each file is.
5. Press「**完了**」(done). The upload starts at this point, not when you pick.

**Every file you upload lands in exactly one role.** There is no way to leave a file unassigned.

**One completion = one version.** Every file you picked gets the same version number (v1, v2 …). An assembly drawing, a part drawing and a 3D model raised together no longer land on different version numbers, so "please use v3" is never ambiguous.

**Versions are counted per product × customer.** The same product grows separate drawings for different customers, so customer A's v3 and customer B's v1 live side by side on one product. Which series a completion lands on is decided by the request's **受注元 (customer)**; leaving it empty makes the version *generic*, used by any customer that has no drawing of their own.

**Preview and blueprint are picked separately** because they do different jobs. For the same shape, an STL is *for looking at* and a CAD file is *for making from* — neither substitutes for the other. The product master's newest drawing points at the **blueprint**, while on-screen thumbnails prefer the **preview** when one exists. The completion date is recorded too, and the requester is notified — as is the sales rep on the quote, if it was raised at quoting time. On a request where you set a product, that product's newest drawing is switched to this version as well.

If a correction is needed after it is done, press「**差し戻し**」(send back) from「**…**」, then press「**差し戻す**」(send back). The status returns to 進行中 (in progress), and you can add files again. The completion date is cleared. This kind of send-back is **redoing the work**, so the approval does not have to be taken again.

## Printing the document

After approval (未着手, 進行中 or 完了) the「**PDF**」tab on the request screen shows the design request as a printable document. The「**PDF**」button at the top right opens it too.

The document carries the request number, **kind (new/revision)**, status, assignee, **due date**, priority, trigger and reference, the target product, **the base drawing and change reason** on a revision, the **request details**, the list of drawing file versions, and the approval and work history. It is an internal document meant to be handed to manufacturing on paper — do not send it outside the company.

While the contents can still change (未着手, 進行中) it is rebuilt fresh each time you open it. Once the request is done nothing moves any more, so the stored copy is shown as is.

> You cannot open the PDF before approval (下書き, 承認依頼中, 差し戻し). Only what was approved goes on paper.

## Cancelling a request

If the request itself is no longer needed, press「**キャンセル**」(cancel) from「**…**」, write a reason and confirm. If it was awaiting approval, it also disappears from the approval queue.

A finished request cannot be cancelled. Send it back to 進行中 (in progress) first.

## Input fields

Every field on the design request screen. The **?** next to a field in the app links straight to its description here.

| Field | Required | What to enter |
|-------|----------|---------------|
| [Trigger](#field-trigger) | Required | Raised at quoting time, after the order, or standalone |
| [Quote](#field-quote) | Conditional | The quote it relates to, when raised at quoting time |
| [Order line](#field-order-line) | Conditional | The order line it relates to, when raised after the order |
| [Product](#field-product) | Required | The product the drawing is for |
| [Customer](#field-customer-bp) | Optional | Which customer's series the version belongs to |
| [Assignee](#field-assignee) | Required | The manufacturing person who makes the drawing |
| [Due date](#field-desired-at) | Optional | When the drawing is needed by |
| [Priority](#field-priority) | Required | Normal or urgent |
| [Base drawing](#field-base-design-file) | Conditional | The version a revision is redrawn from |
| [Change reason](#field-change-reason) | Conditional | Why a revision is being redrawn |
| [Request details](#field-description) | Required | What needs to be designed |

### Trigger [#field-trigger]

Whether the request is **for a quote**, **for a confirmed order**, or **standalone (neither)**. Choosing 見積時 or 受注時 decides whether you then link a quote or an order line. Choosing 単独 shows no reference field — use it for a request raised before any paperwork exists, such as exploring a new product or an early customer enquiry.

### Quote [#field-quote]

Chosen when the trigger is quoting time. Recording which quote the design is for makes the history easy to follow later.

### Order line [#field-order-line]

Chosen when the trigger is after the order, recording which order the design is for.

### Product [#field-product]

The product the drawing is for. **Required.** Whether this product already has a past design decides new versus revision. A brand-new product can be registered in the product master with just a name and a unit, so register it first and then raise the request.

### Customer [#field-customer-bp]

Decides which customer's series the finished version lands on. When the request was raised from a quote or an order line, that document's customer is filled in already.

Left empty, the version is **generic** and is used by any customer that has no drawing of its own for that product. New-versus-revision is judged **within that series only** — if customer A has drawings but customer B does not, the request is **new** as far as B is concerned.

### Assignee [#field-assignee]

The manufacturing person who makes the drawing. Once the request is approved they are notified to start. You can still change them afterwards from「…」.

### Due date [#field-desired-at]

When the drawing is needed by. It can be left empty, but filling it in lets you sort the list and see at a glance which requests are past their date.

### Priority [#field-priority]

**通常 (normal)** or **急ぎ (urgent)**. When a due date is set that is usually the better guide, so priority is for "the date is not close, but please start on this one first".

### Base drawing [#field-base-design-file]

On a revision, **which version is being redrawn from**. Leave it empty to use the newest version at the time the kind was decided. If another revision finishes first while this request is open, that is recorded in the history on completion.

### Change reason [#field-change-reason]

On a revision, **why it is being redrawn**. It is a separate field from the request details, and it is what makes the difference between versions traceable later.

### Request details [#field-description]

What needs to be designed. **The manufacturing side works from this text alone**, so be specific: dimensions, shape, any existing item to work from, and anything to watch out for.

## Questions and problems

**Q. It says「設計依頼書の承認フローが未設定です」(no approval flow is set for design requests) and I cannot request approval.**
A. Approval settings has no steps for 設計依頼書 yet. Ask an administrator to add them in Approval settings (MS0B).

**Q. It says「設計ファイルを添付してから完了してください」(please attach a design file before finishing) and I cannot finish.**
A. No drawing file is attached yet. Upload the drawing from the「**ファイル**」(files) tab, then press「完了」(done) again.

**Q. It says 改訂 (revision) but this should be new.**
A. That product still has a past design version. If that does not match reality, switch the kind to 新規 (new) by hand — it will then show as 手動指定 (set manually).

**Q. Can I raise a request without choosing a product?**
A. No. The product is what decides new versus revision. A product that is not in the master yet can be registered with just a name and a unit.

**Q. Can I start before it is approved?**
A. No. You can start only after approval passes and it becomes 未着手 (not started).

**Q. I want to change the request details after approval.**
A. That is the content that was approved, so it cannot be changed. If the content itself changes, cancel and make a new request. Only the assignee and the product can be changed from「…」.

**Q. I cannot edit a finished request.**
A. The rule is that a finished request cannot have files added either. To change it, first use「**差し戻し**」(send back) to return it to 進行中 (in progress).

**Q. There seem to be two「差し戻し」(send back) — what is the difference?**
A. The one while awaiting approval is **an approver rejecting it**: the status becomes 差し戻し (sent back) and you fix it and send it again. The one after completion is **redrawing the drawing**: the status returns to 進行中 (in progress) and the approval is not taken again.

**Q. I cannot change the trigger or the quote field.**
A. The trigger, and the quote or order line chosen there, cannot be changed after the request is made. If you made a mistake, make a new request, and either leave the wrong one as it is or talk to the person in charge.

**Q. Do I always have to choose a quote or a order line?**
A. Both are optional. You can pick 見積時 or 受注時 and leave the reference empty — but if there is nothing to link to at all, choosing **単独 (standalone)** for the trigger says so far more clearly.

**Q. Can I ask for a drawing before any quote or order exists?**
A. Yes — choose **単独 (standalone)** for the trigger. It is meant for exploring a new product or an early customer enquiry. You cannot re-link it to a quote or an order line afterwards, so make a new request if that becomes necessary.

**Q. It says「未着手の設計依頼書のみ着手できます」(only design requests that have not started can be started).**
A. That request is already in progress or done. You do not need to press「着手」(start) again.

**Q. I want to replace the file after finishing.**
A. Use「差し戻し」(send back) to return it to 進行中 (in progress), upload the new file, then press「完了」(done) again. The old version stays, and the new version is added.
