"use server";

/**
 * Server Actions — アプリ ON/OFF（feature_flags, /admin/apps）。
 *
 * key = `app:<appKey>:<env>`。無効化 = is_enabled=false の行を upsert、
 * 有効化 = is_enabled=true に更新（行が無ければ何もしない＝デフォルト有効）。
 * 反映はダッシュボード layout の再描画（revalidatePath）で全画面に効く。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APP_ENVS, type AppEnv, appFlagKey } from "@/lib/app-flags";
import { appList } from "@/lib/app-list";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const input = z.object({
  appKey: z.string().min(1),
  env: z.enum(["dev", "main"]),
  enabled: z.boolean(),
});

export async function setAppEnabled(raw: {
  appKey: string;
  env: AppEnv;
  enabled: boolean;
}): Promise<ActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return actionError("入力が不正です");
  const { appKey, env, enabled } = parsed.data;

  const app = appList.find((a) => a.key === appKey);
  if (!app) return actionError("対象のアプリが見つかりません");
  if (!APP_ENVS.includes(env)) return actionError("環境の指定が不正です");

  const key = appFlagKey(appKey, env);
  try {
    const updatedBy = await getCurrentActorId();
    const prior = await prisma.featureFlag.findUnique({ where: { key } });
    await prisma.featureFlag.upsert({
      where: { key },
      create: {
        key,
        isEnabled: enabled,
        description: `${app.label}（${app.operationCode}）の ${env} 表示`,
        updatedBy,
      },
      update: { isEnabled: enabled, updatedBy },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "feature_flags",
      recordId: key,
      before: prior ? { isEnabled: prior.isEnabled } : undefined,
      after: { isEnabled: enabled, app: app.label, env },
    });
    // layout が読む無効リストを全画面で更新する。
    revalidatePath("/", "layout");
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "フラグの更新に失敗しました"));
  }
}
