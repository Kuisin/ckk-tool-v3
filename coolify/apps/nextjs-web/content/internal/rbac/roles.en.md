---
title: "Roles and permissions"
description: "Every role in the system, the permission codes behind them, who can do what, and how to assign roles to users."
---
Access in this system is managed through **roles** (bundles of job duties).
Permissions are never granted to a user directly — you assign roles. A user can
hold several roles, in which case their access is the **union** of all of them.

> This page reflects the **live data in the dev database**. For the latest full
> listing see `_docs/rbac-role-matrix.xlsx`. To check one person's effective
> permissions, open their detail page in **SY01 User management**.

## Three terms

A permission answers "**who** (role) may do **what** (action) to **which area**
(permission code)", optionally limited by "**how far**" (scope).

- **Permission code** — one business area. Not necessarily one app (`master`
  covers all 12 master-data apps; `order_acceptance` covers both SA04 and SA05).
- **Action** — R=read / C=create / U=update / D=delete / E=export /
  ◎=ADMIN (every action on that code). Approval is not an action — who can
  approve is decided solely by approval-group membership in **MS0B approval
  settings**.
- **Scope** — how far the action reaches. Blank means **ALL** (every row).
  - **OWN** — only rows the user created
  - **PLANT** — only rows of the user's assigned plants (set in SY01)
  - **REGION** — only rows in the region of the user's plants

When several roles grant the same code, the **widest scope wins** (PLANT + ALL
= ALL).

## Roles

| Role | rolename | Purpose |
|---|---|---|
| Administrator | `admin` | Everything. The only role that can touch system admin (SY01+) and kiosk admin (SY08+) |
| Manager | `manager` | Read and export across every area — for cross-department approvers (whether they can approve is decided by MS0B group membership) |
| Sales manager | `sales_manager` | Full control of sales data + read everywhere |
| Sales | `sales` | Create and edit sales data, **own records only** (OWN) |
| Sales assistant | `sales_assistant` | Read-only across sales data. No create, edit or approve |
| Purchasing manager | `purchasing_manager` | Full control of purchasing data + read everywhere |
| Purchasing | `purchasing` | Day-to-day purchase requests, orders, receipts, outsourcing |
| Production manager | `production_manager` | Full control of production data + read everywhere |
| Production | `production` | Work orders, step execution, inventory (**own plants only**) |
| Quality manager | `quality_manager` | Full control of work orders + read everywhere |
| Quality | `quality` | Inspection records and inspection approval (**own plants only**) |
| Shipping manager | `shipping_manager` | Full control of shipping data + read everywhere |
| Shipping | `shipping` | Shipping orders and delivery notes (shipping + inventory are **own plants only**) |
| Accounting manager | `accounting_manager` | Full control of billing + read everywhere |
| Accounting | `accounting` | Invoices, monthly closing, Yayoi CSV |
| Viewer | `viewer` | Read-only across every area (executives, audit) |
| Staff | `staff` | Transitional catch-all — everything except system and kiosk. **Replace with department roles in production** |

## Permission codes and their apps

| Code | Name | Apps |
|---|---|---|
| `price_list` | Price list | SA01 Trial pricing / SA02 Price lists |
| `quote` | Quote | SA03 Quotes |
| `order_acceptance` | Order acceptance | SA04 Order acceptances / SA05 Order lines |
| `design_request` | Design request | SA06 Design requests |
| `purchase_order` | Purchasing | PU01 Purchase requests / PU02 Material purchase orders |
| `material_receipt` | Material receipt | PU03 Material receipts |
| `outsource_order` | Outsource order | PU04 Outsource orders |
| `work_order` | Work order | PD02 Work orders / PD05 Pending work orders (also kiosk step execution and work-order scan) |
| `approve` | Approvals | PD03 Approvals |
| `inventory` | Inventory | PD04 Inventory |
| `delivery_order` | Shipping order | SH01 Shipping orders / SH03 Pending shipments |
| `delivery_note` | Delivery note | SH02 Delivery notes |
| `invoice` | Invoice | BL01 Invoices |
| `billing_closing` | Billing closing | BL02 Monthly closing (Yayoi CSV export is E) |
| `master` | Master data | All 12 master apps, MS01–MS0E |
| `admin_manual` | Admin manual | DC02 Admin manual (this page) |
| `kiosk` | Kiosk admin | SY08 QR cards / SY09 Devices / SY0A Kiosk settings |
| `system` | System admin | All system apps, SY01–SY0C |

## Matrix — sales and purchasing

