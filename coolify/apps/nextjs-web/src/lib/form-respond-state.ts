/**
 * form-respond-state.ts — 共有 URL（/f/<code>）を開いたときに何を見せるか。
 *
 * 「回答できない」には理由がいくつもあり、全部 404 にすると受け取った人は
 * 打つ手が分からない（URL を間違えたのか、まだ始まっていないのか、もう出した
 * のか）。ここで理由を 1 つに畳んでから画面に渡す。
 *
 * ただし **「存在しない」と「共有されていない」は区別しない**（`unavailable`）。
 * 分けると、コードを総当たりすればフォームの実在を確かめられてしまう。
 * 非公開フォームに対する GitHub の 404 と同じ考え方で、UX より先にここを守る。
 *
 * 純関数（I/O なし）— テストで境界を固定する。
 */

import {
  canEditResponse,
  type EditWindow,
  formAvailability,
} from "./form-schema";

export interface RespondStateInput {
  /** 共有設定で回答できるか（存在しない場合も false を渡す）。 */
  canRespond: boolean;
  form: EditWindow & {
    /** 0 = 項目がまだ公開されていない。 */
    currentVersion: number;
    allowMultiple: boolean;
  };
  /** ログイン中のユーザー id。 */
  userId: string;
  /** このフォームに対する自分の回答（新しい順）。無ければ空配列。 */
  myResponses: readonly {
    responseNumber: string;
    status: string;
    submittedBy: string;
  }[];
  /** 編集 URL（/f/<code>/<回答番号>/edit）で指定された回答番号。 */
  requestedResponseNumber?: string | null;
  now: Date;
}

export type RespondState =
  /** 新規に回答できる。 */
  | { kind: "answer" }
  /** 自分の回答を編集する。 */
  | { kind: "edit"; responseNumber: string }
  /** 存在しない、または自分には共有されていない（区別しない）。 */
  | { kind: "unavailable" }
  /** 共有されてはいるが、まだ項目が公開されていない。 */
  | { kind: "not-published" }
  /** 受付開始前。 */
  | { kind: "scheduled"; opensAt: Date | null }
  /** 受付終了。自分の回答があればその番号を添える。 */
  | { kind: "closed"; myResponseNumber: string | null }
  /** アーカイブ済み。 */
  | { kind: "archived"; myResponseNumber: string | null }
  /** 1 人 1 回のフォームに既に回答済み。 */
  | { kind: "already-answered"; responseNumber: string; canEdit: boolean }
  /** 編集しに来たが、期限切れ・他人の回答・存在しないなどで編集できない。 */
  | { kind: "edit-unavailable"; responseNumber: string; exists: boolean };

/**
 * 自分の下書きだけを新しい順で返す。
 *
 * 下書きは**何本あってもよい**（訪問先ごとに書きかけを持つ、といった使い方を
 * する）。提出済みと違って 1 人 1 回の制限にも数えない — まだ出していないから。
 */
export function myDraftsOf(
  myResponses: RespondStateInput["myResponses"],
  userId: string,
): RespondStateInput["myResponses"] {
  return myResponses.filter(
    (r) => r.status === "DRAFT" && r.submittedBy === userId,
  );
}

export function resolveRespondState(input: RespondStateInput): RespondState {
  const { canRespond, form, userId, myResponses, now } = input;

  // 共有されていない／存在しないは、ここで同じ結末に畳む。
  if (!canRespond) return { kind: "unavailable" };

  const submitted = myResponses.filter((r) => r.status !== "DRAFT");
  const latest = submitted[0] ?? myResponses[0] ?? null;

  // 自分の回答を直しに来た場合は、受付期間より先に編集可否を見る
  // （受付が終わっていても「編集は受付終了まで」以外の設定なら直せる）。
  const requested = input.requestedResponseNumber?.trim();
  if (requested) {
    const target = myResponses.find((r) => r.responseNumber === requested);
    if (!target) {
      // 他人の回答・別フォームの回答・打ち間違い。存在の有無は明かさない。
      return {
        kind: "edit-unavailable",
        responseNumber: requested,
        exists: false,
      };
    }
    return canEditResponse(form, target, userId, now)
      ? { kind: "edit", responseNumber: requested }
      : { kind: "edit-unavailable", responseNumber: requested, exists: true };
  }

  const availability = formAvailability(form, now);

  if (availability === "ARCHIVED") {
    return {
      kind: "archived",
      myResponseNumber: latest?.responseNumber ?? null,
    };
  }
  // 下書きのフォーム、または項目が 1 つも公開されていない。
  if (availability === "DRAFT" || form.currentVersion === 0) {
    return { kind: "not-published" };
  }
  if (availability === "SCHEDULED") {
    return { kind: "scheduled", opensAt: form.opensAt };
  }

  // 受付中でも「1 人 1 回」で既に出していれば、新規回答はできない。
  // 受付終了より先に見るのは、この場合に伝えるべきなのが「もう出しました」
  // だから（締切の話をされても本人は困る）。
  if (!form.allowMultiple && submitted.length > 0) {
    const mine = submitted[0];
    return {
      kind: "already-answered",
      responseNumber: mine.responseNumber,
      canEdit: canEditResponse(form, mine, userId, now),
    };
  }

  if (availability === "CLOSED") {
    return { kind: "closed", myResponseNumber: latest?.responseNumber ?? null };
  }

  return { kind: "answer" };
}
