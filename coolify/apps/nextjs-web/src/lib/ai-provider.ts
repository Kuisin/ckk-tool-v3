import "server-only";

/**
 * ai-provider.ts — `ai_provider.*` の型付きアダプタ（`system-settings.ts` と同型）。
 *
 * 純粋な型・検証・ワイヤ形式は `ai-provider-core.ts`。ここは DB 読み書きと
 * トークンの封緘・開封だけを持つ。
 *
 * **読み出しを 2 つに割ってあるのが安全性の要**:
 *   - `getAiProviderSettings()` … 画面へ渡す。トークンは状態と下 4 桁だけ。
 *   - `aiConfigHeaders()`       … po-extract を呼ぶ直前だけ。復号する。
 * 平文のトークンを持つ関数を 1 つに絞ってあるので、うっかりフォームや監査ログへ
 * 載る経路がそもそも存在しない。
 */

import {
  type AiProviderSettings,
  aiProviderSettingsSchema,
  DEFAULT_AI_PROVIDER_SETTINGS,
  encodeWireConfig,
  isExternalProvider,
  type TokenStatus,
  toWireConfig,
} from "./ai-provider-core";
import { readConfigNamespace, writeConfigValues } from "./app-config";
import {
  ENCRYPTION_KEY_ENV,
  hasEncryptionKey,
  openSecret,
  sealedLast4,
  sealSecret,
} from "./secret-box";

const NAMESPACE = "ai_provider";

const KEY_MAP: Record<keyof AiProviderSettings, string> = {
  provider: "ai_provider.provider",
  baseUrl: "ai_provider.base_url",
  visionModel: "ai_provider.vision_model",
  structModel: "ai_provider.struct_model",
  maxOutputTokens: "ai_provider.max_output_tokens",
};

/** トークンは KEY_MAP の外に置く — 設定オブジェクトへ紛れ込ませないため。 */
const TOKEN_KEY = "ai_provider.api_token";
/** 暗号文をこの保存先に結ぶ（別の設定枠へ貼り替えても開かない）。 */
export const TOKEN_AAD = `system_settings:${TOKEN_KEY}`;

export interface AiProviderSettingsView extends AiProviderSettings {
  tokenStatus: TokenStatus;
  tokenLast4: string | null;
  /** 暗号鍵が入っているか（未設定なら保存自体できない）。 */
  encryptionKeyPresent: boolean;
  encryptionKeyEnv: string;
}

/** 設定の読み出し（**平文トークンは返さない**）。画面はこれを使う。 */
export async function getAiProviderSettings(): Promise<AiProviderSettingsView> {
  const byKey = await readConfigNamespace(NAMESPACE);
  const out = settingsFrom(byKey);
  const stored = byKey.get(TOKEN_KEY) ?? null;
  const opened = openSecret(stored, TOKEN_AAD);
  const tokenStatus: TokenStatus = opened.ok
    ? opened.usedPreviousKey
      ? "rotate-pending"
      : "set"
    : opened.reason === "absent"
      ? "absent"
      : opened.reason === "no-key"
        ? "no-key"
        : "undecryptable";

  return {
    ...out,
    tokenStatus,
    tokenLast4: sealedLast4(stored),
    encryptionKeyPresent: hasEncryptionKey(),
    encryptionKeyEnv: ENCRYPTION_KEY_ENV,
  };
}

export type TokenAction =
  | { action: "keep" }
  | { action: "set"; value: string }
  | { action: "clear" };

/**
 * 保存。トークンは "keep"（既存を維持）が既定なので、設定を直すたびに入れ直す
 * 必要はない。
 *
 * **鍵が無ければ保存を拒否する** — 平文で置くか `AUTH_SECRET` を流用するかの
 * どちらかになり、後者は半年後に「セッション鍵を替えたら AI が止まった」という
 * 追跡しにくい形で出る。守れない秘密は預からない。
 */
