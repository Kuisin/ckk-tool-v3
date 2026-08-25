/**
 * kiosk-login-log.ts — キオスクの認証イベントを app.login_attempts へ残す。
 *
 * これまで失敗は 1 行も残っていなかった（PIN 誤りで kiosk_cards のカウンタが
 * 進むだけ。未知カード・停止カード・期限切れチケット・アテステーション失敗は
 * 完全に無記録）。ロックが明けた後、管理者が何が起きたかを見る手段が無かった。
 *
 * ■ 書き込み量の上限（設計上必須）
 * /api/qr/access は端末 Cookie さえ持っていれば誰でも叩ける。ここに素直に
 * INSERT を置くと **無認証の DB 書き込みプリミティブ**になる。端末ごと 1 分
 * あたりの行数に上限を設け、超えた分は捨てる（tickets.ts / settings-gate.ts と
 * 同じ globalThis のメモリカウンタ。プロセス再起動で忘れてよい種類の状態）。
 *
 * ■ 認証フローを絶対に止めない
 * 記録は常に best-effort。失敗しても握り潰す（ログイン可否に影響させない）。
 *
 * ■ 生の秘密を残さない
 * スキャン値・PIN・パスワードは保存しない。実在したカードだけ FK で参照し、
 * それ以外は HMAC の相関キー（login-refs.ts）と種別（scanKind）だけ。
 */

import "server-only";
import { NextResponse } from "next/server";
import { parseCidrList } from "@/lib/cidr-core";
import { prisma } from "@/lib/db";
import { classifyDeviceOwnership } from "@/lib/device-ownership-core";
import {
  deviceFailureReason,
  kioskFailureReason,
  type LoginMethod,
  type ScanKind,
  scanKindOf,
} from "@/lib/login-attempt-core";
import { correlationRef } from "@/lib/login-refs";
import { clientIpOf, forwardedChainOf, userAgentOf } from "@/lib/request-ip";

/** 端末ごと 1 分あたりの最大書き込み行数。 */
const MAX_ROWS_PER_MINUTE = 60;

interface WriteCounter {
  minute: number;
  count: number;
}

// 開発時の HMR でカウンタが飛ばないよう globalThis に置く（tickets.ts と同じ）
const globalCounters = globalThis as unknown as {
  __kioskLoginLogCounters?: Map<string, WriteCounter>;
};
if (!globalCounters.__kioskLoginLogCounters) {
  globalCounters.__kioskLoginLogCounters = new Map<string, WriteCounter>();
}
const counters = globalCounters.__kioskLoginLogCounters;

/** 上限内なら true。超えていたら false（= その行は書かない）。 */
function allowWrite(key: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  const current = counters.get(key);
  if (!current || current.minute !== minute) {
    counters.set(key, { minute, count: 1 });
    // 古い端末のエントリを適当に間引く（無制限に増やさない）
    if (counters.size > 500) {
      for (const [k, v] of counters) {
        if (v.minute < minute) counters.delete(k);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= MAX_ROWS_PER_MINUTE;
}

export interface KioskAttemptContext {
  ip: string | null;
  ipChain: string | null;
  userAgent: string | null;
  kioskDeviceId: string | null;
  /** アテステーションを通過している端末か（所有区分の判定材料） */
  attested: boolean;
}

/** リクエストから記録用の文脈を作る。 */
export function attemptContext(
  req: Request,
  device: { id: string; attested?: boolean } | null,
): KioskAttemptContext {
  return {
    ip: clientIpOf(req),
    ipChain: forwardedChainOf(req),
    userAgent: userAgentOf(req),
    kioskDeviceId: device?.id ?? null,
    attested: device?.attested === true,
  };
}

export interface KioskAttemptDetail {
  method: LoginMethod;
  /** 実在したカードの id（DB の PK）。未知・偽造カードでは渡さない */
  cardId?: string | null;
  /** スキャンされた生値。**保存されない** — 相関キーと種別だけを作るのに使う */
  scanned?: string | null;
  scanKind?: ScanKind | null;
  userId?: string | null;
}

function ownershipOf(ctx: KioskAttemptContext) {
  return classifyDeviceOwnership({
    wrapper: null,
    kioskDeviceLinked: ctx.kioskDeviceId !== null,
    attested: ctx.attested,
    ip: ctx.ip,
    corporateCidrs: parseCidrList(process.env.CORPORATE_CIDRS),
  });
}

async function record(
  ctx: KioskAttemptContext,
  outcome: "SUCCESS" | "FAILURE",
  reason: string | null,
  detail: KioskAttemptDetail,
): Promise<void> {
  if (!allowWrite(ctx.kioskDeviceId ?? ctx.ip ?? "anonymous")) return;
  const verdict = ownershipOf(ctx);
  const scanKind =
    detail.scanKind ??
    (detail.scanned !== undefined && detail.scanned !== null
      ? scanKindOf(detail.scanned)
      : null);

  await prisma.loginAttempt
    .create({
      data: {
        app: "KIOSK",
        outcome,
        method: detail.method,
        reason,
        userId: detail.userId ?? null,
        cardId: detail.cardId ?? null,
        cardRef: correlationRef(detail.scanned ?? detail.cardId ?? null),
        scanKind,
        kioskDeviceId: ctx.kioskDeviceId,
        ipAddress: ctx.ip,
        ipChain: ctx.ipChain,
        userAgent: ctx.userAgent,
        ownership: verdict.ownership,
        ownershipSource: verdict.source,
      },
    })
    .catch(() => undefined);
}

/**
 * 失敗レスポンスの生成と記録を 1 行にまとめる。呼び出し側の分岐が
 * 20 箇所あるので、`return deny(...)` の形に揃えて書き漏らしを防ぐ。
 */
export function deny(
  ctx: KioskAttemptContext,
  state: string,
  status: number,
  detail: KioskAttemptDetail,
  extra?: Record<string, unknown>,
): NextResponse {
  void record(ctx, "FAILURE", kioskFailureReason(state), detail);
  return NextResponse.json({ state, ...extra }, { status });
}

/** 端末そのものが無効なとき（getDevice() の失敗）。 */
export function denyDevice(
  ctx: KioskAttemptContext,
  deviceReason: string,
  method: LoginMethod,
): NextResponse {
  void record(ctx, "FAILURE", deviceFailureReason(deviceReason), { method });
  return NextResponse.json(
    { state: "DEVICE_INVALID", reason: deviceReason },
    { status: 403 },
  );
}

/** 成功を記録する（レスポンスは呼び出し側が返す）。 */
export function recordKioskSuccess(
  ctx: KioskAttemptContext,
  detail: KioskAttemptDetail,
): void {
  void record(ctx, "SUCCESS", null, detail);
}

/** 任意の失敗を記録する（レスポンスの形が deny と違う場合用）。 */
export function recordKioskFailure(
  ctx: KioskAttemptContext,
  reason: string,
  detail: KioskAttemptDetail,
): void {
  void record(ctx, "FAILURE", reason, detail);
}
