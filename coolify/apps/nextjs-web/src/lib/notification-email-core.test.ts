/**
 * notification-email-core.test.ts — 通知メールの送り方の不変条件。
 *
 * ここが守るもの:
 *  - **既定でメールが減る**こと（ダイジェスト有効・即時は空）。この機能の目的
 *    そのもので、既定が緩むと元の「1 件 = 1 通」に戻る。
 *  - ダイジェストを切ったら**元の挙動に戻る**こと（逃げ道を塞がない）。
 *  - 猶予を過ぎていない通知を拾わないこと。拾うと、人が画面で読む前に必ず
 *    メールが出てまとめる意味が消える。
 *  - 間隔が空くまで次を送らないこと。
 *  - 載せきれない分を数えること（畳んだ分も送信済みとして扱う前提なので、
 *    件数が消えると「何件あったか」が誰にも分からなくなる）。
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_EMAIL_SETTINGS as DEFAULTS,
  type DigestItem,
  digestCutoff,
  digestSubject,
  isDigestDue,
  notificationEmailSettingsSchema,
  sendsImmediateEmail,
  splitDigestItems,
} from "./notification-email-core";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function item(id: string, minutesAgo: number): DigestItem {
  return {
    id,
    type: "APPROVAL_REQUEST",
    title: `件名 ${id}`,
    message: null,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000),
  };
}

describe("既定値", () => {
  it("ダイジェスト有効・即時なし = メールが減る側に倒れている", () => {
    expect(DEFAULTS.digestEnabled).toBe(true);
    expect(DEFAULTS.immediateTypes).toEqual([]);
  });

  it("既定値そのものが検証を通る", () => {
    expect(notificationEmailSettingsSchema.safeParse(DEFAULTS).success).toBe(
      true,
    );
  });

  it("間隔・猶予・件数には範囲がある（0 分間隔で回し続けない）", () => {
    const bad = { ...DEFAULTS, intervalMinutes: 0 };
    expect(notificationEmailSettingsSchema.safeParse(bad).success).toBe(false);
  });
});

describe("sendsImmediateEmail", () => {
  it("既定ではどの種別も即時送信しない", () => {
    expect(sendsImmediateEmail(DEFAULTS, "APPROVAL_REQUEST")).toBe(false);
    expect(sendsImmediateEmail(DEFAULTS, "SYSTEM")).toBe(false);
  });

  it("指定した種別だけ即時になる", () => {
    const s = { ...DEFAULTS, immediateTypes: ["APPROVAL_REQUEST" as const] };
    expect(sendsImmediateEmail(s, "APPROVAL_REQUEST")).toBe(true);
    expect(sendsImmediateEmail(s, "APPROVAL_RESULT")).toBe(false);
  });

  it("ダイジェストを切ると全部が即時（従来の挙動に戻る）", () => {
    const s = { ...DEFAULTS, digestEnabled: false };
    expect(sendsImmediateEmail(s, "SHARE")).toBe(true);
    expect(sendsImmediateEmail(s, "SYSTEM")).toBe(true);
  });
});

describe("digestCutoff", () => {
  it("猶予のぶんだけ手前で切る", () => {
    expect(digestCutoff(NOW, DEFAULTS).toISOString()).toBe(
      "2026-08-30T11:45:00.000Z",
    );
  });

  it("猶予 0 なら今この瞬間まで拾う", () => {
    expect(digestCutoff(NOW, { ...DEFAULTS, graceMinutes: 0 }).getTime()).toBe(
      NOW.getTime(),
    );
  });
});

describe("isDigestDue", () => {
  it("一度も送っていない人には送れる", () => {
    expect(isDigestDue(NOW, null, DEFAULTS)).toBe(true);
  });

  it("間隔が空くまでは送らない", () => {
    const sent59 = new Date(NOW.getTime() - 59 * 60_000);
    expect(isDigestDue(NOW, sent59, DEFAULTS)).toBe(false);
  });

  it("ちょうど間隔が経てば送る", () => {
    const sent60 = new Date(NOW.getTime() - 60 * 60_000);
    expect(isDigestDue(NOW, sent60, DEFAULTS)).toBe(true);
  });
});

describe("splitDigestItems", () => {
  it("上限までを載せ、残りを数える", () => {
    const items = Array.from({ length: 25 }, (_, i) => item(String(i), 60));
    const { shown, omittedCount } = splitDigestItems(items, DEFAULTS);
    expect(shown).toHaveLength(20);
    expect(omittedCount).toBe(5);
  });

  it("上限内なら畳まない", () => {
    const { shown, omittedCount } = splitDigestItems([item("a", 60)], DEFAULTS);
    expect(shown).toHaveLength(1);
    expect(omittedCount).toBe(0);
  });
});

describe("digestSubject", () => {
  it("件名に総件数を出す（畳んだ分も含む）", () => {
    expect(digestSubject(25)).toBe("【CKK】未読の通知 25 件");
  });
});
