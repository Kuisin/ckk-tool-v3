---
title: "Approvals & schedule — User guide"
description: "A single screen for your own work: schedule, pending approvals, unanswered forms, completed requests, and document comments."
---
A single screen for the things you personally need to do. The operation code is `CM01`. It used to be a separate app called "Approval management" (`PD03`), which has been merged with the work schedule here.

## What this app does

Tabs bring together:

- **Work schedule** — your assigned work steps that are not yet finished.
- **Pending approval** — documents waiting for your approval (shown only if you have approval permission).
- **Unanswered forms** — forms shared with you that you have not submitted yet.
- **Submitted forms** — your own form responses.
- **Completed requests** — completion notices addressed to you.
- **Document comments** — unresolved comments on documents you created or edited.

Click a row to open the underlying work step, document, or form directly.

## Choosing which tabs to show

If some tabs don't apply to you, hide them from **"Visible tabs"** at the top right. This is a personal setting — it does not affect anyone else's screen.

## Work schedule

Lists your assigned process steps (work_order_step_plans) that are not yet finished, ordered by planned date. Clicking a row opens a link to that step's execution screen on the shared-device app.

## Pending approval

Lists only the documents currently waiting on your approval, across document types — think of it as your approval inbox. **This tab does not appear at all if you don't have approval permission.**

The following document types can appear:

- **Work order** — the step decided by approval settings ([Work order](/manual/en/operations/production/work-order/user), PD02)
- **Order acceptance** — approval before confirmation ([Order acceptance](/manual/en/operations/sales/order-acceptance/user), SA04)
- **Order acceptance cancellation** — a request to cancel an already-confirmed order acceptance. Clicking the row opens that order acceptance.
- **Material purchase order** — approval before ordering ([Material purchase order](/manual/en/operations/purchasing/purchase-order/user), PU02)
- **Purchase request** — [Purchase request](/manual/en/operations/purchasing/purchase-request/user), PU01
- **Process flow change** — a change to branches in an approved/in-progress work order's process flow. Clicking the row opens that work order.

### Terms used on this tab

- **Approval group** — the roster of people allowed to approve. Only members can approve or send back. Which group approves at which step is decided in Approval settings (`MS0B`).
- **Delegate** — someone assigned, for a set period, to approve in place of the regular approver while they are away.
- **Step** — the position in the approval sequence. How many steps a document goes through is decided per document type in Approval settings (`MS0B`), and can vary by the document's content.
- **Send back** — returning a document to its creator when there is a problem. The document reverts to Draft.

### Reading the screen

- **Type** — a colored badge for one of: Work order, Order acceptance, Order acceptance cancellation, Material purchase order, Purchase request, Process flow change.
- **Target number** — the document's number.
- **Step** — shown as e.g. "**2/3 Department approval**" (current step / total steps, plus the step name; just the step name if there is only one step). The final step is highlighted so you can see it's one step from completion. Steps set to "All" also show "All ◯/◯".
- **Requested by** — who requested the approval.
- **Requested at** — when it was requested. **Oldest first**, so requests that have been waiting longest appear at the top.
- **Notes** — any memo written when the request was made.
- Search by **target number, requester, or notes**; filter by **type**.
- A **"No view permission"** badge means you're in the approval group but lack permission to open that document. Since approving happens on the document's own screen, ask an administrator to grant access.

### Approving

1. Click a row in the list to open the document.
2. Near the top of the screen, **"Progress"** shows the current step.
3. If it's your turn to approve, an **"Approve"** button appears.
4. Review the content and click it.

How many approval steps a document goes through is fixed per document type. The card shows something like "Step 2/3 'Department approval' — Manufacturing manager." Once the final step is done, the document is ready to move on (e.g. a work order can start production).

When a step is set to **"All"**, it does not proceed until everyone assigned to that step has approved. The card shows "◯ remaining" along with who hasn't approved yet.

> 💡 Only members of that step's approval group, and any delegate currently in period, can approve. If the button doesn't appear, you'll see "Only members of ◯◯ can approve or send back."

### Sending back

Return a document to its creator when something is wrong.

1. Click **"Send back"**.
2. A small "Confirm send back" dialog appears.
3. Enter a **reason** (required).
4. Click **"Send back"** to confirm.

The document reverts to **Draft**, and the reason is shown in red on the creator's screen. After fixing it, they request approval again.

#### Reason for sending back [#field-reject-reason]

The reason you're sending the document back. **The requester sees it exactly as written**, so phrase it so they know what to fix — e.g. "Quantity doesn't match the order" or "Material spec is missing." The reason is kept in the history so you can trace why a document was stopped later.

### Approval history

Each approval or send-back is recorded below "Progress" as an **approval record** — who acted, when, at which step, approve or send back, and any comment. Actions taken by a delegate show "(Delegate for: original approver)".

## Unanswered forms / Submitted forms

Lists [forms](/manual/en/operations/general/forms/user) (`CM02`) shared with you that you can still answer (soonest deadline first), and the responses you've submitted. Even for forms that hide the respondent from others, your own response is always visible to you (never to others). If still within the edit window, open it from the Submitted tab to change it.

## Completed requests

Lists completion notices addressed to you — not every completed request, only the ones whose form sharing settings include a completion notice to you. Unread rows are highlighted.

## Document comments

Collects unresolved line comments on documents you created or edited. Comments you left on your own work don't appear here. Think of it as a "review requests" inbox so feedback doesn't get missed.

## FAQ / Troubleshooting

**Q. I don't see a "Pending approval" tab.**
A. You don't have approval permission. To approve, you need to be in the approval group for the relevant step — ask an administrator.

**Q. A tab shows nothing.**
A. There is nothing pending right now in that category. Items disappear automatically once handled.

**Q. The Approve button doesn't show up.**
A. You're not in that step's approval group. Ask an administrator to add you in Approval settings.

**Q. A row shows a "No view permission" badge.**
A. You're in the approval group but lack permission to open that document. Approving happens on the document's detail screen, so ask an administrator to grant access.

**Q. Clicking Send back says "Enter a reason for sending back."**
A. The reason field is empty — it's required. Fill it in and click Send back again.

**Q. A pending approval I saw earlier is gone now.**
A. Someone else who could approve it likely already handled it. Completed requests disappear from this list automatically; you can still open the document itself from its own app.

**Q. Approvals stall while I'm away.**
A. You can set a delegate for a fixed period. This is configured in [Approval settings](/manual/en/operations/masters/approval-setting/user) — ask an administrator.

**Q. I want to remove tabs I don't use.**
A. Hide them from "Visible tabs" at the top right. You can bring them back later.

<!-- permissions:start -->
## Permissions required

This screen needs no special permission — being signed in is enough.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
