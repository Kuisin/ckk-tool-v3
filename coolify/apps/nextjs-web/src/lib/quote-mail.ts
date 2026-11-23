/**
 * quote-mail.ts — 発行した見積書を顧客へメールで送る。server-only。
 *
 * 決まり（宛先・件名・本文）は quote-mail-core.ts。ここは DB から材料を集め、
 * 保存済みの PDF を添付してリレーへ渡すだけ。
 *
 * **PDF は発行時に生成・保存されたもの（SeaweedFS）を添付する** — ここで
 * 作り直さない。顧客に届く PDF と、詳細画面の PDF タブに見えている PDF を
 * 同じ 1 つにするため。保存されていなければ送らずにエラーを返す。
 *
 * **リレーが添付を扱えないときは送らない**（`mailerSupportsAttachments`）。
 * 古いリレーは添付を黙って捨てるので、「PDF を添付」と書いたメールが
 * 添付なしで届いてしまう。
 */

import "server-only";

import { prisma } from "./db";
import { type DocKey, formatQuoteNumber } from "./doc-number";
import { pdfStorageKey } from "./document-pdf";
import { createFormatters, localized } from "./format";
import { normalizeLocale } from "./i18n";
import {
  isMailerConfigured,
  mailerSupportsAttachments,
  sendMail,
} from "./mailer";
import { label } from "./messages";
import {
  buildQuoteMail,
  type MailPartyCandidate,
  pickQuoteRecipient,
  type QuoteMailRecipient,
} from "./quote-mail-core";
import { getObject } from "./storage";
import { DEFAULT_PREFERENCES } from "./user-preferences-core";

const PARTY_SELECT = {
  name: true,
  email: true,
  documentLocale: true,
  contacts: {
    select: { name: true, email: true, isPrimary: true, isActive: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type PartyRow = {
  name: unknown;
  email: string | null;
  documentLocale: string | null;
  contacts: MailPartyCandidate["contacts"];
};

function toCandidate(p: PartyRow, locale: string): MailPartyCandidate {
  return {
    name: localized(p.name as never, locale),
    email: p.email,
    contacts: p.contacts,
  };
}

export type QuoteMailPlan =
  | {
      ok: true;
      recipient: QuoteMailRecipient;
      locale: ReturnType<typeof normalizeLocale>;
    }
  | { ok: false; reason: "notFound" | "noRecipient" | "mailerNotConfigured" };

async function loadQuote(key: DocKey) {
  return prisma.quote.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    select: {
      status: true,
      validUntil: true,
      customerBp: { select: PARTY_SELECT },
      customerBranchBp: { select: PARTY_SELECT },
      salesRep: { select: { displayName: true, email: true } },
    },
  });
}

/** 送る前の確認用: 誰に・どの言語で送るか（送れないならその理由）。 */
export async function planQuoteMail(key: DocKey): Promise<QuoteMailPlan> {
  if (!isMailerConfigured())
    return { ok: false, reason: "mailerNotConfigured" };
  const quote = await loadQuote(key);
  if (!quote) return { ok: false, reason: "notFound" };
  // 書類の言語は支店 → 本社の順（見積書 PDF と同じ解決）。
  const locale = normalizeLocale(
    quote.customerBranchBp?.documentLocale ?? quote.customerBp.documentLocale,
  );
  const parties = [quote.customerBranchBp, quote.customerBp]
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => toCandidate(p, locale));
  const recipient = pickQuoteRecipient(parties);
  if (!recipient) return { ok: false, reason: "noRecipient" };
  return { ok: true, recipient, locale };
}

export type QuoteMailResult =
  | { ok: true; to: string }
  | {
      ok: false;
      reason:
        | "notFound"
        | "noRecipient"
        | "mailerNotConfigured"
        | "notIssued"
        | "pdfMissing"
        | "attachmentsUnsupported"
        | "sendFailed";
    };

/** 発行済みの見積書を、保存済みの PDF を添付して送る。 */
export async function sendQuoteMail(key: DocKey): Promise<QuoteMailResult> {
  const plan = await planQuoteMail(key);
  if (!plan.ok) return plan;
  const quote = await loadQuote(key);
  if (!quote) return { ok: false, reason: "notFound" };
  if (quote.status !== "ISSUED") return { ok: false, reason: "notIssued" };

  const quoteNumber = formatQuoteNumber(key);
  const pdf = await getObject(pdfStorageKey.quote(quoteNumber));
  if (!pdf) return { ok: false, reason: "pdfMissing" };
  if (!(await mailerSupportsAttachments())) {
    return { ok: false, reason: "attachmentsUnsupported" };
  }

  const { locale, recipient } = plan;
  const fmt = createFormatters({ ...DEFAULT_PREFERENCES, locale });
  const mail = buildQuoteMail(
    {
      quoteNumber,
      recipient,
      validUntil: quote.validUntil ? fmt.date(quote.validUntil) : null,
      salesRepName: quote.salesRep?.displayName ?? null,
      salesRepEmail: quote.salesRep?.email ?? null,
    },
    (k, vars) => label(`sales.quoteMail.${k}`, locale, "", vars),
  );
  const sent = await sendMail({
    to: recipient.email,
    subject: mail.subject,
    text: mail.text,
    // 返信は担当営業へ（差出人は no-reply）。
    replyTo: quote.salesRep?.email ?? undefined,
    attachments: [
      {
        filename: `${quoteNumber}.pdf`,
        contentType: "application/pdf",
        content: new Uint8Array(pdf),
      },
    ],
  });
  return sent
    ? { ok: true, to: recipient.email }
    : { ok: false, reason: "sendFailed" };
}
