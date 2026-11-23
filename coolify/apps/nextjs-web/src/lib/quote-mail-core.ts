/**
 * quote-mail-core.ts — 見積書を顧客へメールで送るときの「誰に・何を」（純ロジック）。
 *
 * 送信そのもの（DB・ストレージ・リレー）は quote-mail.ts。ここは試験できる
 * 決まりだけを持つ:
 *
 *   1. 宛先の決め方 — 支店 → 本社の順に、主担当者（有効・メールあり）→
 *      その他の有効な担当者 → 会社のメールアドレス。最初に見つかった 1 件。
 *      **支店を指定した見積書は支店の窓口を優先する**（本社に届いても担当が
 *      分からない、を作らない）。
 *   2. 件名・本文 — 受取先の書類の言語（見積書の PDF と同じ規則）で組み立てる。
 *      閲覧者の言語では変えない（_specs/i18n-glossary.md §2.7）。
 *
 * **PDF は添付しない。** 本文には取引先ポータルの書類リンク（本人確認つき —
 * 開くと宛先のアドレスへ確認コードが届く）だけを載せる。メールが転送・
 * 誤送信されても、リンクは宛先のアドレスでしか開けない。
 */

export interface MailContactCandidate {
  name: string;
  email: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface MailPartyCandidate {
  /** 会社（または支店）の名称。宛名に使う。 */
  name: string;
  email: string | null;
  contacts: MailContactCandidate[];
}

export interface QuoteMailRecipient {
  email: string;
  /** 宛名（担当者名、または会社名）。 */
  displayName: string;
  /** 宛名が担当者のときの会社名（「○○株式会社 △△ 様」の前半）。 */
  companyName: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usableEmail(email: string | null | undefined): string | null {
  const v = email?.trim();
  return v && EMAIL_RE.test(v) ? v : null;
}

/**
 * 宛先を 1 件決める。`parties` は優先順（支店 → 本社）。誰にも送れなければ null。
 */
export function pickQuoteRecipient(
  parties: MailPartyCandidate[],
): QuoteMailRecipient | null {
  for (const party of parties) {
    const active = party.contacts.filter(
      (c) => c.isActive && usableEmail(c.email),
    );
    const contact = active.find((c) => c.isPrimary) ?? active[0];
    if (contact) {
      return {
        email: usableEmail(contact.email) as string,
        displayName: contact.name,
        companyName: party.name,
      };
    }
    const companyEmail = usableEmail(party.email);
    if (companyEmail) {
      return {
        email: companyEmail,
        displayName: party.name,
        companyName: party.name,
      };
    }
  }
  return null;
}

/** 本文を組み立てるのに要る値。文言そのものは呼び出し側が渡す `t` が持つ。 */
export interface QuoteMailVars {
  quoteNumber: string;
  recipient: QuoteMailRecipient;
  /** 書類リンク（本人確認つき）の URL。 */
  linkUrl: string;
  /** リンクの有効期限（受取先の言語で書式済み）。 */
  linkExpires: string;
  /** 有効期限（受取先の言語で書式済みの文字列）。 */
  validUntil: string | null;
  salesRepName: string | null;
  salesRepEmail: string | null;
}

type T = (key: string, vars?: Record<string, unknown>) => string;

/**
 * 件名と本文（プレーンテキスト）。`t` は `sales.quoteMail.*` を受取先の言語で
 * 引く関数。宛名の行は担当者宛か会社宛かで変える。
 */
export function buildQuoteMail(
  vars: QuoteMailVars,
  t: T,
): { subject: string; text: string } {
  const { recipient } = vars;
  const salutation =
    recipient.displayName === recipient.companyName
      ? t("salutationCompany", { company: recipient.companyName })
      : t("salutationPerson", {
          company: recipient.companyName,
          person: recipient.displayName,
        });
  const lines = [
    salutation,
    "",
    t("body", { number: vars.quoteNumber }),
    "",
    // URL は 1 行で単独に置く（メーラーが自動でリンクにする）。
    vars.linkUrl,
    "",
    t("linkNote", { date: vars.linkExpires }),
  ];
  if (vars.validUntil) {
    lines.push(t("validUntil", { date: vars.validUntil }));
  }
  lines.push("", t("closing"));
  if (vars.salesRepName) {
    lines.push(
      "",
      vars.salesRepEmail
        ? t("contactWithEmail", {
            name: vars.salesRepName,
            email: vars.salesRepEmail,
          })
        : t("contact", { name: vars.salesRepName }),
    );
  }
  return {
    subject: t("subject", { number: vars.quoteNumber }),
    text: lines.join("\n"),
  };
}

/**
 * メールに載せる書類リンクの有効期限 = **見積書の有効期限の日の終わり（JST）**。
 * 期限の過ぎた見積書を開けるリンクを残さないため。ポータルの上限（maxTtlMs）を
 * 超えるときは上限の 1 分手前で切る（上限ちょうどは発行側が拒む）。
 * 有効期限の無い見積書は上限まで。
 */
export function quoteLinkExpiry(
  validUntil: Date | null,
  now: Date,
  maxTtlMs: number,
): Date {
  const cap = new Date(now.getTime() + maxTtlMs - 60_000);
  if (!validUntil) return cap;
  // validUntil は日付列（UTC 0 時）。JST 23:59:59 = その日の UTC 14:59:59。
  const endOfDayJst = new Date(
    validUntil.getTime() + (15 * 60 * 60 - 1) * 1000,
  );
  return endOfDayJst < cap ? endOfDayJst : cap;
}
