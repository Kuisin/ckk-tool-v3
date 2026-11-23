import { describe, expect, it } from "vitest";
import {
  type AuditRowLike,
  buildEventPayload,
  changedFieldNames,
  eventTypesForAudit,
  generateWebhookSecret,
  isBlockedAddress,
  isKnownEventType,
  listWebhookEventTypes,
  MAX_ATTEMPTS,
  nextDelaySec,
  normalizeEventTypes,
  signWebhook,
  subscribes,
  validateWebhookUrl,
  WEBHOOK_RESOURCES,
} from "./webhook-core";

function row(over: Partial<AuditRowLike>): AuditRowLike {
  return {
    id: BigInt(10),
    action: "UPDATE",
    tableName: "order_acceptances",
    recordId: "ORD-202609-00042",
    recordKey: "202609:42",
    beforeData: {},
    afterData: {},
    createdAt: new Date("2026-09-10T04:11:52.881Z"),
    ...over,
  };
}

describe("eventTypesForAudit", () => {
  it("maps CREATE/UPDATE/DELETE on a registered table", () => {
    expect(eventTypesForAudit(row({ action: "CREATE" }))).toEqual([
      "order_acceptance.created",
    ]);
    expect(eventTypesForAudit(row({ action: "DELETE" }))).toEqual([
      "order_acceptance.deleted",
    ]);
  });

  it("adds status_changed only when status actually changed", () => {
    const changed = row({
      beforeData: { status: "DRAFT" },
      afterData: { status: "CONFIRMED" },
    });
    expect(eventTypesForAudit(changed)).toEqual([
      "order_acceptance.updated",
      "order_acceptance.status_changed",
    ]);
    const same = row({
      beforeData: { status: "DRAFT", notes: "a" },
      afterData: { status: "DRAFT", notes: "b" },
    });
    expect(eventTypesForAudit(same)).toEqual(["order_acceptance.updated"]);
  });

  it("never fires status_changed for a resource without a status", () => {
    const r = row({
      tableName: "plants",
      beforeData: { status: "A" },
      afterData: { status: "B" },
    });
    expect(eventTypesForAudit(r)).toEqual(["plant.updated"]);
  });

  it("ignores unregistered tables and non-mutation actions", () => {
    expect(eventTypesForAudit(row({ tableName: "users" }))).toEqual([]);
    expect(eventTypesForAudit(row({ action: "VIEW" }))).toEqual([]);
    expect(eventTypesForAudit(row({ action: "EXPORT" }))).toEqual([]);
  });
});

describe("buildEventPayload", () => {
  it("carries names and status, never values", () => {
    const r = row({
      beforeData: { status: "DRAFT", amount: 100, address: "secret road" },
      afterData: { status: "CONFIRMED", amount: 999, address: "other road" },
    });
    const updated = buildEventPayload(r, "order_acceptance.updated");
    expect(updated?.changedFields).toEqual(["address", "amount", "status"]);
    expect(JSON.stringify(updated)).not.toContain("secret road");
    expect(JSON.stringify(updated)).not.toContain("999");

    const sc = buildEventPayload(r, "order_acceptance.status_changed");
    expect(sc?.status).toEqual({ from: "DRAFT", to: "CONFIRMED" });
    expect(sc?.changedFields).toBeUndefined();
  });

  it("has a stable id per (audit row, type) so retries dedupe", () => {
    const a = buildEventPayload(row({}), "order_acceptance.updated");
    const b = buildEventPayload(row({}), "order_acceptance.updated");
    const c = buildEventPayload(row({}), "order_acceptance.status_changed");
    expect(a?.id).toBe(b?.id);
    expect(a?.id).not.toBe(c?.id);
  });

  it("points at the list endpoint one second before the event", () => {
    const p = buildEventPayload(row({}), "order_acceptance.updated");
    expect(p?.links.list).toBe(
      "/api/v1/order-acceptances?updatedSince=2026-09-10T04%3A11%3A51.881Z",
    );
  });

  it("refuses a type that belongs to another table", () => {
    expect(buildEventPayload(row({}), "invoice.updated")).toBeNull();
  });
});

