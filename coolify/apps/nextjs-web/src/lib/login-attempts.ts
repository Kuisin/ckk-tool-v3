/**
 * login-attempts.ts — Web の認証イベントを app.login_attempts へ残す + 読み出し。
 *
 * これまで Web のログイン失敗はインメモリのレート制限と console 出力だけで、
 * どこにも残っていなかった。IP も UA も端末も分からないので、事故の後で
 * 「誰がどこから何回試したか」を答えられなかった。
 *
 * ■ 成功を書くのは events.signIn だけ
 * authorize() は失敗だけを書く。両方で書くと成功が二重に記録される。
 *
 * ■ 生の秘密を残さない
 * 実在ユーザーに解決できたときだけ identifier に生値を入れる（未知の文字列は
 * パスワードの打ち間違いが混ざりうる）。DB 側にも CHECK 制約がある。
 *
 * ■ 認証フローを止めない
 * 記録は常に best-effort。例外は握り潰す。
 */

import "server-only";
import { createHmac } from "node:crypto";
import { parseCidr } from "@/lib/cidr-core";
import { prisma } from "@/lib/db";
import type { DeviceOwnership } from "@/lib/device-ownership-core";
import type { DeviceContext } from "@/lib/device-signals";
import { EMPTY_DEVICE_CONTEXT } from "@/lib/device-signals";
import { deviceName } from "@/lib/format";
import type { Tr } from "@/lib/i18n";
import type { LoginFailureReason, LoginMethod } from "@/lib/login-attempt-core";
import type { Prisma } from "../../generated/client/client";

/** 相関キーの pepper。**キオスクと同値**でないとアプリ間で相関しない。 */
function pepper(): string | null {
  return process.env.LOGIN_ATTEMPT_PEPPER || null;
}

/** 生値を残さずに「同じ入力か」を数えるための相関キー。 */
export function correlationRef(
  value: string | null | undefined,
): string | null {
  const secret = pepper();
  if (!secret) return null;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return createHmac("sha256", secret).update(normalized, "utf8").digest("hex");
}

export interface LoginAttemptInput {
  outcome: "SUCCESS" | "FAILURE";
  method: LoginMethod;
  reason?: LoginFailureReason | null;
  /** 入力されたユーザー名（解決できた場合だけ生値が保存される） */
  identifier?: string | null;
  /** 実在ユーザーに解決できた場合の id */
  userId?: string | null;
  /**
   * 取引先ポータル（社外向け）のアカウント。**userId とは排他** —
   * ポータルの主体は app.users ではない。
   *
   * ここが入っていても `identifier` には生値を入れない（顧客のメールアドレスを
   * 平文で残さないため）。相関は identifier_ref（HMAC）が担う。
   */
  portalAccountId?: string | null;
  device?: DeviceContext | null;
  /** 成功時に紐づける端末台帳の行 */
  userDeviceId?: string | null;
}

