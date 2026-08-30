---
title: "Permissions and roles"
description: "How permissions are read, and the full list of what each one unlocks."
---
Every app requires a particular permission. Each app's manual page ends with a *Permissions required* section — check there first. This page is the overview.

## A permission is three things together

Like "view quotes, but only my own", three parts combine into one permission.

| | Meaning | Example |
| --- | --- | --- |
| Permission | What it is about | Quote |
| Action | What you may do | View / Create / Edit |
| Scope | How far it reaches | Company-wide / Plant / Own records |

### Actions

| Action | Meaning |
| --- | --- |
| View | See lists and details |
| Create | Create new records |
| Edit | Change existing ones |
| Delete | Remove them |
| Export | Export to CSV and similar |

### Scope

The same *View* shows different amounts depending on scope. Limited to a plant, you only see data for the plants you belong to.

| Scope | Meaning |
| --- | --- |
| Company-wide | The whole company — no plant filter |
| Region | Every plant in the regions your plants belong to |
| Plant | Only the plants you belong to |
| Own records | Only records you created or are responsible for |

## Permissions do not decide who may approve

Who may approve a document is decided by **membership of an approval group in 承認設定 (MS0B)**. All the permission side requires is that you can view or edit that document.

To add approvers, change the approval group members — not the permissions.

## Privileged operations — permission alone is not enough

Revealing a device PIN, issuing a QR card, opening the details of a login record: holding the permission **does not let you do these**. You request them in Privileged Access (`SY0G`) with a reason, and may act only for the window someone else approves.

The clock starts when you **first perform the operation**, not when it is approved. See [Privileged Access](operations/system/privileged-access/user).

## All permissions

### Business

| Permission | Code | What it covers |
| --- | --- | --- |
| Price list | `price_list` | Work with trial estimates and price lists — the per-customer unit prices. |
| Quote | `quote` | Work with quotes. |
| Order acceptance | `order_acceptance` | Work with order acceptances and their lines. |
| Design request | `design_request` | Work with design requests. |
| Purchasing | `purchase_order` | Work with purchase requests and material purchase orders. |
| Material receipt | `material_receipt` | Record incoming material. |
| Outsource order | `outsource_order` | Work with outsourcing orders. |
| Work order | `work_order` | Work with work orders and step execution — including the shop-floor kiosk. |
| Inventory | `inventory` | View product, material and WIP stock, and move or adjust it. |
| Delivery order | `delivery_order` | Work with delivery orders. |
| Delivery note | `delivery_note` | Work with delivery notes. |
| Invoice | `invoice` | Work with invoices. |
| Billing closing | `billing_closing` | Run billing closings and export for accounting. |
| Approvals | `approve` | See the pending-approval list. **Being able to approve is separate** — that is decided by approval-group membership in 承認設定 (MS0B). |
| Forms | `form` | Create and edit forms and read every response. Who may respond is set per form. |
| Internal pages | `internal_page` | Use the internal-documents app. Visibility of each document is set per document. |

### Master data & settings

| Permission | Code | What it covers |
| --- | --- | --- |
| Master data | `master` | Work with master data: partners, products, materials, process steps, inspection templates, approval settings, plants and more. |
| Admin manual | `admin_manual` | Read the administrator-facing runbooks such as device setup (separate from the public manual). |

### Administration

| Permission | Code | What it covers |
| --- | --- | --- |
| System admin | `system` | Change system-side settings: app management, pricing engine, links, order intake, AI provider, notification email. |
| Kiosk admin | `kiosk` | View shared devices and edit their name and location. **Revealing secrets and enrolling or revoking devices are separate** (see privileged operations). |

### Privileged (request & approval required)

| Permission | Code | What it covers |
| --- | --- | --- |
| Kiosk device secrets | `kiosk_secret` | Reveal the maintenance-exit PIN, PIN history and device settings code; regenerate codes and reset the device key. |
| Kiosk device enrolment | `kiosk_device` | Create, link, activate, disable and revoke device profiles. Adding a device grants access. |
| Kiosk card issuance | `kiosk_card` | See the card list. Issuing, assigning, revoking, resetting PINs and printing sheets need approval. |
| Personal data access | `personal_data` | Open login and activity history. Details (IP, device signature) and cross-document search need approval. Per-document history tabs are not restricted by this. |
| User administration | `user_admin` | Open user management. Suspending, restoring and changing plants go through a per-change approval. |