describe("changedFieldNames", () => {
  it("skips updatedAt noise and handles non-objects", () => {
    expect(
      changedFieldNames({ a: 1, updatedAt: 1 }, { a: 1, updatedAt: 2 }),
    ).toEqual([]);
    expect(changedFieldNames(null, { a: 1 })).toEqual([]);
  });
});

describe("subscription", () => {
  it("validates the event list", () => {
    expect(normalizeEventTypes([])).toMatchObject({ ok: false });
    expect(normalizeEventTypes(["*", "invoice.created"])).toMatchObject({
      ok: false,
    });
    expect(normalizeEventTypes(["nope.created"])).toMatchObject({ ok: false });
    expect(normalizeEventTypes(["*"])).toEqual({ ok: true, types: ["*"] });
    expect(
      normalizeEventTypes(["invoice.updated", "invoice.created", " "]),
    ).toEqual({ ok: true, types: ["invoice.created", "invoice.updated"] });
  });

  it("matches exact types and the wildcard", () => {
    expect(subscribes(["*"], "invoice.created")).toBe(true);
    expect(subscribes(["invoice.created"], "invoice.updated")).toBe(false);
  });

  it("registry is consistent", () => {
    const types = listWebhookEventTypes().map((t) => t.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.every(isKnownEventType)).toBe(true);
    const tables = WEBHOOK_RESOURCES.map((r) => r.table);
    expect(new Set(tables).size).toBe(tables.length);
    const names = WEBHOOK_RESOURCES.map((r) => r.resource);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("signing", () => {
  it("is deterministic and matches Standard Webhooks' construction", () => {
    // secret = base64("12345678901234567890123456789012")
    const secret = "whsec_MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=";
    const sig = signWebhook(secret, "msg_1", 1_700_000_000, '{"a":1}');
    expect(sig).toBe(signWebhook(secret, "msg_1", 1_700_000_000, '{"a":1}'));
    expect(sig.startsWith("v1,")).toBe(true);
    expect(sig).not.toBe(
      signWebhook(secret, "msg_1", 1_700_000_001, '{"a":1}'),
    );
    expect(sig).not.toBe(
      signWebhook(secret, "msg_2", 1_700_000_000, '{"a":1}'),
    );
    expect(sig).not.toBe(
      signWebhook(secret, "msg_1", 1_700_000_000, '{"a":2}'),
    );
  });

  it("generates distinct whsec_ secrets", () => {
    const a = generateWebhookSecret();
    expect(a.startsWith("whsec_")).toBe(true);
    expect(a).not.toBe(generateWebhookSecret());
  });
});

describe("retry schedule", () => {
  it("backs off then gives up", () => {
    expect(nextDelaySec(1)).toBe(30);
    expect(nextDelaySec(2)).toBe(120);
    expect(nextDelaySec(MAX_ATTEMPTS - 1)).toBe(86_400);
    expect(nextDelaySec(MAX_ATTEMPTS)).toBeNull();
  });
});

describe("validateWebhookUrl", () => {
  const ok = (u: string) => validateWebhookUrl(u).ok;

  it("allows https anywhere and internal http", () => {
    expect(ok("https://hooks.example.com/x")).toBe(true);
    expect(ok("http://n8n:5678/webhook/abc")).toBe(true);
    expect(ok("http://192.168.50.15:5678/webhook/abc")).toBe(true);
    expect(ok("http://n8n.ckk-tools.loc/webhook/abc")).toBe(true);
  });

  it("rejects plain http to the public internet", () => {
    expect(ok("http://example.com/x")).toBe(false);
  });

  it("rejects loopback, link-local and metadata", () => {
    expect(ok("https://localhost/x")).toBe(false);
    expect(ok("http://127.0.0.1:3000/x")).toBe(false);
    expect(ok("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(ok("https://metadata.google.internal/x")).toBe(false);
    expect(ok("http://[::1]/x")).toBe(false);
  });

  it("rejects credentials, odd schemes and garbage", () => {
    expect(ok("https://u:p@example.com/x")).toBe(false);
    expect(ok("ftp://example.com/x")).toBe(false);
    expect(ok("not a url")).toBe(false);
  });

  it("blocks resolved addresses too", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("169.254.1.1")).toBe(true);
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("fe80::1")).toBe(true);
    expect(isBlockedAddress("10.1.2.3")).toBe(false);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
  });
});
