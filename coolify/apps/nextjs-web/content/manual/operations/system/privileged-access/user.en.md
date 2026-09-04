---
title: "Privileged Access — User Guide"
description: "Request, get approval for, and time-box heavy operations such as revealing device PINs or issuing QR cards."
---
Some operations are heavy: revealing a device PIN, issuing a QR card, opening the details of a login record. This app (`SY0G`) is where you **request** them, someone else **approves** them, and you then have a **limited window** in which to act.

Holding the permission no longer means you can perform the operation. It means you may ask.

## Why it works this way

A PIN or a card is itself a key. The more people who can see the keys, the harder it is to know who looked, and why. Making everyone an administrator is worse — that grants every other operation too.

So these operations are off by default. You turn one on for a short time, with a reason, and someone else agrees. **An approver can authorise an operation but cannot perform it.**

## Requesting

1. Open **Privileged Access** (`SY0G`) and press **Request**.
2. Choose the **target**. Only what you may request is listed.
3. Choose the **operations**, one by one. Leave out what you will not use — the approver reads each one.
4. Write a **reason**. Make it clear why this is needed now.
5. Set the **window** (start and end). It may not extend more than **14 days** from the request.
6. Set the **duration per use** in minutes (60 by default).

### When does the clock start?

This is the part people get wrong, so plainly:

- **Approval does not start the clock.** It only arms the grant.
- The clock starts **the first time you actually perform the operation**.
- It ends at whichever comes **first**: your duration running out, or the window's end.

If you were granted 30 minutes but first use it 5 minutes before the window closes, **you get 5 minutes** — not 30.

Reserving a long window costs nothing while unused, but the window's end never moves.

## Approving

Approvers see an **Approve** tab. Your own requests never appear there — the requester and the approver must be different people.

No notification is sent when a request arrives. Requests waiting for your decision also appear on the "Privileged access" tab of [Pending list](/manual/en/operations/general/my-tasks/user) (`CM01`), so you notice them without opening this screen (the decision is still made here).

1. Read what is being asked: who, what, why, for how long.
2. Press **Approve** to open the operation list.
3. Everything is ticked by default. **Untick anything you do not want to grant.** Unticked operations stay unusable.
4. To grant nothing, use **Reject** instead of approving.

Rejections require a reason, which the requester sees.

### Stopping a live grant

From the **History** tab, **Revoke** ends an active grant immediately. You do not have to wait for it to expire.

## Suspending users and changing their plants

These work differently. Instead of reserving time, you submit **the change itself**.

1. Open the person in **User Management** (`SY01`).
2. Fill in the suspension, restoration, or plant change as usual.
3. Add a reason and press **Request approval**. Nothing changes yet.
4. On approval, **the change is applied**.

If circumstances moved in the meantime (already suspended, a plant was deleted), it is not applied and you are told why — rather than forcing a stale change through.

## Questions

**I pressed a button and was told approval is required.**
You have no approved grant for that operation. Request one. Anything already pending shows in the banner at the top of the screen.

**It was approved but still does not work.**
One of: the window has not started; the window ended; your duration ran out after first use; or the approver unticked that operation. Check **My requests** — removed operations are listed there.

**I cannot submit two requests for the same permission.**
Only one open request per permission. Withdraw it or wait for a decision.

**Administrators do not need to request.**
Correct. They act directly, and the activity log records that it was done with administrator rights.

<!-- permissions:start -->
## Permissions required

This screen needs no special permission — being signed in is enough.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
