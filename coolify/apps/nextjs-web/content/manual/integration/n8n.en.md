---
title: "Working with n8n"
description: "Receive signals with n8n's Webhook node, verify the signature, and pull values through the API — plus a scheduled catch-up."
---
Step-by-step for building the architecture from the [integration overview](/manual/en/integration/index) in n8n.

## What you need

| Item | Where |
| --- | --- |
| An API client (with roles, enabled, token issued) | [API Clients](/manual/en/operations/system/external-api/user) (`SY0I`) and User Management (`SY01`) |
| An n8n **Header Auth credential** (`Authorization: Bearer <token>`) | n8n Credentials |
| The signing secret (`whsec_…`) | Shown once when you register the webhook |

Give the client roles **for exactly the resources you want to read** (e.g. `order_acceptance:READ` for order-acceptance signals). Events for resources without a role are not sent.

## Recipe 1 — receive a signal, then pull the values

```
[Webhook] → [Code: verify signature] → [IF: event wanted?] → [HTTP Request: fetch via API] → [your steps]
```

1. **Webhook node**: method `POST`, a hard-to-guess path. In Options set **Raw Body** ON and **Respond** to "Immediately" (return 200 at once). Register this **Production URL** under "Outbound webhooks" in CKK (on the same Docker network as n8n you can use `http://n8n:5678/webhook/…`).
2. **Code node** (verify the signature):

```js
// n8n Code node ("Run Once for All Items").
// Requires: Webhook node → Options → "Raw Body" ON, and env NODE_FUNCTION_ALLOW_BUILTIN=crypto
const crypto = require("crypto");

const item = $input.first();
const raw = (await this.helpers.getBinaryDataBuffer(0, "data")).toString("utf8");
const h = item.json.headers;
const secret = $env.CKK_WEBHOOK_SECRET; // put whsec_… in an n8n environment variable

const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
const expected = crypto
  .createHmac("sha256", key)
  .update(`${h["webhook-id"]}.${h["webhook-timestamp"]}.${raw}`)
  .digest("base64");

const ok = (h["webhook-signature"] ?? "")
  .split(" ")
  .some((s) => s === `v1,${expected}`);
const fresh = Math.abs(Date.now() / 1000 - Number(h["webhook-timestamp"])) < 300;

if (!ok || !fresh) throw new Error("invalid webhook signature");
return [{ json: JSON.parse(raw) }];
```

   > How to get the raw body differs between n8n versions. If it does not work, check that the Webhook node's output contains binary data. **If you skip verification, make the URL unguessable and keep n8n on the internal network** (not recommended).
3. **IF node**: is `{{ $json.type }}` an event you want (e.g. `order_acceptance.status_changed` with `status.to == CONFIRMED`)?
4. **HTTP Request node**: Header Auth credential, URL `https://app-dev.ckk-tool.co.jp{{ $json.links.list }}`. From the response's `data`, pick the row whose `number` equals `{{ $json.resource.id }}`. This is the first point where you receive values.

For deduplication, remember `{{ $json.id }}` in an n8n Data Store (or a DB) and stop if you have seen it.

## Recipe 2 — catch up on misses (scheduled)

Fill in what was missed while webhooks failed or n8n was down, using API incremental sync.

```js
// n8n の Code ノード（「全アイテムに対して 1 回実行」）。
// 要件: Webhook ノードの Options → 「Raw Body」を ON、環境変数 NODE_FUNCTION_ALLOW_BUILTIN=crypto
const crypto = require("crypto");

const item = $input.first();
const raw = (await this.helpers.getBinaryDataBuffer(0, "data")).toString("utf8");
const h = item.json.headers;
const secret = $env.CKK_WEBHOOK_SECRET; // n8n 側の環境変数に whsec_… を入れておく

const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
const expected = crypto
  .createHmac("sha256", key)
  .update(`${h["webhook-id"]}.${h["webhook-timestamp"]}.${raw}`)
  .digest("base64");

const ok = (h["webhook-signature"] ?? "")
  .split(" ")
  .some((s) => s === `v1,${expected}`);
const fresh = Math.abs(Date.now() / 1000 - Number(h["webhook-timestamp"])) < 300;

if (!ok || !fresh) throw new Error("invalid webhook signature");
return [{ json: JSON.parse(raw) }];
```

- Keep `syncedAt` in the workflow's **Static Data** (`$getWorkflowStaticData('global')`).
- Make processing **idempotent** — you will see the same rows as in recipe 1.
- Run `GET /api/v1/deletions?sinceEventId=` separately for deletions.

## About writing

There is no door yet for n8n to **create or change** business data. If you only need to hand over order-form PDFs, use the external intake door of [Order intake](/manual/en/operations/system/order-intake/user) (`SY0C`).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| "Send test" fails | The reason in the on-screen notification. `resolved to a blocked address` means the name resolves to a refused destination (e.g. loopback) |
| Nothing arrives | Is there a row in "Deliveries"? If not, check the **subscribed events** and the API client's roles (permission codes in `GET /api/v1/me`) |
| Signature mismatch | Are you using the raw body (parsed JSON will not match)? Did you rotate the secret? Is your clock off by more than 5 minutes? |
| The endpoint became disabled | Five consecutive exhausted deliveries disable it automatically. Fix it and enable it again (needs approval) |
| Arrives a little late | By design (a few to a dozen seconds); fine unless you need real-time |
