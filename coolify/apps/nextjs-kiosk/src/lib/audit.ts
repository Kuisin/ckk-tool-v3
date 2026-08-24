/**
 * audit.ts — 業務操作履歴（app.audit_logs）の書き込み。server-only.
 *
 * nextjs-web の同名モジュールと **同じエクスポート形** を提供する
 * （`inventory.ts` は逐語コピーの twin file なので、この形が崩れると
 * コンパイルが通らない — 形を変えないこと）。違いは actor の解決方法だけ:
 *
 * - nextjs-web: Auth.js のセッションから解決
 * - キオスク  : リクエストごとに `runWithActor()` で明示的に束ねる
 *
 * キオスクのセッションは Cookie + DB 参照なので、`applyTransaction` のように
 * 1 リクエスト内で何度も actor を要求する経路でセッションを引き直すのは無駄。
 * AsyncLocalStorage に 1 度だけ積んで、トランザクション内からも読めるようにする。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "./db";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "SEED"
  | "MIGRATE"
  | "VIEW";

/**
 * システムユーザー（固定 UUID）。actor 未束縛の経路の actor。
 * nextjs-web と同じ値（migration 20260706040000_add_system_user）。
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export interface RecordAuditInput {
  action: AuditAction;
  /** DB テーブル名（@@map 値）。例: "work_orders" */
  tableName: string;
  /** 業務識別子（文書番号・id） */
  recordId: string;
  before?: unknown;
  after?: unknown;
}

interface ActorContext {
  actorId: string;
  /** 操作元のキオスク端末（audit_logs.kiosk_device_id に残す）。 */
  deviceId: string | null;
}

const actorStore = new AsyncLocalStorage<ActorContext>();

/**
 * この非同期コンテキスト内の操作 actor（と操作元端末）を束ねる。
 * ルートハンドラで `runWithActor(session.userId, () => …, session.deviceId)`
 * と包むこと。端末を渡すと監査ログに「どの端末で」が残る。
 */
export function runWithActor<T>(
  actorId: string,
  fn: () => Promise<T>,
  deviceId: string | null = null,
) {
  return actorStore.run({ actorId, deviceId }, fn);
}

/** 現在の操作ユーザー ID（未束縛はシステムユーザー）。 */
export async function getCurrentActorId(): Promise<string | null> {
  return actorStore.getStore()?.actorId ?? SYSTEM_USER_ID;
}

/** 現在の操作元キオスク端末 ID（未束縛・Web 経由は null）。 */
export function getCurrentDeviceId(): string | null {
  return actorStore.getStore()?.deviceId ?? null;
}

/** unknown を Prisma Json 相当（プレーン値）へ。best-effort。 */
function toJson(value: unknown): object | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

/**
 * 監査ログを 1 件記録する。best-effort — 失敗しても例外は投げない
 * （業務 mutation を監査ログの失敗で巻き戻さない）。
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const userId = await getCurrentActorId();
    await prisma.auditLog.create({
      data: {
        userId,
        action: input.action,
        tableName: input.tableName,
        recordId: input.recordId,
        beforeData: toJson(input.before),
        afterData: toJson(input.after),
        // 共有タブレットからの操作は端末も残す（Web からの操作は null）。
        kioskDeviceId: getCurrentDeviceId(),
      },
    });
  } catch (e) {
    console.error("recordAudit failed", e);
  }
}
