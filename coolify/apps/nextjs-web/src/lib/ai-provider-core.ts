/**
 * ai-provider-core.ts — AI プロバイダ設定の型・既定・検証・ワイヤ形式。
 *
 * 純粋（DB も server-only も参照しない）なので単体テストできる。DB 読み書きは
 * `ai-provider.ts`、画面は `/settings/ai-provider`（SY0E）。
 *
 * 1 つの設定が **抽出（紙 → JSON）と補助タスク（キーワード生成など）の両方**に
 * 効く。OCR は常にローカルのままで、差し替わるのは vision 転写と JSON 構造化。
 */

import { z } from "zod";

export const AI_PROVIDERS = [
  "ollama",
  "openai",
  "anthropic",
  "gemini",
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiProviderPreset {
  value: AiProvider;
  label: string;
  /** 空欄のときに使われる既定（po-extract 側と同じ値）。 */
  baseUrlPlaceholder: string;
  /** モデル名の書き方の例。プロバイダの一覧にある ID をそのまま入れる。 */
  modelPlaceholder: string;
  tokenRequired: boolean;
  note: string;
}

export const AI_PROVIDER_PRESETS: Record<AiProvider, AiProviderPreset> = {
  ollama: {
    value: "ollama",
    label: "ローカル (Ollama)",
    baseUrlPlaceholder: "http://ollama:11434",
    modelPlaceholder: "qwen2.5vl",
    tokenRequired: false,
    note: "社内の GPU で動かす既定の構成。書類が社外へ出ない。",
  },
  openai: {
    value: "openai",
    label: "OpenAI 互換",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "例: gpt-4o-mini",
    tokenRequired: true,
    note: "OpenAI のほか、vLLM・LM Studio・OpenRouter など /chat/completions 互換のサービス。",
  },
  anthropic: {
    value: "anthropic",
    label: "Anthropic (Claude)",
    baseUrlPlaceholder: "https://api.anthropic.com",
    modelPlaceholder: "例: claude-sonnet-5",
    tokenRequired: true,
    note: "モデル ID に日付は付けない（claude-opus-5 / claude-sonnet-5 / claude-haiku-4-5 など）。",
  },
  gemini: {
    value: "gemini",
    label: "Google Gemini",
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com",
    modelPlaceholder: "例: gemini-2.0-flash",
    tokenRequired: true,
    note: "Google AI Studio の API キーを使う。",
  },
};

export interface AiProviderSettings {
  provider: AiProvider;
  /** 空 = プロバイダ既定 */
  baseUrl: string;
  /** 画像を読むモデル。空 = po-extract の env 既定 */
  visionModel: string;
  /** JSON を組み立てるモデル。空 = visionModel と同じ */
  structModel: string;
  maxOutputTokens: number;
}

export const DEFAULT_AI_PROVIDER_SETTINGS: AiProviderSettings = {
  provider: "ollama",
  baseUrl: "",
  visionModel: "",
  structModel: "",
  maxOutputTokens: 8192,
};

/** 保存済みトークンの状態。画面の警告と、呼び出し前の門番を兼ねる。 */
export type TokenStatus =
  | "absent" // 未設定（初期状態）
  | "set" // 現在の鍵で読める
  | "rotate-pending" // 旧鍵で読めた → 保存し直せば新鍵で入れ替わる
  | "undecryptable" // 鍵が変わった / 壊れている
  | "no-key"; // SETTINGS_ENCRYPTION_KEY が未設定

export const aiProviderSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/.+/.test(v), {
      message: "ベース URL は http:// または https:// で始めてください",
    }),
  visionModel: z.string().trim().max(200),
  structModel: z.string().trim().max(200),
  maxOutputTokens: z.number().int().min(256).max(200_000),
});

/** ワイヤ形式（po-extract の X-AI-Config）。`v` で世代を切る。 */
export interface AiWireConfig {
  v: 1;
  provider: AiProvider;
  baseUrl: string;
  visionModel: string;
  structModel: string;
  apiKey: string;
  maxOutputTokens: number;
}

/**
 * 送るべき設定が無いなら **null**（= ヘッダを付けない = po-extract は従来どおり
 * env の ollama で動く）。既定のまま触っていない環境で挙動が 1 ミリも変わらない、
 * というロールアウトの保証はここ 1 箇所に集約してある。
 */
export function toWireConfig(
  settings: AiProviderSettings,
  apiKey: string | null,
): AiWireConfig | null {
  const untouched =
    settings.provider === "ollama" &&
    !settings.baseUrl &&
    !settings.visionModel &&
    !settings.structModel &&
    !apiKey;
  if (untouched) return null;
  return {
    v: 1,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    visionModel: settings.visionModel,
    structModel: settings.structModel || settings.visionModel,
    apiKey: apiKey ?? "",
    maxOutputTokens: settings.maxOutputTokens,
  };
}

/** X-AI-Config の値（base64url の JSON）。 */
export function encodeWireConfig(wire: AiWireConfig): string {
  return Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
}

/** 外部プロバイダを選んでいるか（画面の注意書きと門番の判定に使う）。 */
export function isExternalProvider(provider: AiProvider): boolean {
  return provider !== "ollama";
}

/**
 * 監査ログに残してよい形。`recordAudit` は before/after をそのまま JSON へ
 * 書くので、**トークンは平文も暗号文も渡さない**（暗号文を追記専用の台帳に
 * 溜めると、鍵が漏れた瞬間に過去ぶんがまとめて開く）。
 */
export function redactAiSettings(
  settings: AiProviderSettings,
  token: { status: TokenStatus; last4: string | null },
): Record<string, unknown> {
  return {
    ...settings,
    apiToken:
      token.status === "absent"
        ? "未設定"
        : `設定済み (****${token.last4 ?? "????"}) / ${token.status}`,
  };
}
