"use server";

/**
 * Server Actions — AI プロバイダ設定（SY0E）。
 *
 * 保存は `ai_provider.*` の upsert。**API トークンだけは監査ログに残さない** —
 * `recordAudit` は before/after をそのまま JSON に書くので、素通しすると
 * 追記専用で広く読まれる台帳にトークンが複製される。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  AiProviderConfigError,
  aiConfigHeadersFor,
  getAiProviderSettings,
  saveAiProviderSettings,
} from "@/lib/ai-provider";
import {
  AI_PROVIDER_PRESETS,
  type AiProviderSettings,
  aiProviderSettingsSchema,
  redactAiSettings,
} from "@/lib/ai-provider-core";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { PO_EXTRACT_URL } from "@/lib/po-extract";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

const BASE_PATH = "/settings/ai-provider";

const payloadSchema = z.object({
  settings: aiProviderSettingsSchema,
  /** 未入力なら既存のトークンを維持する（設定を直すたびに入れ直させない）。 */
  token: z.string().default(""),
  clearToken: z.boolean().default(false),
});

export type AiProviderPayload = z.input<typeof payloadSchema>;

/** プロバイダごとに「これが無いと動かない」入力を確かめる。 */
async function missingRequirement(
  settings: AiProviderSettings,
  incomingToken: string,
  clearToken: boolean,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string | null> {
  const preset = AI_PROVIDER_PRESETS[settings.provider];
  if (!preset.tokenRequired) return null;
  if (!settings.structModel && !settings.visionModel) {
    return tr("settings.aiProviderActions.enterModelName");
  }
  if (clearToken) {
    return tr("settings.aiProviderActions.tokenRequiredForProvider");
  }
  if (incomingToken) return null;
  const current = await getAiProviderSettings();
  // 「読めない」を「設定済み」と数えない — 保存できたのに動かない状態になる。
  if (current.tokenStatus === "set" || current.tokenStatus === "rotate-pending")
    return null;
  return tr("settings.aiProviderActions.enterApiToken");
}

export async function updateAiProviderSettings(
  payload: AiProviderPayload,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const { settings, token, clearToken } = parsed.data;

  const missing = await missingRequirement(settings, token, clearToken, tr);
  if (missing) return actionError(missing);

  try {
    const before = await getAiProviderSettings();
    const saved = await saveAiProviderSettings(
      settings,
      clearToken
        ? { action: "clear" }
        : token
          ? { action: "set", value: token }
          : { action: "keep" },
    );
    if (!saved.ok) return actionError(saved.error);

    const after = await getAiProviderSettings();
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "ai_provider",
      before: redactAiSettings(before, {
        status: before.tokenStatus,
        last4: before.tokenLast4,
      }),
      after: redactAiSettings(after, {
        status: after.tokenStatus,
        last4: after.tokenLast4,
      }),
    });

    revalidatePath(BASE_PATH);
    revalidatePath("/settings");
    return actionOk();
  } catch (e) {
    console.error(tr("settings.aiProviderActions.saveFailedLog"), e);
    return actionError(tr("settings.aiProviderActions.saveFailed"));
  }
}

export interface ProbeStage {
  ok: boolean;
  ms: number;
  model: string;
  error?: string;
}

export interface ProbeResult {
  provider: string;
  struct: ProbeStage;
  vision: ProbeStage;
}

/**
 * 接続テスト。**po-extract から**叩く（アプリからではない）。
 *
 * 実際に外へ出るのは po-extract のコンテナなので、nextjs-web からプロバイダへ
 * 届いても意味がない — 「テストは通るのに抽出は失敗する」が起こり得る。
 * 保存前の入力値でも試せるようにしてあるので、確かめてから保存できる。
 */
export async function testAiProviderConnection(
  payload: AiProviderPayload,
): Promise<ActionResult<ProbeResult>> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const { settings, token } = parsed.data;

  let headers: Record<string, string>;
  try {
    headers = await aiConfigHeadersFor(settings, token || null);
  } catch (e) {
    if (e instanceof AiProviderConfigError) return actionError(e.message);
    throw e;
  }

  try {
    const res = await fetch(`${PO_EXTRACT_URL}/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: "{}",
      signal: AbortSignal.timeout(90_000),
    });
    const body = (await res.json().catch(() => null)) as
      | (ProbeResult & { detail?: string })
      | null;
    if (!res.ok) {
      return actionError(
        body?.detail ??
          tr("settings.aiProviderActions.connectionTestFailedHttp", {
            status: res.status,
          }),
      );
    }
    if (!body?.struct) {
      return actionError(
        tr("settings.aiProviderActions.connectionTestUnreadableResult"),
      );
    }
    return actionOk(body);
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return actionError(
        tr("settings.aiProviderActions.connectionTestTimedOut"),
      );
    }
    console.error(tr("settings.aiProviderActions.connectionTestFailedLog"), e);
    return actionError(
      tr("settings.aiProviderActions.extractionServerUnreachable"),
    );
  }
}
