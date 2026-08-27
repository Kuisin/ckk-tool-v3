import { describe, expect, it } from "vitest";
import { STATUS_MAPS } from "@/components/ui/StatusBadge";
import { DESIGN_TRIGGER_LABEL } from "@/lib/enum-labels";
import {
  canAttachFiles,
  canComplete,
  canOverrideKind,
  canReassign,
  canReopen,
  canRequestApproval,
  canStart,
  DESIGN_TRIGGER_COLOR,
  type DesignRequestStatus,
  type DesignRequestTrigger,
  hasSourceDocument,
  isCancellable,
  isEditable,
  isIssuedDesign,
} from "./model";

/** 承認フロー導入後の 7 状態。DB の enum 順と同じ並び。 */
const ALL_STATUSES: DesignRequestStatus[] = [
  "DRAFT",
  "REQUESTED",
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

/**
 * 状態 × 述語の真理値表。
 *
 * 述語を 1 つ直したときに「他の状態で何が変わったか」が diff に出るよう、
 * if を並べるのではなく表で持つ。
 */
const TABLE: Record<DesignRequestStatus, Record<string, boolean>> = {
  //            編集 承認依頼 振替 着手 完了 巻戻し キャンセル 区分上書き 添付 PDF
  DRAFT: {
    isEditable: true,
    canRequestApproval: true,
    canReassign: false,
    canStart: false,
    canComplete: false,
    canReopen: false,
    isCancellable: true,
    canOverrideKind: true,
    canAttachFiles: false,
    isIssuedDesign: false,
  },
  REQUESTED: {
    isEditable: false,
    canRequestApproval: false,
    canReassign: false,
    canStart: false,
    canComplete: false,
    canReopen: false,
    isCancellable: true,
    canOverrideKind: false,
    canAttachFiles: false,
    isIssuedDesign: false,
  },
  PENDING: {
    isEditable: false,
    canRequestApproval: false,
    canReassign: true,
    canStart: true,
    canComplete: false,
    canReopen: false,
    isCancellable: true,
    canOverrideKind: false,
    canAttachFiles: true,
    isIssuedDesign: true,
  },
  IN_PROGRESS: {
    isEditable: false,
    canRequestApproval: false,
    canReassign: true,
    canStart: false,
    canComplete: true,
    canReopen: false,
    isCancellable: true,
    canOverrideKind: false,
    canAttachFiles: true,
    isIssuedDesign: true,
  },
  COMPLETED: {
    isEditable: false,
    canRequestApproval: false,
    canReassign: false,
    canStart: false,
    canComplete: false,
    canReopen: true,
    isCancellable: false,
    canOverrideKind: false,
    canAttachFiles: false,
    isIssuedDesign: true,
  },
  REJECTED: {
    isEditable: true,
    canRequestApproval: true,
    canReassign: false,
    canStart: false,
    canComplete: false,
    canReopen: false,
    isCancellable: true,
    canOverrideKind: true,
    canAttachFiles: false,
    isIssuedDesign: false,
  },
  CANCELLED: {
    isEditable: false,
    canRequestApproval: false,
    canReassign: false,
    canStart: false,
    canComplete: false,
    canReopen: false,
    isCancellable: false,
    canOverrideKind: false,
    canAttachFiles: false,
    isIssuedDesign: false,
  },
};

const PREDICATES = {
  isEditable,
  canRequestApproval,
  canReassign,
  canStart,
  canComplete,
  canReopen,
  isCancellable,
  canOverrideKind,
  canAttachFiles,
  isIssuedDesign: (r: { status: DesignRequestStatus }) =>
    isIssuedDesign(r.status),
};

describe("設計依頼書の状態述語", () => {
  for (const status of ALL_STATUSES) {
    for (const [name, fn] of Object.entries(PREDICATES)) {
      const expected = TABLE[status][name];
      it(`${status}: ${name} = ${expected}`, () => {
        expect(fn({ status })).toBe(expected);
      });
    }
  }
});

describe("状態機械の不変条件", () => {
  it("編集できるのは承認に出す前だけ（下書き・差し戻し）", () => {
    const editable = ALL_STATUSES.filter((s) => isEditable({ status: s }));
    expect(editable).toEqual(["DRAFT", "REJECTED"]);
  });

  it("承認依頼を出せる状態 = 編集できる状態", () => {
    for (const status of ALL_STATUSES) {
      expect(canRequestApproval({ status })).toBe(isEditable({ status }));
    }
  });

  it("添付と担当者の振り替えは同じ状態集合（承認済〜完了前）だが別の述語", () => {
    for (const status of ALL_STATUSES) {
      expect(canAttachFiles({ status })).toBe(canReassign({ status }));
    }
    // 別関数であること自体が意図（片方を変えても、もう片方が動かない）。
    expect(canAttachFiles).not.toBe(canReassign);
  });

  it("依頼区分を上書きできるのは承認に出す前だけ", () => {
    for (const status of ALL_STATUSES) {
      expect(canOverrideKind({ status })).toBe(isEditable({ status }));
    }
  });

  it("PDF を出せるのは承認済み以降のみ — REQUESTED/REJECTED は漏らさない", () => {
    expect(isIssuedDesign("REQUESTED")).toBe(false);
    expect(isIssuedDesign("REJECTED")).toBe(false);
    expect(isIssuedDesign("CANCELLED")).toBe(false);
    expect(ALL_STATUSES.filter(isIssuedDesign)).toEqual([
      "PENDING",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
  });

  it("前へ進める操作は同時に 1 つだけ（着手 / 完了 / 承認依頼が競合しない）", () => {
    for (const status of ALL_STATUSES) {
      const forward = [canRequestApproval, canStart, canComplete].filter((f) =>
        f({ status }),
      );
      expect(forward.length).toBeLessThanOrEqual(1);
    }
  });

  it("完了済みはキャンセルできない（巻き戻してからにする）", () => {
    expect(isCancellable({ status: "COMPLETED" })).toBe(false);
    expect(canReopen({ status: "COMPLETED" })).toBe(true);
  });
});

describe("トリガーと参照元", () => {
  const ALL_TRIGGERS: DesignRequestTrigger[] = [
    "QUOTE",
    "SALES_ORDER",
    "STANDALONE",
  ];

  it("参照元の書類を持つのは 見積時 / 受注時 だけ", () => {
    expect(ALL_TRIGGERS.filter(hasSourceDocument)).toEqual([
      "QUOTE",
      "SALES_ORDER",
    ]);
  });

  it("単独は参照元を持たない", () => {
    expect(hasSourceDocument("STANDALONE")).toBe(false);
  });

  it("全トリガーにラベルと色がある", () => {
    for (const t of ALL_TRIGGERS) {
      expect(DESIGN_TRIGGER_LABEL[t], `${t} のラベルが無い`).toBeTruthy();
      expect(DESIGN_TRIGGER_COLOR[t], `${t} の色が無い`).toBeTruthy();
    }
  });
});

describe("StatusBadge との整合", () => {
  it("7 状態すべてにバッジ定義がある", () => {
    const map = STATUS_MAPS.DesignRequest;
    for (const status of ALL_STATUSES) {
      expect(map[status], `${status} のバッジ定義が無い`).toBeDefined();
    }
  });

  it("バッジ定義に未知の状態が混ざっていない", () => {
    expect(Object.keys(STATUS_MAPS.DesignRequest).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });
});
