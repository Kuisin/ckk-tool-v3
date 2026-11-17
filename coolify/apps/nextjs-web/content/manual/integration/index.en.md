---
title: "Integration overview — API and webhooks"
description: "How to connect this system to external systems such as n8n: reading (API) vs. being notified (webhooks), and why the core system stays clean."
---
This is the entry point for connecting n8n or other external systems. **The wiring lives in n8n; this system only opens two doors.**

```
        ┌─────────────┐   1. change signal (webhook)   ┌───────────┐
        │  CKK system │ ───────────────────────────▶ │           │
        │             │                             │    n8n    │ ──▶ Slack / accounting / other systems
        │  /api/v1    │ ◀─────────────────────────── │           │
        └─────────────┘   2. fetch values (API, Bearer)  └───────────┘
```

## Which door to use

| You want to… | Use | Details |
| --- | --- | --- |
| Know **immediately** that something changed | **Webhook** (this system → n8n) | [Webhooks](/manual/en/integration/webhooks) |
| Read the **values** of business data | **API** (n8n → this system) | [API](/manual/en/integration/api) |
| Catch up after missing a webhook | **API incremental sync** (`updatedSince`) | [API](/manual/en/integration/api) |
| Build it in n8n | n8n recipes | [Working with n8n](/manual/en/integration/n8n) |

## Design principles

- **A webhook is a signal, not the data.** It says "order acceptance `ORD-202609-00042` went from `DRAFT` to `CONFIRMED`" — and never carries **values** such as amounts or addresses. The receiver pulls values through the API. Authorization, row scope and output shape therefore live in **one place (the API)**, and webhooks never become a second leak path.
- **Webhooks are allowed to be lossy.** Whether a delivery is missed, reordered or duplicated, API incremental sync always lets you catch up. Webhooks are the fast path; the API is the source of truth.
- **Permissions come from the API client.** Each endpoint is bound to an API client and receives **only events for resources that client can read**. Remove the permission and delivery stops, even without deleting the endpoint.
- **Only to places n8n can be reached.** Endpoint URLs must be https, or http to internal hosts (Docker service names, private IPs, `.loc`).

## What works today

- ✅ The read API (`/api/v1`) and outbound webhooks.
- ❌ There is no door yet for n8n to **write** business data (we will open one after the business rules are factored so the API can share them). Order-form PDFs can be pushed from n8n through a separate door ([Order intake](/manual/en/operations/system/order-intake/user)).
- ⚠️ This feature is currently available **only in the verification environment (dev)**.

## Getting started

1. In [API Clients](/manual/en/operations/system/external-api/user) (`SY0I`), create a client for n8n, give it roles, and issue a token.
2. In the "Outbound webhooks" section of the same screen, register n8n's webhook URL.
3. Build the receiving side by following [Working with n8n](/manual/en/integration/n8n).
