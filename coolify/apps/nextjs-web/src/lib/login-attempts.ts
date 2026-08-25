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
import { prisma } from "@/lib/db";
import type { DeviceContext } from "@/lib/device-signals";
import { EMPTY_DEVICE_CONTEXT } from "@/lib/device-signals";
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
        // 解決できたときだけ生値（DB の CHECK 制約と同じ条件）
        identifier: input.userId ? (input.identifier ?? null) : null,
        identifierRef: correlationRef(input.identifier),
        userId: input.userId ?? null,
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