| Role | Price list | Quote | Order acc. | Design req. | Purchasing | Receipt | Outsource |
|---|---|---|---|---|---|---|---|
| **Administrator**<br/>`admin` | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ |
| **Manager**<br/>`manager` | RE | RE | RE | RE | RE | RE | RE |
| **Sales manager**<br/>`sales_manager` | RCUDE | RCUDE | RCUDE | RCUDE | — | — | — |
| **Sales**<br/>`sales` | RCU<br/>OWN | RCU<br/>OWN | RCU<br/>OWN | RCU<br/>OWN | — | — | — |
| **Sales assistant**<br/>`sales_assistant` | R | R | R | R | — | — | — |
| **Purchasing manager**<br/>`purchasing_manager` | R | R | R | R | RCUDE | RCUDE | RCUDE |
| **Purchasing**<br/>`purchasing` | — | — | — | — | RCUDE | RCUDE | RCUD |
| **Production manager**<br/>`production_manager` | R | R | R | R | R | R | RCUDE |
| **Production**<br/>`production` | — | — | RU | — | R | R | RU |
| **Quality manager**<br/>`quality_manager` | R | R | R | R | R | R | R |
| **Quality**<br/>`quality` | — | — | R | — | — | — | — |
| **Shipping manager**<br/>`shipping_manager` | R | R | R | R | R | R | R |
| **Shipping**<br/>`shipping` | — | — | R | — | — | — | — |
| **Accounting manager**<br/>`accounting_manager` | R | R | R | R | R | R | R |
| **Accounting**<br/>`accounting` | R | R | R | — | — | — | — |
| **Viewer**<br/>`viewer` | R | R | R | R | R | R | R |
| **Staff**<br/>`staff` | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE |

## Matrix — production, shipping, billing, admin

| Role | Work order | Approvals | Inventory | Shipping | Delivery | Invoice | Closing | Master | Admin manual | Kiosk | System |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Administrator**<br/>`admin` | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ | ◎ |
| **Manager**<br/>`manager` | RE | RE | RE | RE | RE | RE | RE | RE | RE | — | — |
| **Sales manager**<br/>`sales_manager` | — | R | — | — | — | — | — | R | — | — | — |
| **Sales**<br/>`sales` | — | — | — | — | — | — | — | R | — | — | — |
| **Sales assistant**<br/>`sales_assistant` | — | — | — | — | — | — | — | R | — | — | — |
| **Purchasing manager**<br/>`purchasing_manager` | R | R | R | R | R | R | R | R | R | — | — |
| **Purchasing**<br/>`purchasing` | R | R | R | — | — | — | — | R | — | — | — |
| **Production manager**<br/>`production_manager` | RCUDE | R | RCUDE | R | R | R | R | R | R | — | — |
| **Production**<br/>`production` | RCUDE<br/>PLANT | R | RCUE<br/>PLANT | R | — | — | — | R | — | — | — |
| **Quality manager**<br/>`quality_manager` | RCUDE | R | R | R | R | R | R | R | R | — | — |
| **Quality**<br/>`quality` | RU<br/>PLANT | R | R | — | — | — | — | R | — | — | — |
| **Shipping manager**<br/>`shipping_manager` | R | R | RCUDE | RCUDE | RCUDE | R | R | R | R | — | — |
| **Shipping**<br/>`shipping` | R | — | RU<br/>PLANT | RCUDE<br/>PLANT | RCUDE | — | — | R | — | — | — |
| **Accounting manager**<br/>`accounting_manager` | R | R | R | R | R | RCUDE | RCUDE | R | R | — | — |
| **Accounting**<br/>`accounting` | — | — | — | R | R | RCUDE | RCUE | R | — | — | — |
| **Viewer**<br/>`viewer` | R | R | R | R | R | R | R | R | R | — | — |
| **Staff**<br/>`staff` | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | RCUDE | — | — | — |

## How to read this

### Approval is managed by approval groups, not a permission action

Who can approve is managed **only in approval settings (MS0B)**. The RBAC
requirement for pressing approve / reject is simply being able to **read (R) or
update (U)** the document — there is no approve-action grant any more (the old
A=approve grants were removed entirely). A user who can open the document and
is a member (or in-period stand-in) of the step's approval group can approve.
This is why assigning a manager role alone does not let someone approve.

### "Allowed to" is not "sees it"

This page describes **what a role may do**, not what appears on the home screen.
Launcher visibility in production is decided separately (SY05 App management /
feature flags), so an app can be hidden in production even for someone with the
permission. In dev everything is shown by default.

### System and kiosk admin are administrator-only

`system` and `kiosk` are deliberately not granted to any business role. User
management, app management, activity log, QR cards and device management are
reachable by the **administrator role only**.
File management (SY06) is the exception — it **opens for anyone, no permission
required**: what is visible is decided by folder grants (individual) and by the
business apps the user can read (the PDFs those apps generated), so without
either it simply shows up empty.

## Assigning roles

1. Have the person sign in once via SSO (the first login creates their `app.users` row).
2. Assign roles in **SY01 User management**. Assign their plants there too — that
   is what PLANT / REGION scopes resolve against.
3. Approvers must also be added to the relevant **approval group** (MS0B).

## Changing the permissions themselves

The role contents (which code gets which action) live in SQL seeds, which are the
source of truth:

- `shared-db/sql/rbac-seed.sql` — the 18 permission codes + `admin` / `staff`
- `shared-db/sql/roles-seed.sql` — the permission matrix for the 15 operational roles

After editing, apply them (both are idempotent) and rebuild the Excel version:

```bash
cd shared-db
./scripts/remote-db.sh sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/roles-seed.sql'
./scripts/remote-db.sh python3 ../tools/rbac-matrix/build_rbac_xlsx.py
```
