/**
 * quote-mail.ts — 発行した見積書を顧客へメールで知らせる。server-only。
 *
 * 決まり（宛先・件名・本文）は quote-mail-core.ts。ここは DB から材料を集め、
 * 書類リンクを発行してリレーへ渡すだけ。
 *
 * **PDF は添付しない（セキュリティ上の判断）。** メールには取引先ポータルの
 * 書類リンクだけを載せる:
 *
 *   - 方式は **VERIFY（本人確認つき）** — リンクは宛先のアドレスに束縛され、
 *     開くとそのアドレスへ確認コードが届く。転送・誤送信されても、宛先の
 *     受信箱を持たない人には開けない（lib/portal-links.ts）。本人確認なし
 *     （LINK_ONLY）は特権操作なので、ここからは発行しない。
 *   - 有効期限は**見積書の有効期限の日の終わり**まで（ポータルの上限 180 日で
 *     切る）。期限の過ぎた見積書を開けるリンクを残さない。
 *   - 生のトークンは URL（＝メール本文）にしか存在しない。DB はハッシュだけ、
 *     監査にもトークン・URL は残さない。
 *   - 取消は SY0H（取引先ポータル）の書類リンク一覧から行える。
 *
 * **ポータルが閉じている環境では送らない**（dev-features の `portal`）。
 * 閉じた環境で送ると、開けない（404 の）リンクが顧客に届くため。
 */

import "server-only";

import { recordAudit } from "./audit";
import { prisma } from "./db";
import { isDevFeatureEnabled } from "./dev-features";
import { type DocKey, formatQuoteNumber } from "./doc-number";
import { createFormatters, localized } from "./format";
import { normalizeLocale } from "./i18n";
import { appBaseUrl, isMailerConfigured, sendMail } from "./mailer";
import { label } from "./messages";
import { PORTAL_LINK_MAX_TTL_MS } from "./portal-auth-core";
import { mintPortalLink, revokePortalLink } from "./portal-links";
import { maskEmail } from "./portal-mail-core";
import { normalizePortalEmail } from "./portal-otp";
import {
  buildQuoteMail,
  type MailPartyCandidate,
  pickQuoteRecipient,
  type QuoteMailRecipient,
  quoteLinkExpiry,
} from "./quote-mail-core";
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

export type QuoteMailBlock =
  | "notFound"
  | "noRecipient"
  | "mailerNotConfigured"
  | "portalDisabled";

export type QuoteMailPlan =
  | {
      ok: true;
      recipient: QuoteMailRecipient;
      locale: ReturnType<typeof normalizeLocale>;
    }
  | { ok: false; reason: QuoteMailBlock };

async function loadQuote(key: DocKey) {
  return prisma.quote.findUnique({
    where: { docRef: key.docRef },
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
  if (!isDevFeatureEnabled("portal")) {
    return { ok: false, reason: "portalDisabled" };
  }
  if (!isMailerConfigured()) {
    return { ok: false, reason: "mailerNotConfigured" };
  }
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
      reason: QuoteMailBlock | "notIssued" | "linkFailed" | "sendFailed";
    };

/**
 * 発行済みの見積書について、宛先に束縛した書類リンクを発行してメールで送る。
 * 送れなかったら発行したリンクは取り消す（使われないリンクを残さない）。
 */
export async function sendQuoteMail(
  key: DocKey,
  actorId: string,
): Promise<QuoteMailResult> {
  const plan = await planQuoteMail(key);
  if (!plan.ok) return plan;
  const quote = await loadQuote(key);
  if (!quote) return { ok: false, reason: "notFound" };
  if (quote.status !== "ISSUED") return { ok: false, reason: "notIssued" };

  const quoteNumber = formatQuoteNumber(key);
  const { locale, recipient } = plan;
  const now = new Date();
  const expiresAt = quoteLinkExpiry(
    quote.validUntil,
    now,
    PORTAL_LINK_MAX_TTL_MS,
  );
  if (expiresAt <= now) return { ok: false, reason: "notIssued" };

  const minted = await mintPortalLink(
    {
      resourceType: "quotes",
      resourceId: key.docRef,
      policy: "VERIFY",
      boundEmail: normalizePortalEmail(recipient.email),
      label: `quote-mail ${quoteNumber}`,
      expiresAt,
      createdBy: actorId,
    },
    appBaseUrl(),
  );
  if (!minted.ok) return { ok: false, reason: "linkFailed" };

  const fmt = createFormatters({ ...DEFAULT_PREFERENCES, locale });
  const mail = buildQuoteMail(
    {
      quoteNumber,
      recipient,
      linkUrl: minted.link.url,
      linkExpires: fmt.date(minted.link.expiresAt),
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
  });
  if (!sent) {
    await revokePortalLink(minted.link.id, actorId);
    return { ok: false, reason: "sendFailed" };
  }

  // リンクの発行を SY0H の発行と同じ形で残す（**トークンも URL も残さない**）。
  await recordAudit({
    action: "CREATE",
    tableName: "portal_document_links",
    recordId: minted.link.id,
    after: {
      resourceType: "quotes",
      resourceId: quoteNumber,
      policy: "VERIFY",
      expiresAt: minted.link.expiresAt.toISOString(),
      boundEmail: maskEmail(recipient.email),
      source: "quote-mail",
    },
  });
  return { ok: true, to: recipient.email };
}
