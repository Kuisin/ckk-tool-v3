import { describe, expect, it } from "vitest";
import {
  buildQuoteMail,
  type MailPartyCandidate,
  pickQuoteRecipient,
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
    expect(lines.at(-1)).toBe(
      'contactWithEmail{"name":"山田","email":"yamada@ckk.example"}',
    );
  });

  it("会社宛・期限なし・担当なしでも組み立てられる", () => {
    const m = buildQuoteMail(
      {
        quoteNumber: "QOT-202611-00002",
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
