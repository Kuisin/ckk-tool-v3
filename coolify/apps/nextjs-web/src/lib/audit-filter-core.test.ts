import { describe, expect, it } from "vitest";
import { parseAuditQuery } from "./audit-filter-core";

describe("parseAuditQuery", () => {
  it("既定値（空のクエリ）", () => {
    const q = parseAuditQuery({});
    expect(q).toEqual({
      from: null,
      to: null,
      userId: null,
      action: null,
      tableName: null,
      q: null,
      page: 1,
      pageSize: 20,
      sortDir: "desc",
    });
  });

  it("正しい値はそのまま通す", () => {
    const q = parseAuditQuery({
      from: "2026-08-01",
      to: "2026-08-31",
      user: "9a1c2e34-56f7-4890-abcd-ef0123456789",
      action: "UPDATE",
      table: "quotes",
      q: "QOT-202608",
      page: "3",
      size: "50",
      sort: "at.asc",
    });
    expect(q).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
      userId: "9a1c2e34-56f7-4890-abcd-ef0123456789",
      action: "UPDATE",
      tableName: "quotes",
      q: "QOT-202608",
      page: 3,
      pageSize: 50,
      sortDir: "asc",
    });
  });

  it("不正な日付形式は null", () => {
    expect(parseAuditQuery({ from: "2026/08/01" }).from).toBeNull();
    expect(parseAuditQuery({ to: "not-a-date" }).to).toBeNull();
  });

  it("許可リストに無い action・table は null（Prisma へ渡さない）", () => {
    expect(parseAuditQuery({ action: "DROP TABLE" }).action).toBeNull();
    expect(parseAuditQuery({ table: "no_such_table" }).tableName).toBeNull();
  });

  it("uuid でない user は null", () => {
    expect(parseAuditQuery({ user: "not-a-uuid" }).userId).toBeNull();
  });

  it("page は 1 以上の整数にクランプ、それ以外は 1", () => {
    expect(parseAuditQuery({ page: "0" }).page).toBe(1);
    expect(parseAuditQuery({ page: "-3" }).page).toBe(1);
    expect(parseAuditQuery({ page: "abc" }).page).toBe(1);
    expect(parseAuditQuery({ page: "2.5" }).page).toBe(1);
    expect(parseAuditQuery({ page: "5" }).page).toBe(5);
  });

  it("size は許可された刻みだけ通す。それ以外は既定 20", () => {
    expect(parseAuditQuery({ size: "10" }).pageSize).toBe(10);
    expect(parseAuditQuery({ size: "100" }).pageSize).toBe(100);
    expect(parseAuditQuery({ size: "37" }).pageSize).toBe(20);
    expect(parseAuditQuery({ size: "abc" }).pageSize).toBe(20);
  });

  it("sort は at 列だけ対応。それ以外の列は既定 desc へ倒す", () => {
    expect(parseAuditQuery({ sort: "at.asc" }).sortDir).toBe("asc");
    expect(parseAuditQuery({ sort: "at.desc" }).sortDir).toBe("desc");
    expect(parseAuditQuery({ sort: "recordId.asc" }).sortDir).toBe("desc");
    expect(parseAuditQuery({ sort: "" }).sortDir).toBe("desc");
  });

  it("配列で来た値は先頭だけ見る（多重パラメータ対策）", () => {
    expect(parseAuditQuery({ action: ["UPDATE", "DELETE"] }).action).toBe(
      "UPDATE",
    );
  });
});
