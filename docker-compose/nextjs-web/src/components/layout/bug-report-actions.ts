"use server";

/**
 * Server Actions — バグ報告（ヘッダーのバグ報告ボタン）。
 *
 * 報告 = audit_logs（tableName "system"、recordId "bug-report:<uuid>"）への
 * 1 行。afterData.note が操作履歴（SY07 /settings/activity）の「変更内容」に
 * 表示され、afterData.bugReport に診断情報（ページ・環境・コンソールログ）を
 * 丸ごと保持する。専用テーブルは持たない（共有機能と同じ設計）。
 * 併せて system:ADMIN 保持者へ SYSTEM 通知を送る（ベル / プッシュ / メール）。
 */

import { auth } from "@/auth";
import type { BugReportDiagnostics, CapturedLog } from "@/lib/bug-report";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

export interface BugReportSubmitInput {
  /** 障害の説明（必須） */
  description: string;
  diagnostics: BugReportDiagnostics;
  /** コンソールログ（ユーザーが添付を外した場合は空配列） */
  logs: CapturedLog[];
}

const DESCRIPTION_MAX = 4000;
const LOGS_MAX = 200;
const LOG_MESSAGE_MAX = 1000;
const FIELD_MAX = 600;

function clip(value: unknown, max: number): string {
  const s = typeof value === "string" ? value : String(value ?? "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export async function submitBugReportAction(
  input: BugReportSubmitInput,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  const su = session?.user as { id?: string; name?: string | null } | undefined;
  if (!su?.id) return actionError("ログインが必要です");

  const description = input.description?.trim() ?? "";
  if (!description) return actionError("問題の内容を入力してください");
  if (description.length > DESCRIPTION_MAX) {
    return actionError(`説明は ${DESCRIPTION_MAX} 文字以内で入力してください`);
  }

  const d = input.diagnostics ?? ({} as BugReportDiagnostics);
  const diagnostics = {
    url: clip(d.url, FIELD_MAX),
    title: clip(d.title, FIELD_MAX),
    referrer: clip(d.referrer, FIELD_MAX),
    userAgent: clip(d.userAgent, FIELD_MAX),
    language: clip(d.language, 40),
    timezone: clip(d.timezone, 60),
    viewport: clip(d.viewport, 20),
    screen: clip(d.screen, 20),
    devicePixelRatio: Number(d.devicePixelRatio) || 0,
    online: Boolean(d.online),
    appVersion: clip(d.appVersion, 40),
  };
  const logs = (Array.isArray(input.logs) ? input.logs : [])
    .slice(-LOGS_MAX)
    .map((l) => ({
      level: clip(l.level, 24),
      at: clip(l.at, 32),
      message: clip(l.message, LOG_MESSAGE_MAX),
    }));

  const id = crypto.randomUUID();
  const excerpt = clip(description.replace(/\s+/g, " "), 120);

  try {
    await prisma.auditLog.create({
      data: {
        userId: su.id,
        action: "CREATE",
        tableName: "system",
        recordId: `bug-report:${id}`,
        afterData: {
          note: `バグ報告: ${excerpt}`,
          bugReport: { description, diagnostics, logs },
        },
      },
    });
  } catch (e) {
    console.error("submitBugReportAction: audit write failed", e);
    return actionError(
      "報告の保存に失敗しました。時間をおいて再試行してください",
    );
  }

  // system:ADMIN 保持者へ通知（失敗しても報告自体は成立）
  try {
    const admins = await prisma.$queryRaw<{ user_id: string }[]>`
      SELECT DISTINCT user_id FROM app.user_permissions
      WHERE permission_code = 'system' AND action::text = 'ADMIN'`;
    const recipients = admins.map((a) => a.user_id).filter((u) => u !== su.id);
    if (recipients.length > 0) {
      await notify({
        userIds: recipients,
        type: "SYSTEM",
        title: `${su.name ?? "ユーザー"} さんからバグ報告`,
        message: excerpt,
        linkPath: "/settings/activity",
      });
    }
  } catch (e) {
    console.error("submitBugReportAction: notify failed", e);
  }

  return actionOk({ id });
}
