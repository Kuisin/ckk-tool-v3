/**
 * canIssue — 発行ボタンを出す条件。実機検証（2026-09-20）で、追加費用のある
 * 下書きが承認フロー未設定でも「承認済みになるまで」ボタンごと消えていた
 * 退行を止める。押せないのは依頼中だけ。
 */
import { describe, expect, it } from "vitest";
import { canIssue } from "./model";

const plain = { isManualCharge: false };
const charge = { isManualCharge: true };

describe("canIssue", () => {
  it("下書きでなければ出さない", () => {
    expect(
      canIssue({
        status: "ISSUED",
        items: [plain],
        approvalStatus: "NONE",
      } as never),
    ).toBe(false);
  });
  it("追加費用が無い下書きは出す", () => {
    expect(
      canIssue({
        status: "DRAFT",
        items: [plain],
        approvalStatus: "NONE",
      } as never),
    ).toBe(true);
  });
  it("追加費用ありでも、依頼前（NONE）は出す — 押した時点でサーバーが段の有無を見る", () => {
    expect(
      canIssue({
        status: "DRAFT",
        items: [plain, charge],
        approvalStatus: "NONE",
      } as never),
    ).toBe(true);
  });
  it("追加費用ありで差し戻し（REJECTED）も出す — 押し直しが再依頼になる", () => {
    expect(
      canIssue({
        status: "DRAFT",
        items: [charge],
        approvalStatus: "REJECTED",
      } as never),
    ).toBe(true);
  });
  it("追加費用ありで依頼中（PENDING）だけ出さない", () => {
    expect(
      canIssue({
        status: "DRAFT",
        items: [charge],
        approvalStatus: "PENDING",
      } as never),
    ).toBe(false);
  });
  it("追加費用ありで承認済みは出す", () => {
    expect(
      canIssue({
        status: "DRAFT",
        items: [charge],
        approvalStatus: "APPROVED",
      } as never),
    ).toBe(true);
  });
});
