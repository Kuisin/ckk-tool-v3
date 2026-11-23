import { describe, expect, it } from "vitest";
import {
  buildQuoteMail,
  type MailPartyCandidate,
  pickQuoteRecipient,
  quoteLinkExpiry,
} from "./quote-mail-core";

const party = (over: Partial<MailPartyCandidate> = {}): MailPartyCandidate => ({
  name: "株式会社テスト",
  email: null,
  contacts: [],
  ...over,
});

describe("pickQuoteRecipient", () => {
  it("主担当者のメールを優先する", () => {
    const r = pickQuoteRecipient([
      party({
        email: "info@example.com",
        contacts: [
          {
            name: "佐藤",
            email: "sato@example.com",
            isPrimary: false,
            isActive: true,
          },
          {
            name: "鈴木",
            email: "suzuki@example.com",
            isPrimary: true,
            isActive: true,
          },
        ],
      }),
    ]);
    expect(r).toEqual({
      email: "suzuki@example.com",
      displayName: "鈴木",
      companyName: "株式会社テスト",
    });
  });

  it("無効な担当者・アドレスの無い担当者は飛ばし、次に会社のアドレス", () => {
    const r = pickQuoteRecipient([
      party({
        email: " info@example.com ",
        contacts: [
          {
            name: "退職者",
            email: "old@example.com",
            isPrimary: true,
            isActive: false,
          },
          { name: "未登録", email: null, isPrimary: false, isActive: true },
          {
            name: "壊れた",
            email: "not-an-email",
            isPrimary: false,
            isActive: true,
          },
        ],
      }),
    ]);
    expect(r?.email).toBe("info@example.com");
    expect(r?.displayName).toBe("株式会社テスト");
  });

  it("支店に窓口があれば本社より先に使う", () => {
    const r = pickQuoteRecipient([
      party({ name: "大阪支店", email: "osaka@example.com" }),
      party({ name: "本社", email: "hq@example.com" }),
    ]);
    expect(r?.email).toBe("osaka@example.com");
  });

  it("支店に窓口が無ければ本社へ落ちる", () => {
    const r = pickQuoteRecipient([
      party({ name: "大阪支店" }),
      party({
        name: "本社",
        contacts: [
          {
            name: "田中",
            email: "tanaka@example.com",
            isPrimary: false,
            isActive: true,
          },
        ],
      }),
    ]);
    expect(r).toEqual({
      email: "tanaka@example.com",
      displayName: "田中",
      companyName: "本社",
    });
  });

  it("どこにもアドレスが無ければ null", () => {
    expect(pickQuoteRecipient([party(), party({ name: "本社" })])).toBeNull();
  });
});

describe("buildQuoteMail", () => {
  const t = (key: string, vars?: Record<string, unknown>) =>
    `${key}${vars ? JSON.stringify(vars) : ""}`;

  it("担当者宛は会社名 + 担当者名、担当者の連絡先を最後に添える", () => {
    const m = buildQuoteMail(
      {
        quoteNumber: "QOT-202611-00001",
        linkUrl: "https://app.example/portal/d/TOKEN",
        linkExpires: "2026/12/31",
        recipient: {
          email: "a@example.com",
          displayName: "鈴木",
          companyName: "株式会社テスト",
        },
        validUntil: "2026/12/31",
        salesRepName: "山田",
        salesRepEmail: "yamada@ckk.example",
      },
      t,
    );
    expect(m.subject).toBe('subject{"number":"QOT-202611-00001"}');
    const lines = m.text.split("\n");
    expect(lines[0]).toBe(
      'salutationPerson{"company":"株式会社テスト","person":"鈴木"}',
    );
    expect(m.text).toContain('validUntil{"date":"2026/12/31"}');
    // リンクは本文にそのまま 1 行で載る（メーラーが自動でリンクにする）。
    expect(lines).toContain("https://app.example/portal/d/TOKEN");
    expect(m.text).toContain('linkNote{"date":"2026/12/31"}');
    expect(lines.at(-1)).toBe(
      'contactWithEmail{"name":"山田","email":"yamada@ckk.example"}',
    );
  });

  it("会社宛・期限なし・担当なしでも組み立てられる", () => {
    const m = buildQuoteMail(
      {
        quoteNumber: "QOT-202611-00002",
        linkUrl: "https://app.example/portal/d/TOKEN2",
        linkExpires: "2026/12/01",
        recipient: {
          email: "info@example.com",
          displayName: "本社",
          companyName: "本社",
        },
        validUntil: null,
        salesRepName: null,
        salesRepEmail: null,
      },
      t,
    );
    expect(m.text.split("\n")[0]).toBe('salutationCompany{"company":"本社"}');
    expect(m.text).not.toContain("validUntil");
    expect(m.text).not.toContain("contact");
  });
});

describe("quoteLinkExpiry", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date("2026-11-23T03:00:00Z");

  it("見積書の有効期限の日の JST 23:59:59 まで", () => {
    expect(
      quoteLinkExpiry(
        new Date("2026-12-31T00:00:00Z"),
        now,
        180 * DAY,
      ).toISOString(),
    ).toBe("2026-12-31T14:59:59.000Z");
  });

  it("ポータルの上限を超えるなら上限の 1 分手前で切る", () => {
    const r = quoteLinkExpiry(new Date("2027-12-31T00:00:00Z"), now, 180 * DAY);
    expect(r.getTime()).toBe(now.getTime() + 180 * DAY - 60_000);
  });

  it("有効期限が無ければ上限まで", () => {
    expect(quoteLinkExpiry(null, now, 30 * DAY).getTime()).toBe(
      now.getTime() + 30 * DAY - 60_000,
    );
  });

  it("期限が今日なら今日の終わり（過ぎていれば過去 — 呼び出し側が送らない）", () => {
    expect(
      quoteLinkExpiry(
        new Date("2026-11-23T00:00:00Z"),
        now,
        180 * DAY,
      ).toISOString(),
    ).toBe("2026-11-23T14:59:59.000Z");
    expect(
      quoteLinkExpiry(new Date("2026-11-22T00:00:00Z"), now, 180 * DAY) < now,
    ).toBe(true);
  });
});
