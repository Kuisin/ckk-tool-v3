import { describe, expect, it } from "vitest";
import {
  isMemberEffective,
  memberPeriodState,
  validateMemberPeriod,
} from "./approval-membership";

const NOW = new Date("2026-08-19T12:00:00Z");

describe("isMemberEffective", () => {
  it("常任（両方 null）は常に有効", () => {
    expect(
      isMemberEffective(
        { isActive: true, validFrom: null, validUntil: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("期間前は無効", () => {
    expect(
      isMemberEffective(
        {
          isActive: true,
          validFrom: "2026-08-20T00:00:00Z",
          validUntil: "2026-08-30T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("期間後は無効", () => {
    expect(
      isMemberEffective(
        {
          isActive: true,
          validFrom: "2026-08-01T00:00:00Z",
          validUntil: "2026-08-10T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("期間内は有効", () => {
    expect(
      isMemberEffective(
        {
          isActive: true,
          validFrom: "2026-08-01T00:00:00Z",
          validUntil: "2026-08-30T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("端は両端とも含む", () => {
    expect(
      isMemberEffective(
        { isActive: true, validFrom: NOW, validUntil: NOW },
        NOW,
      ),
    ).toBe(true);
  });

  it("isActive=false は期間内でも無効", () => {
    expect(
      isMemberEffective(
        {
          isActive: false,
          validFrom: "2026-08-01T00:00:00Z",
          validUntil: "2026-08-30T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("memberPeriodState", () => {
  it("無効化は期間より優先", () => {
    expect(
      memberPeriodState(
        { isActive: false, validFrom: null, validUntil: null },
        NOW,
      ),
    ).toBe("DISABLED");
  });

  it("常任 / 期間内 / 期間前 / 期間終了", () => {
    expect(
      memberPeriodState(
        { isActive: true, validFrom: null, validUntil: null },
        NOW,
      ),
    ).toBe("PERMANENT");
    expect(
      memberPeriodState(
        {
          isActive: true,
          validFrom: "2026-08-01T00:00:00Z",
          validUntil: "2026-08-30T00:00:00Z",
        },
        NOW,
      ),
    ).toBe("ACTIVE");
    expect(
      memberPeriodState(
        {
          isActive: true,
          validFrom: "2026-08-20T00:00:00Z",
          validUntil: "2026-08-30T00:00:00Z",
        },
        NOW,
      ),
    ).toBe("SCHEDULED");
    expect(
      memberPeriodState(
        {
          isActive: true,
          validFrom: "2026-08-01T00:00:00Z",
          validUntil: "2026-08-10T00:00:00Z",
        },
        NOW,
      ),
    ).toBe("EXPIRED");
  });
});

describe("validateMemberPeriod", () => {
  it("両方空は常任として通す", () => {
    expect(
      validateMemberPeriod({ validFrom: null, validUntil: null }),
    ).toBeNull();
  });

  it("片側だけは弾く", () => {
    expect(
      validateMemberPeriod({
        validFrom: "2026-08-01T00:00:00Z",
        validUntil: null,
      }),
    ).toBe("期間限定メンバーは開始日時と終了日時の両方を入力してください");
  });

  it("終了が開始以前は弾く", () => {
    expect(
      validateMemberPeriod({
        validFrom: "2026-08-10T00:00:00Z",
        validUntil: "2026-08-10T00:00:00Z",
      }),
    ).toBe("終了日時は開始日時より後にしてください");
  });

  it("正しい期間は通す", () => {
    expect(
      validateMemberPeriod({
        validFrom: "2026-08-01T00:00:00Z",
        validUntil: "2026-08-30T00:00:00Z",
      }),
    ).toBeNull();
  });
});
