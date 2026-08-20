/**
 * approval-permissions.test.ts — 承認設定 (MS0B) が出す「権限あり / なし」の規則。
 *
 * 画面の表示が authz-core の decide() と食い違うと、設定画面が嘘をつく
 * （「権限あり」と出ているのに押せない、あるいはその逆）。ここで守るのは
 * decide() と同じ 3 点: APPROVE 一致 / ADMIN の内包 / system:ADMIN の全内包。
 */

import { describe, expect, it } from "vitest";
import {
  type ApprovePermissionRow,
  buildApproveCapability,
} from "./approval-permissions";

const row = (
  code: string,
  action: string,
  scope = "ALL",
): ApprovePermissionRow => ({ code, action, scope });

describe("buildApproveCapability", () => {
  it("APPROVE を持っていれば承認できる", () => {
    const cap = buildApproveCapability(
      [row("work_order", "APPROVE")],
      "work_order",
    );
    expect(cap.allowed).toBe(true);
    expect(cap.unrestricted).toBe(true);
  });

  it("別コードの APPROVE では承認できない", () => {
    const cap = buildApproveCapability(
      [row("work_order", "APPROVE")],
      "order_acceptance",
    );
    expect(cap.allowed).toBe(false);
  });

  it("READ など他アクションだけでは承認できない", () => {
    const cap = buildApproveCapability(
      [row("work_order", "READ"), row("work_order", "UPDATE")],
      "work_order",
    );
    expect(cap.allowed).toBe(false);
  });

  it("同じコードの ADMIN は APPROVE を内包する", () => {
    const cap = buildApproveCapability(
      [row("purchase_order", "ADMIN")],
      "purchase_order",
    );
    expect(cap.allowed).toBe(true);
  });

  it("system:ADMIN は全コードを内包する", () => {
    const cap = buildApproveCapability([row("system", "ADMIN")], "work_order");
    expect(cap.allowed).toBe(true);
    expect(cap.unrestricted).toBe(true);
  });

  it("ALL が無ければ限定スコープとして返す（拠点で書類ごとに変わる）", () => {
    const cap = buildApproveCapability(
      [row("work_order", "APPROVE", "PLANT")],
      "work_order",
    );
    expect(cap.allowed).toBe(true);
    expect(cap.unrestricted).toBe(false);
    expect(cap.scopes).toEqual(["PLANT"]);
  });

  it("1 行でも ALL があれば全社（複数ロールの和集合）", () => {
    const cap = buildApproveCapability(
      [
        row("work_order", "APPROVE", "PLANT"),
        row("work_order", "APPROVE", "ALL"),
      ],
      "work_order",
    );
    expect(cap.unrestricted).toBe(true);
    expect(cap.scopes).toEqual([]);
  });

  it("権限行が無ければ承認できない", () => {
    expect(buildApproveCapability([], "work_order").allowed).toBe(false);
  });
});