export async function saveAiProviderSettings(
  settings: AiProviderSettings,
  token: TokenAction = { action: "keep" },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entries: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(KEY_MAP) as [
    keyof AiProviderSettings,
    string,
  ][]) {
    entries[key] = settings[field];
  }

  if (token.action === "set") {
    const sealed = sealSecret(token.value, TOKEN_AAD);
    if (!sealed.ok) {
      return {
        ok: false,
        error: `暗号鍵（${ENCRYPTION_KEY_ENV}）が未設定のため API トークンを保存できません。システム管理者へ連絡してください。`,
      };
    }
    entries[TOKEN_KEY] = sealed.sealed;
  } else if (token.action === "clear") {
    entries[TOKEN_KEY] = null;
  }

  await writeConfigValues(entries);
  return { ok: true };
}

/** 設定が原因で AI を呼べない（プロバイダに届く前の失敗）。 */
export class AiProviderConfigError extends Error {}

/**
 * po-extract へ付けるヘッダ。設定が既定のままなら `{}`（= ヘッダ無し = 従来の
 * ローカル ollama）。
 *
 * 復号できないときは **黙ってローカルへ落とさない** — 落とすと「設定したのに
 * 効いていない」という一番わかりにくい形で出る。鍵の問題はプロバイダの 401 と
 * 区別できる文言で止める。
 */
export async function aiConfigHeaders(): Promise<Record<string, string>> {
  const byKey = await readConfigNamespace(NAMESPACE);
  const view = settingsFrom(byKey);
  const stored = byKey.get(TOKEN_KEY) ?? null;
  const opened = openSecret(stored, TOKEN_AAD);

  if (
    !opened.ok &&
    opened.reason !== "absent" &&
    isExternalProvider(view.provider)
  ) {
    throw new AiProviderConfigError(
      opened.reason === "no-key"
        ? `AI プロバイダの API トークンを復号できません（${ENCRYPTION_KEY_ENV} が未設定です）。システム管理者へ連絡してください。`
        : "AI プロバイダの API トークンを復号できません（暗号鍵が変わった可能性があります）。システム設定 → AI プロバイダ でトークンを入力し直してください。",
    );
  }

  const wire = toWireConfig(view, opened.ok ? opened.secret : null);
  return wire ? { "X-AI-Config": encodeWireConfig(wire) } : {};
}

/** 設定部分だけを Map から組み立てる（トークンには触れない）。 */
function settingsFrom(byKey: Map<string, unknown>): AiProviderSettings {
  const out: AiProviderSettings = { ...DEFAULT_AI_PROVIDER_SETTINGS };
  const parsedProvider = aiProviderSettingsSchema.shape.provider.safeParse(
    byKey.get(KEY_MAP.provider),
  );
  if (parsedProvider.success) out.provider = parsedProvider.data;
  for (const field of ["baseUrl", "visionModel", "structModel"] as const) {
    const v = byKey.get(KEY_MAP[field]);
    if (typeof v === "string") out[field] = v;
  }
  const maxOut = byKey.get(KEY_MAP.maxOutputTokens);
  if (typeof maxOut === "number" && Number.isFinite(maxOut))
    out.maxOutputTokens = maxOut;
  return out;
}

/**
 * 画面から渡された「未保存の設定」で組み立てるヘッダ（接続テスト用）。
 * 入力中のトークンをそのまま使うので、保存する前に確かめられる。
 */
export async function aiConfigHeadersFor(
  settings: AiProviderSettings,
  token: string | null,
): Promise<Record<string, string>> {
  let key = token;
  if (!key) {
    const byKey = await readConfigNamespace(NAMESPACE);
    const opened = openSecret(byKey.get(TOKEN_KEY) ?? null, TOKEN_AAD);
    key = opened.ok ? opened.secret : null;
  }
  const wire = toWireConfig(settings, key);
  return wire ? { "X-AI-Config": encodeWireConfig(wire) } : {};
}
