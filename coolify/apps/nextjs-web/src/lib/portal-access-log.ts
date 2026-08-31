/**
 * portal-access-log.ts — 社外からの閲覧記録。server-only.
 *
 * ■ audit_logs には書かない
 * audit_logs.user_id は app.users への FK で、素朴に recordAudit を呼ぶと
 * getCurrentActorId() が system にフォールバックして**監査行が嘘をつく**
 * （社外の主体を正直に表現できない）。専用の表に分ける。
 *
 * ■ 社内の読み取りと違って全閲覧を残す
 * SY07 の原則は「書類ごとの閲覧はゲートしない・横断検索だけゲートする」だが、
 * 社外アクセスでは「誰が何を見たか」こそが問い。保持期間は 400 日
 * （portal-cron.sql。login_attempts の失敗側と同じ）。
 */

import "server-only";

import { prisma } from "./db";
import type { PortalResourceType } from "./portal-access-core";
import type { PortalSession } from "./portal-auth";

export type PortalAccessAction = "VIEW" | "DOWNLOAD";

/** 1 件残す。**失敗しても呼び出し側に伝播させない**（閲覧を止めない）。 */
export async function recordPortalAccess(input: {
  session: PortalSession;
  resourceType: PortalResourceType;
  resourceId: string;
  action: PortalAccessAction;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await prisma.portalAccessLog.create({
      data: {
        portalAccountId: input.session.accountId,
        linkId: input.session.linkId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        action: input.action,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    });
  } catch {
    // 記録の失敗で画面を落とさない（login_attempts と同じ割り切り）。
  }
}
