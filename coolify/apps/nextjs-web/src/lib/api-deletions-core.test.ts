import { describe, expect, it } from "vitest";
import { deletedRowId } from "./api-deletions-core";

const UUID = "3f2b8a1c-1d2e-4f50-9a6b-7c8d9e0f1a2b";

describe("deletedRowId", () => {
  it("書類は before_data.id（uuid）を返す", () => {
    expect(
      deletedRowId("delivery_orders", "CKK/DOR-2026-00003", {
        id: UUID,
        status: "DRAFT",
      }),
    ).toBe(UUID);
  });

  it("書類で id を残していない古い監査行は null", () => {
    expect(
      deletedRowId("delivery_orders", "CKK/DOR-2026-00003", {
        status: "DRAFT",
      }),
    ).toBeNull();
    expect(deletedRowId("delivery_orders", null, null)).toBeNull();
    expect(
      deletedRowId("delivery_orders", null, { id: "DOR-2026-00003" }),
    ).toBeNull();
  });

  it("マスタは record_key が主キー（数字だけなら数値）", () => {
    expect(deletedRowId("plants", "12", null)).toBe(12);
    expect(deletedRowId("business_partners", UUID, null)).toBe(UUID);
    expect(deletedRowId("plants", null, null)).toBeNull();
  });
});
