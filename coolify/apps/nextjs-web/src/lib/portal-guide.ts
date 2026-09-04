/**
 * portal-guide.ts — 取引先ポータルの「ご利用案内」に載せるもの。server-only.
 *
 * 取引先（BP）1 社ぶんを 1 つの PDF にし、**ご担当者 1 名 = 1 ページ**にする。
 * 1 枚が 1 人ぶんの完結した案内になるので、そのまま切り離して渡せる
 * （1 社に窓口が複数ある — 購買と品証で別の人、はごく普通）。
 *
 * ■ 有効なアカウントしか刷らない
 * 作成しただけのアカウント（is_active=false）はログインできない。案内を渡した
 * 相手が「開けない」と言ってくるだけなので、有効化前は発行を断る
 * （呼び出し側が理由を出す）。
 *
 * ■ 紙に載せない秘密
 * バックアップコード・セッション・書類リンクのトークンは載せない。あれらは
 * 持っているだけで開ける資格情報で、手渡し以外の経路に出さない
 * （portal.prisma / portal-guide-core.ts の方針）。載せるのは宛先アドレス
 * （＝本人の識別子）まで。
 *
 * ■ アドレスは伏せない
 * SY0H の一覧はアドレスをマスクして出すが、あれは**他社の窓口が何十行も並ぶ
 * 画面**での配慮。この紙は本人宛の 1 枚で、載っているのは本人のアドレスだから
 * 伏せる意味が無い（伏せると「どのアドレスで登録されているか」という、案内で
 * 一番聞かれることに答えられない）。
 */

import "server-only";

import { prisma } from "./db";
import { type LocalizedTextInput, localized } from "./format";
import { type Locale, normalizeLocale } from "./i18n";
import { appBaseUrl } from "./mailer";
import { isLivePortalGrant } from "./portal-access-core";
import {
  type PortalGuideScope,
  portalLoginUrl,
  summarizePortalGuideScope,
} from "./portal-guide-core";

/** 案内 1 ページ = ご担当者 1 名。 */
export interface PortalGuidePage {
  accountId: string;
  /** 取引先名（支店で登録されていれば支店名）。 */
  partnerName: string;
  contactName: string;
  email: string;
  /** ログイン画面の URL（文字で読める形。QR も同じものを指す）。 */
  loginUrl: string;
  /** 前埋め付きの URL（QR に入れる）。 */
  qrUrl: string;
  scope: PortalGuideScope;
  /** 自社の営業担当（困ったときの連絡先）。主担当が居なければ null。 */
  salesRepName: string | null;
  salesRepEmail: string | null;
}

export interface PortalGuideDocument {
  /** 見出しと保存名に使う取引先名。 */
  partnerName: string;
  /** 受取先の言語（_specs/i18n-glossary.md 決定 10）。 */
  locale: Locale;
  pages: PortalGuidePage[];
}

/** 発行できない理由（呼び出し側が利用者に見せる文言へ写す）。 */
export type PortalGuideError = "NOT_FOUND" | "INACTIVE" | "NO_ACCOUNTS";

type Result =
  | { ok: true; document: PortalGuideDocument }
  | { ok: false; error: PortalGuideError };

/** 主担当の営業。居なければ並び順の先頭、それも無ければ null。 */
async function salesRepFor(
  bpId: string,
): Promise<{ name: string; email: string | null } | null> {
  const rep = await prisma.bpSalesRep
    .findFirst({
      where: { bpId },
      select: { user: { select: { displayName: true, email: true } } },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    })
    .catch(() => null);
  if (!rep?.user) return null;
  return { name: rep.user.displayName, email: rep.user.email ?? null };
}

/**
 * 受取先の言語。支店で登録されていれば支店 → 親 → 既定（ja）の順に見る
 * （帳票 3 種と同じ規約）。
 */
function documentLocaleOf(bp: {
  documentLocale: string | null;
  parent: { documentLocale: string | null } | null;
}): Locale {
  return normalizeLocale(bp.documentLocale ?? bp.parent?.documentLocale);
}

const ACCOUNT_SELECT = {
  id: true,
  displayName: true,
  email: true,
  isActive: true,
  bpId: true,
  bp: {
    select: {
      id: true,
      name: true,
      documentLocale: true,
      parent: { select: { documentLocale: true } },
    },
  },
  grants: {
    select: {
      kind: true,
      resourceType: true,
      resourceId: true,
      includeBranches: true,
      includeAsEndUser: true,
      expiresAt: true,
      revokedAt: true,
    },
  },
} as const;

