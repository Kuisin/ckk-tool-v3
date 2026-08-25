import { describe, expect, it } from "vitest";
import {
  type RespondStateInput,
  resolveRespondState,
} from "./form-respond-state";

const NOW = new Date("2026-08-26T10:00:00Z");

function input(over: Partial<RespondStateInput> = {}): RespondStateInput {
  return {
    canRespond: true,
    form: {
      status: "PUBLISHED",
      opensAt: null,
      closesAt: null,
      responseEditMode: "NONE",
      responseEditableUntil: null,
      currentVersion: 1,
      allowMultiple: true,
    },
    userId: "u1",
    myResponses: [],
    now: NOW,
    ...over,
  };
}

const answered = [
  {
    responseNumber: "FRM-202608-00001",
    status: "SUBMITTED",
    submittedBy: "u1",
  },
];

describe("resolveRespondState", () => {
  it("受付中で未回答なら回答できる", () => {
    expect(resolveRespondState(input())).toEqual({ kind: "answer" });
  });

  it("存在しない・共有されていないは同じ結末に畳む（実在を漏らさない）", () => {
    expect(resolveRespondState(input({ canRespond: false }))).toEqual({
      kind: "unavailable",
    });
  });

  it("項目が未公開なら not-published", () => {
    expect(
      resolveRespondState(
        input({ form: { ...input().form, currentVersion: 0 } }),
      ),
    ).toEqual({ kind: "not-published" });
  });

  it("下書きのフォームも not-published", () => {
    expect(
      resolveRespondState(
        input({ form: { ...input().form, status: "DRAFT" } }),
      ),
    ).toEqual({ kind: "not-published" });
  });

  it("受付開始前は開始日時を添えて scheduled", () => {
    const opensAt = new Date("2026-08-27T00:00:00Z");
    expect(
      resolveRespondState(input({ form: { ...input().form, opensAt } })),
    ).toEqual({ kind: "scheduled", opensAt });
  });

  it("受付終了は closed（自分の回答があれば番号を添える）", () => {
    const closesAt = new Date("2026-08-25T00:00:00Z");
    expect(
      resolveRespondState(input({ form: { ...input().form, closesAt } })),
    ).toEqual({ kind: "closed", myResponseNumber: null });

    expect(
      resolveRespondState(
        input({ form: { ...input().form, closesAt }, myResponses: answered }),
      ),
    ).toEqual({ kind: "closed", myResponseNumber: "FRM-202608-00001" });
  });

  it("アーカイブは archived", () => {
    expect(
      resolveRespondState(
        input({ form: { ...input().form, status: "ARCHIVED" } }),
      ),
    ).toEqual({ kind: "archived", myResponseNumber: null });
  });

  it("1 人 1 回で回答済みなら already-answered", () => {
    const state = resolveRespondState(
      input({
        form: { ...input().form, allowMultiple: false },
        myResponses: answered,
      }),
    );
    expect(state).toEqual({
      kind: "already-answered",
      responseNumber: "FRM-202608-00001",
      canEdit: false,
    });
  });

  it("1 人 1 回でも下書きだけなら回答を続けられる", () => {
    expect(
      resolveRespondState(
        input({
          form: { ...input().form, allowMultiple: false },
          myResponses: [
            { responseNumber: "FRM-1", status: "DRAFT", submittedBy: "u1" },
          ],
        }),
      ),
    ).toEqual({ kind: "answer" });
  });

  it("複数回答できるフォームは回答済みでも回答できる", () => {
    expect(resolveRespondState(input({ myResponses: answered }))).toEqual({
      kind: "answer",
    });
  });

  it("「もう出しました」は締切より先に伝える", () => {
    // 締切の話をされても本人は打つ手が無い。伝えるべきは回答済みであること。
    const state = resolveRespondState(
      input({
        form: {
          ...input().form,
          allowMultiple: false,
          closesAt: new Date("2026-08-25T00:00:00Z"),
        },
        myResponses: answered,
      }),
    );
    expect(state.kind).toBe("already-answered");
  });

  it("編集期限内なら already-answered に canEdit が立つ", () => {
    const state = resolveRespondState(
      input({
        form: {
          ...input().form,
          allowMultiple: false,
          responseEditMode: "UNTIL_CLOSE",
          closesAt: new Date("2026-08-27T00:00:00Z"),
        },
        myResponses: answered,
      }),
    );
    expect(state).toMatchObject({ kind: "already-answered", canEdit: true });
  });

  describe("?response= で編集しに来たとき", () => {
    const editable = {
      ...input().form,
      responseEditMode: "UNTIL_CLOSE" as const,
      closesAt: new Date("2026-08-27T00:00:00Z"),
    };

    it("期限内なら edit", () => {
      expect(
        resolveRespondState(
          input({
            form: editable,
            myResponses: answered,
            requestedResponseNumber: "FRM-202608-00001",
          }),
        ),
      ).toEqual({ kind: "edit", responseNumber: "FRM-202608-00001" });
    });

    it("期限切れは edit-unavailable（黙って新規フォームを出さない）", () => {
      expect(
        resolveRespondState(
          input({
            form: { ...editable, closesAt: new Date("2026-08-25T00:00:00Z") },
            myResponses: answered,
            requestedResponseNumber: "FRM-202608-00001",
          }),
        ),
      ).toEqual({
        kind: "edit-unavailable",
        responseNumber: "FRM-202608-00001",
        exists: true,
      });
    });

    it("他人の回答・打ち間違いは exists=false（実在を明かさない）", () => {
      expect(
        resolveRespondState(
          input({
            form: editable,
            myResponses: answered,
            requestedResponseNumber: "FRM-202608-09999",
          }),
        ),
      ).toEqual({
        kind: "edit-unavailable",
        responseNumber: "FRM-202608-09999",
        exists: false,
      });
    });

    it("受付が終わっていても、編集期限が別に生きていれば編集できる", () => {
      expect(
        resolveRespondState(
          input({
            form: {
              ...input().form,
              closesAt: new Date("2026-08-25T00:00:00Z"),
              responseEditMode: "UNTIL_DATE",
              responseEditableUntil: new Date("2026-08-30T00:00:00Z"),
            },
            myResponses: answered,
            requestedResponseNumber: "FRM-202608-00001",
          }),
        ),
      ).toEqual({ kind: "edit", responseNumber: "FRM-202608-00001" });
    });

    it("共有されていなければ編集の話にもならない", () => {
      expect(
        resolveRespondState(
          input({
            canRespond: false,
            myResponses: answered,
            requestedResponseNumber: "FRM-202608-00001",
          }),
        ),
      ).toEqual({ kind: "unavailable" });
    });
  });
});