/** 認証イベントを 1 行書く。失敗しても呼び出し側に伝播させない。 */
export async function recordLoginAttempt(
  input: LoginAttemptInput,
): Promise<void> {
  const device = input.device ?? EMPTY_DEVICE_CONTEXT;
  try {
    await prisma.loginAttempt.create({
      data: {
        app: "WEB",
        outcome: input.outcome,
        method: input.method,
        reason: input.reason ?? null,
        // 解決できたときだけ生値（DB の CHECK 制約と同じ条件）。
        // **ポータルでは常に null** — 社外の個人のアドレスを平文で残さない。
        identifier:
          input.userId && !input.portalAccountId
            ? (input.identifier ?? null)
            : null,
        identifierRef: correlationRef(input.identifier),
        userId: input.userId ?? null,
        portalAccountId: input.portalAccountId ?? null,
        userDeviceId: input.userDeviceId ?? null,
        ipAddress: device.ip,
        ipChain: device.ipChain,
        userAgent: device.userAgent,
        signalsFingerprint: device.fingerprint,
        signalsVersion: device.version,
        signals: (device.signals ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        ownership: device.ownership,
        ownershipSource: device.ownershipSource,
      },
    });
  } catch {
    // 記録に失敗してもログインは通す（監視の副作用で業務を止めない）
  }
}

/**
 * 成功したログインで端末台帳（app.user_devices）を更新し、行 id を返す。
 * **失敗では呼ばない** — 失敗で台帳を作ると、攻撃者の端末が「登録済み端末」
 * として並んでしまう。
 */
export async function upsertUserDevice(
  userId: string,
  device: DeviceContext,
): Promise<string | null> {
  if (!device.fingerprint || device.version === null) return null;
  try {
    const row = await prisma.userDevice.upsert({
      where: {
        userId_fingerprint: { userId, fingerprint: device.fingerprint },
      },
      create: {
        userId,
        fingerprint: device.fingerprint,
        version: device.version,
        label: device.label,
        ownership: device.ownership,
        ownershipSource: device.ownershipSource,
        signals: (device.signals ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        userAgent: device.userAgent,
        lastIpAddress: device.ip,
        loginCount: 1,
      },
      update: {
        label: device.label,
        ownership: device.ownership,
        ownershipSource: device.ownershipSource,
        signals: (device.signals ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        userAgent: device.userAgent,
        lastIpAddress: device.ip,
        loginCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    return null;
  }
}

// ── 読み出し（SY0D ログイン履歴 / SY01 ユーザー詳細） ────────────────────────

export const LOGIN_ATTEMPT_PAGE_SIZE = 50;

export interface LoginAttemptRow {
  /** BigInt はクライアントへ渡せないので文字列で持つ。 */
  id: string;
  createdAt: string;
  app: "WEB" | "KIOSK";
  outcome: "SUCCESS" | "FAILURE";
  method: string;
  reason: string | null;
  userId: string | null;
  userName: string | null;
  /** 解決できなかった入力は生値を持たない（相関キーの先頭だけ出す） */
  identifier: string | null;
  identifierRef: string | null;
  scanKind: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  ownership: DeviceOwnership;
  ownershipSource: string | null;
  kioskDeviceId: string | null;
  kioskDeviceName: string | null;
  userDeviceLabel: string | null;
  /**
   * 取引先ポータル（社外向け）の行か。
   * app は WEB のまま（同じアプリが配信しているので嘘をつかない）なので、
   * 画面が「どの面のログインか」を出すにはこれを見る。
   */
  isPortal: boolean;
  /** ポータルの主体（社外の担当者名）。アドレスは出さない。 */
  portalAccountName: string | null;
}

export interface LoginAttemptFilter {
  /** 何日ぶんを見るか（既定 7 日）。 */
  days?: number;
  outcome?: "SUCCESS" | "FAILURE" | null;
  /**
   * どの面のログインか。**app 列そのものではない** — 取引先ポータルは
   * nextjs-web が配信しているので app は WEB で、method の PORTAL_ 接頭辞で
   * 見分ける。画面の「アプリ」絞り込みはこの 3 択。
   */
  surface?: "WEB" | "KIOSK" | "PORTAL" | null;
  /** @deprecated surface を使う（app 列の直接指定）。 */
  app?: "WEB" | "KIOSK" | null;
  userId?: string | null;
  /** IP そのもの、または CIDR（例 192.168.50.0/24）。 */
  ip?: string | null;
  fingerprint?: string | null;
  ownership?: DeviceOwnership | null;
  reason?: string | null;
  kioskDeviceId?: string | null;
  cursor?: string | null;
  take?: number;
}

const attemptInclude = {
  user: { select: { id: true, displayName: true, username: true } },
  kioskDevice: { select: { id: true, name: true } },
  userDevice: { select: { label: true } },
  // 表示名だけ。**メールアドレスは引かない**（社外の個人データ。SY0D には出さない）。
  portalAccount: { select: { displayName: true } },
} as const;

type AttemptRow = Prisma.LoginAttemptGetPayload<{
  include: typeof attemptInclude;
}>;

function toRow(r: AttemptRow): LoginAttemptRow {
  return {
    id: r.id.toString(),
    createdAt: r.createdAt.toISOString(),
    app: r.app,
    outcome: r.outcome,
    method: r.method,
    reason: r.reason,
    userId: r.userId,
    userName: r.user?.displayName ?? null,
    identifier: r.identifier,
    identifierRef: r.identifierRef,
    scanKind: r.scanKind,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    fingerprint: r.signalsFingerprint,
    ownership: r.ownership,
    ownershipSource: r.ownershipSource,
    kioskDeviceId: r.kioskDeviceId,
    kioskDeviceName: r.kioskDevice ? deviceName(r.kioskDevice.name) : null,
    userDeviceLabel: r.userDevice?.label ?? null,
    isPortal: r.method.startsWith("PORTAL_"),
    portalAccountName: r.portalAccount?.displayName ?? null,
  };
}

/**
 * 認証イベントの一覧。id 降順のカーソルページング。
 *
 * IP は CIDR でも絞れる（`192.168.50.0/24`）。inet の `<<=` に落とすので
 * アプリ側で全件走査しない。**保存側が正規形で書いている**前提
 * （`::ffff:` 付きのままだと `<<=` が効かない — lib/cidr-core normalizeIp）。
 */
export async function listLoginAttempts(
  filter: LoginAttemptFilter = {},
): Promise<{ rows: LoginAttemptRow[]; nextCursor: string | null }> {
  const take = filter.take ?? LOGIN_ATTEMPT_PAGE_SIZE;
  const days = filter.days ?? 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const ipFilter = filter.ip?.trim() || null;
  const ipIds =
    ipFilter && parseCidr(ipFilter)
      ? await prisma.$queryRaw<{ id: bigint }[]>`
          SELECT id FROM app.login_attempts
           WHERE ip_address <<= ${ipFilter}::inet
             AND created_at >= ${since}
           ORDER BY id DESC
           LIMIT 5000`
      : null;

  const rows = await prisma.loginAttempt.findMany({
    where: {
      createdAt: { gte: since },
      ...(filter.outcome ? { outcome: filter.outcome } : {}),
      ...(filter.app ? { app: filter.app } : {}),
      ...(filter.surface === "PORTAL"
        ? { method: { startsWith: "PORTAL_" } }
        : filter.surface === "KIOSK"
          ? { app: "KIOSK" as const }
          : filter.surface === "WEB"
            ? {
                app: "WEB" as const,
                NOT: { method: { startsWith: "PORTAL_" } },
              }
            : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.fingerprint ? { signalsFingerprint: filter.fingerprint } : {}),
      ...(filter.ownership ? { ownership: filter.ownership } : {}),
      ...(filter.reason ? { reason: filter.reason } : {}),
      ...(filter.kioskDeviceId ? { kioskDeviceId: filter.kioskDeviceId } : {}),
      ...(ipIds ? { id: { in: ipIds.map((r) => r.id) } } : {}),
      ...(filter.cursor ? { id: { lt: BigInt(filter.cursor) } } : {}),
    },
    orderBy: { id: "desc" },
    take: take + 1,
    include: attemptInclude,
  });
  const page = rows.slice(0, take);
  return {
    rows: page.map(toRow),
    nextCursor:
      rows.length > take
        ? (page[page.length - 1]?.id.toString() ?? null)
        : null,
  };
}

export interface LoginAttemptDetail extends LoginAttemptRow {
  ipChain: string | null;
  signals: unknown;
  signalsVersion: number | null;
  cardId: string | null;
  cardRef: string | null;
  userUsername: string | null;
}

/** 1 件の詳細（ドロワー用）。signals をそのまま返す。 */
export async function getLoginAttempt(
  id: string,
): Promise<LoginAttemptDetail | null> {
  if (!/^[0-9]+$/.test(id)) return null;
  const r = await prisma.loginAttempt.findUnique({
    where: { id: BigInt(id) },
    include: attemptInclude,
  });
  if (!r) return null;
  return {
    ...toRow(r),
    ipChain: r.ipChain,
    signals: r.signals,
    signalsVersion: r.signalsVersion,
    cardId: r.cardId,
    cardRef: r.cardRef,
    userUsername: r.user?.username ?? null,
  };
}

export interface UserDeviceRow {
  id: string;
  label: string | null;
  fingerprint: string;
  ownership: DeviceOwnership;
  ownershipSource: string | null;
  userAgent: string | null;
  lastIpAddress: string | null;
  loginCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** ユーザーの登録端末（SY01 詳細のタブ）。 */
export async function listUserDevices(
  userId: string,
): Promise<UserDeviceRow[]> {
  const rows = await prisma.userDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });
  return rows.map((d) => ({
    id: d.id,
    label: d.label,
    fingerprint: d.fingerprint,
    ownership: d.ownership,
    ownershipSource: d.ownershipSource,
    userAgent: d.userAgent,
    lastIpAddress: d.lastIpAddress,
    loginCount: d.loginCount,
    firstSeenAt: d.firstSeenAt.toISOString(),
    lastSeenAt: d.lastSeenAt.toISOString(),
  }));
}

export interface LoginAttemptSummary {
  failures24h: number;
  successes24h: number;
  topFailureIps: { ip: string; n: number }[];
  topFailureUsers: { label: string; n: number }[];
}

/**
 * 画面上部のサマリ（直近 24h）。「いま荒れているか」を一目で見るためのもの。
 * 失敗の多い相手は生値ではなく相関キーで数えるので、未知のユーザー名でも
 * 値を残さずに「同じ相手が繰り返している」ことが分かる。
 */
export async function getLoginAttemptSummary(
  tr: Tr,
): Promise<LoginAttemptSummary> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const [failures24h, successes24h, byIp, byUser] = await Promise.all([
    prisma.loginAttempt.count({
      where: { createdAt: { gte: since }, outcome: "FAILURE" },
    }),
    prisma.loginAttempt.count({
      where: { createdAt: { gte: since }, outcome: "SUCCESS" },
    }),
    prisma.$queryRaw<{ ip: string | null; n: bigint }[]>`
      SELECT host(ip_address) AS ip, COUNT(*) AS n
        FROM app.login_attempts
       WHERE created_at >= ${since}
         AND outcome = 'FAILURE'
         AND ip_address IS NOT NULL
       GROUP BY ip_address
       ORDER BY n DESC
       LIMIT 5`,
    prisma.$queryRaw<{ name: string | null; ref: string | null; n: bigint }[]>`
      SELECT u.display_name AS name, left(a.identifier_ref, 8) AS ref,
             COUNT(*) AS n
        FROM app.login_attempts a
        LEFT JOIN app.users u ON u.id = a.user_id
       WHERE a.created_at >= ${since}
         AND a.outcome = 'FAILURE'
         AND (a.user_id IS NOT NULL OR a.identifier_ref IS NOT NULL)
       GROUP BY 1, 2
       ORDER BY n DESC
       LIMIT 5`,
  ]);
  return {
    failures24h,
    successes24h,
    topFailureIps: byIp
      .filter((r): r is { ip: string; n: bigint } => r.ip !== null)
      .map((r) => ({ ip: r.ip, n: Number(r.n) })),
    topFailureUsers: byUser
      .filter((r) => r.name !== null || r.ref !== null)
      .map((r) => ({
        label:
          r.name ??
          tr("settings.loginHistoryView.unresolvedWithRef", {
            ref: r.ref ?? "",
          }),
        n: Number(r.n),
      })),
  };
}