type AccountRow = {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  bpId: string;
  bp: {
    id: string;
    name: unknown;
    documentLocale: string | null;
    parent: { documentLocale: string | null } | null;
  };
  grants: {
    kind: string;
    resourceType: string | null;
    resourceId: string | null;
    includeBranches: boolean;
    includeAsEndUser: boolean;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }[];
};

/**
 * 付与 → 案内に書く「ご覧いただけるもの」。
 *
 * 期限切れ・失効の落とし方は**判定側と同じ関数**（isLivePortalGrant）を通す。
 * フォームは code しか付与に入っていないので、名前をここで引く。
 */
async function scopeOf(account: AccountRow): Promise<PortalGuideScope> {
  const now = new Date();
  const live = account.grants.filter((g) =>
    isLivePortalGrant(now, { ...g, bpIds: [] }),
  );

  const formCodes = live
    .filter((g) => g.kind === "FORM" && g.resourceId)
    .map((g) => g.resourceId as string);
  const titles = formCodes.length
    ? await prisma.form
        .findMany({
          where: { code: { in: formCodes } },
          select: { code: true, title: true },
        })
        .catch(() => [])
    : [];
  const titleByCode = new Map(titles.map((f) => [f.code, f.title]));

  return summarizePortalGuideScope(
    live.map((g) => ({
      kind: g.kind,
      includeBranches: g.includeBranches,
      includeAsEndUser: g.includeAsEndUser,
      // 名前を引けなかったフォーム（消された等）は行ごと落ちる（空の名前は
      // summarize が数えない）。無い名前を「フォーム」と書いても案内にならない。
      formTitle: g.resourceId ? titleByCode.get(g.resourceId) : null,
    })),
  );
}

async function pageOf(account: AccountRow): Promise<PortalGuidePage> {
  const base = appBaseUrl();
  const [scope, rep] = await Promise.all([
    scopeOf(account),
    salesRepFor(account.bpId),
  ]);
  return {
    accountId: account.id,
    partnerName: localized(account.bp.name as LocalizedTextInput),
    contactName: account.displayName,
    email: account.email,
    loginUrl: portalLoginUrl(base),
    qrUrl: portalLoginUrl(base, account.email),
    scope,
    salesRepName: rep?.name ?? null,
    salesRepEmail: rep?.email ?? null,
  };
}

/** ご担当者 1 名ぶん。 */
export async function fetchPortalGuideForAccount(
  accountId: string,
): Promise<Result> {
  const account = (await prisma.portalAccount.findUnique({
    where: { id: accountId },
    select: ACCOUNT_SELECT,
  })) as AccountRow | null;
  if (!account) return { ok: false, error: "NOT_FOUND" };
  if (!account.isActive) return { ok: false, error: "INACTIVE" };

  return {
    ok: true,
    document: {
      partnerName: localized(account.bp.name as LocalizedTextInput),
      locale: documentLocaleOf(account.bp),
      pages: [await pageOf(account)],
    },
  };
}

/**
 * 取引先 1 社ぶん（有効なアカウント全員）。
 *
 * 無効なアカウントは**黙って外す**（1 名ぶんの発行と違い、ここは「刷れる人を
 * 刷る」場面なので、1 人が未有効化なだけで全体を止めない）。全員が無効なら
 * NO_ACCOUNTS。
 */
export async function fetchPortalGuideForBp(bpId: string): Promise<Result> {
  const bp = await prisma.businessPartner.findUnique({
    where: { id: bpId },
    select: {
      name: true,
      documentLocale: true,
      parent: { select: { documentLocale: true } },
    },
  });
  if (!bp) return { ok: false, error: "NOT_FOUND" };

  const accounts = (await prisma.portalAccount.findMany({
    where: { bpId, isActive: true },
    select: ACCOUNT_SELECT,
    orderBy: [{ displayName: "asc" }],
  })) as AccountRow[];
  if (accounts.length === 0) return { ok: false, error: "NO_ACCOUNTS" };

  return {
    ok: true,
    document: {
      partnerName: localized(bp.name as LocalizedTextInput),
      locale: documentLocaleOf(bp),
      pages: await Promise.all(accounts.map(pageOf)),
    },
  };
}
