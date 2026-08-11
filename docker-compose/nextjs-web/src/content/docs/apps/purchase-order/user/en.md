# Material Purchase Order — User Manual

Operation code **PU03**. Manages material orders to suppliers through request → approval → order → receiving. PO numbers are **PO-YYYYMM-NNNNN**.

> This app is currently available **in the development (dev) environment only**. Screens and steps may change before the production release.

## What you can do here

- Create material purchase orders (素材発注書) per supplier and place them through an approval flow. Creating, editing, and ordering require the purchase-order permission.
- Once ordered, the line items are automatically reflected as **expected arrivals** in [material inventory (素材在庫, PD05)](/docs/apps/material-inventory/user).
- **Complete receiving** automatically creates a [material receipt (素材入荷, PU01)](/docs/apps/material-receipt/user) record per line item and posts the stock to the receiving factory's material inventory.
- A purchase order can also be created by converting a [purchase request (購買依頼, PU04)](/docs/apps/purchase-request/user).

## Statuses and flow

- **下書き** (draft) — right after creation. The only state in which editing and cancelling are possible. The **Request approval** button starts the approval flow.
- **承認依頼中** (approval requested) — only members of the first approval group (or delegates) can **Approve** or **Send back**. Sending back (reason required) returns the order to draft. The approval request also appears in [approval management (承認管理, PD03)](/docs/apps/approval/user).
- **承認済** (approved) — the **Order** button moves it to ordered. Before ordering, cancellation (reason required) is still possible.
- **発注済** (ordered) — line items are reflected in material inventory's expected arrivals (ATP). Each item shows its cumulative received quantity.
- **入荷完了** (receiving complete) — the **Complete receiving** button registers material receipts for the entire remaining quantity and posts them to stock. The requester and creator are notified.
- **キャンセル** (cancelled) — possible only before ordering (draft / approval requested / approved), with a reason.

## How to create

There are two ways.

- **New** — from **New** in the list. Enter the **supplier** (required), the order date, and notes, and add at least one line item (material × receiving factory × quantity/unit × unit price × expected arrival date). Amounts (quantity × unit price) and the total are computed server-side.
- **Convert from a purchase request** — via **Convert to purchase order** on an approved purchase request. Line items are carried over with a unit price of 0 yen, so enter the prices on the edit screen while the order is still a draft.

After saving you are taken to the detail screen. Editing is possible only in draft.

## Evidence

After approval (approved / ordered / receiving complete), you can attach files such as order and delivery-note copies on the detail screen's **Evidence** tab. Attachment is not possible before approval.

## List & search / detail screen

- List columns: PO number / supplier / item count / total amount / status / order date. Filter with the search box (PO number, supplier) and status.
- The detail screen shows a request → approval → order → receiving stepper, the approval trail (delegate approvals marked with the original approver), the transition history, and tabs (items / evidence / overview / history). Orders created from a purchase request also show a link back to the source request.

## FAQ

**Can I receive in installments (partial receiving)?** — "Complete receiving" receives the entire remaining quantity at once. Register partial arrivals directly in [material receipt (PU01)](/docs/apps/material-receipt/user).

**I forgot to set the order date** — If the order date is empty when you press Order, the day the order is executed becomes the order date automatically.

**I want to cancel an ordered PO** — Ordered and receiving-complete POs cannot be cancelled. Cancellation is possible only before ordering.
