---
title: "Permissions and roles"
description: "How signing in (authentication) and what you may do (authorisation) fit together, how to read a permission, and the full list."
---
Being able to sign in and being able to act are decided separately. This page explains how. Each app's manual page ends with a *Permissions required* section, which is quicker if you only care about the screen in front of you.

## Authentication and authorisation — two stages

The system works in two stages.

1. **Authentication** — establishing who you are. This is signing in; afterwards the system knows which person is using it.
2. **Authorisation** — deciding what that person may do. This is where permissions come in.

Signing in successfully and still not being able to open a screen is the normal consequence of these being separate: authentication passed, authorisation did not.

| Where you use it | How you are identified | Steps |
| --- | --- | --- |
| Desktop (web) | Company account sign-in, or username and password | [Getting started](start) |
| Shop-floor tablet | QR card and PIN | [Starting on the kiosk](operations/kiosk/start/user) |

## Authorisation — a permission is three things together

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

Who may approve a document is decided by **承認設定 (MS0B)**, not by permissions. How it works and how to set it up is covered in [Approval settings](operations/masters/approval-setting/user).

## Privileged operations — permission alone is not enough

Revealing a device PIN, issuing a QR card, opening the details of a login record: holding the permission **does not let you do these**. You request them in Privileged Access (`SY0G`) with a reason, and may act only for the window someone else approves.

The clock starts when you **first perform the operation**, not when it is approved. See [Privileged Access](operations/system/privileged-access/user).

## Kinds of permission

Permissions fall into four kinds. To see which you hold, open [My permissions](/profile/permissions).

**Business** — Permissions for everyday work, split by the document you handle — quotes, order acceptances, work orders, delivery orders. Most people hold only these.

**Master data & settings** — Permissions for the shared reference data everyone works from. Changing a partner or product affects every document created afterwards, so these are usually held by a few people.

**Administration** — Permissions that change the system itself — how screens behave, external integrations — rather than business data.

**Privileged (request & approval required)** — Permissions that holding is not enough for. Device PINs, card issuance and personal-data access sit here — operations with wide reach and little way back. Each use is requested and allowed only for a window someone else approves.

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
| Approvals | `approve` | See the pending-approval list. Whether you may actually approve is decided by 承認設定 (MS0B), not by this permission. |
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
