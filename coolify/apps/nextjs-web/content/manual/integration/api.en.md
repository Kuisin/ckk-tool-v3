---
title: "API — reading and incremental sync"
description: "Authentication, reading lists (keyset), incremental sync (updatedSince), fetching deletions, and error shapes."
---
The API for external systems to **read** business data. Endpoints, parameters and response shapes are in the **[reference](/manual/en/integration/reference/resources)** (generated from the code). This page covers the **usage conventions** the reference alone does not.

## Basics

- Base URL: `https://<host>/api/v1` (verification environment: `https://app-dev.ckk-tool.co.jp/api/v1`).
- Authentication: `Authorization: Bearer <token>`. Tokens are issued in [API Clients](/manual/en/operations/system/external-api/user) (`SY0I`).
- Connectivity check: `GET /api/v1/me` returns the caller's name and **effective permission codes**, so you can diagnose a 403 yourself.
- The machine-readable spec is also at `GET /api/v1/openapi.json` (authenticated, OpenAPI 3.1).

```bash
curl -H "Authorization: Bearer $CKK_TOKEN" \
  "https://app-dev.ckk-tool.co.jp/api/v1/order-acceptances?limit=50"
```

## Reading lists (keyset)

Lists **never use `OFFSET`**: when rows are added mid-read, `OFFSET` silently skips rows.

```json
{ "data": [ … ], "page": { "nextCursor": "…", "hasMore": true }, "syncedAt": "2026-09-10T04:11:52.881Z" }
```

- While `page.hasMore` is `true`, pass `page.nextCursor` as `?cursor=` and keep reading.
- **Do not interpret cursors** (their shape can change without notice). A malformed cursor returns `400` rather than silently restarting.
- Page size is `?limit=` (capped).

## Incremental sync (`updatedSince`)

Read everything once and **store the response's `syncedAt`**. From then on, pass `?updatedSince=<stored syncedAt>` to read only changed rows.

- `syncedAt` is **this system's database clock**. **Never build it from your own clock** — clock skew permanently loses rows.
- The bound is **inclusive**, so a row can arrive twice. Make your processing **idempotent**.
- Stock transactions (`/inventory/transactions`) are an append-only ledger, so they filter by creation time.

## Deletions are a separate door

Physical deletions are **invisible** to `updatedSince`. Also read `GET /api/v1/deletions?sinceEventId=<last lastEventId>`. Most documents are represented by status instead of being deleted, so this mostly lists draft delivery orders. Rows deleted directly with psql cannot be observed — re-sync everything after any restore work.

## Value shapes

- Identifiers are document numbers (`ORD-202609-00042`), the same as on screens and printouts.
- Statuses are the raw DB values (`CONFIRMED`); no Japanese labels.
- Multilingual columns are `{ "ja": "…", "en": "…" }`. Amounts are numbers with a separate currency field. Timestamps are RFC 3339 UTC.
- **New values can appear** (for example the `REGRIND` order type). Always give a `switch` a default branch.

## Errors

Errors are RFC 9457 (`application/problem+json`). Branch on `code` (wording may change).

- Authentication failures return **the same 401 whatever the cause**, so callers cannot probe whether a token exists. The reason is only in the administrators' logs.
- 403 means "the token is valid but lacks permission"; the body names the required permission (e.g. `quote:READ`).
- 429 is a throttle on a source address with repeated authentication failures.

## Row scope

The API narrows rows with **the same rules as the screens**. For example, with a creator-scoped permission, quotes created by others are not returned. If rows you expect are missing, check the roles assigned to the API client.
