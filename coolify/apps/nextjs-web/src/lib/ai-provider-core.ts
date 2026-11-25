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
import type { Tr } from "./i18n";

export const AI_PROVIDERS = [
  "ollama",
  "openai",
  "anthropic",
  "gemini",
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiProviderPreset {
  value: AiProvider;
  /** 空欄のときに使われる既定（po-extract 側と同じ値）。 */
  baseUrlPlaceholder: string;
  /** モデル名の書き方の例（プロバイダの一覧にある ID そのもの。訳さない）。 */
  modelPlaceholder: string;
  tokenRequired: boolean;
}

/**
 * 技術的な値だけ（URL・モデル ID 例・トークン要否）。画面に出す文言
 * （label / note）は `aiProviderLabel` / `aiProviderNote` で
 * `messages/<locale>.json` の `settings.aiProviderPresets.*` から引く。
 */
export const AI_PROVIDER_PRESETS: Record<AiProvider, AiProviderPreset> = {
  ollama: {
    value: "ollama",
    baseUrlPlaceholder: "http://ollama:11434",
    modelPlaceholder: "qwen2.5vl",
    tokenRequired: false,
  },
  openai: {
    value: "openai",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-5.6-terra",
    tokenRequired: true,
  },
  anthropic: {
    value: "anthropic",
    baseUrlPlaceholder: "https://api.anthropic.com",
    modelPlaceholder: "claude-sonnet-5",
    tokenRequired: true,
  },
  gemini: {
    value: "gemini",
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com",
    modelPlaceholder: "gemini-2.5-flash",
    tokenRequired: true,
  },
};

/** プロバイダの表示名（Select の選択肢・見出しに出す）。 */
export function aiProviderLabel(provider: AiProvider, tr: Tr): string {
  return tr(`settings.aiProviderPresets.${provider}.label`);
}

/** プロバイダの補足説明（フォームの description に出す）。 */
export function aiProviderNote(provider: AiProvider, tr: Tr): string {
  return tr(`settings.aiProviderPresets.${provider}.note`);
}

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

/** プロバイダだけの検証（`tr` 不要）。provider 単体の safeParse に使う。 */
export const aiProviderEnumSchema = z.enum(AI_PROVIDERS);

/**
 * 各プロバイダで許すホスト（監査 L8）。base URL は po-extract がそのまま
 * fetch するので、ここで縛らないと管理者が任意の内部アドレスへ書類を
 * 送れる。クラウド 3 社は正規のホストだけ。ollama / OpenAI 互換は自社の
 * GPU ホスト（コンテナ名・LAN）を指すので固定できないが、クラウドの
 * メタデータ IP・ループバックは弾く。
 */
const PROVIDER_HOSTS: Partial<Record<AiProvider, readonly string[]>> = {
  openai: ["api.openai.com"],
  anthropic: ["api.anthropic.com"],
  gemini: ["generativelanguage.googleapis.com"],
};
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // AWS / GCP / Azure のインスタンスメタデータ
  "metadata.google.internal",
]);

/**
 * host を IPv4 の 4 オクテットに畳む（できなければ null）。http(s) の URL は
 * `new URL` が 10 進・16 進(0x)・8 進(先頭 0)・単一整数・混在表記をドット付きの
 * 正規形にしてから届けるので、通常はドット付き 1 本で足りる。ランタイム差や
 * host を直接渡す呼び出しに備え、単一整数（10/16/8 進）もここで畳む（防御の
 * 二重化）。`lib/webhook-core.ts` の `ipv4Parts` と同じ役割で、基数も吸収する。
 */
function ipv4Octets(host: string): [number, number, number, number] | null {
  const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (dotted) {
    const p = dotted.slice(1, 5).map(Number) as [
      number,
      number,
      number,
      number,
    ];
    return p.every((n) => n >= 0 && n <= 255) ? p : null;
  }
  let n: number | null = null;
  if (/^(0|[1-9][0-9]{0,9})$/.test(host)) n = Number(host);
  else if (/^0x[0-9a-f]+$/.test(host)) n = Number.parseInt(host.slice(2), 16);
  else if (/^0[0-7]+$/.test(host)) n = Number.parseInt(host.slice(1), 8);
  if (n === null || !Number.isInteger(n) || n < 0 || n > 0xff_ff_ff_ff) {
    return null;
  }
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** IPv6 リテラル → 8 グループ（16bit）。壊れていれば null。 */
function ipv6Groups(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let s = host;
  // IPv4 射影の末尾ドット表記（::ffff:127.0.0.1）を 16bit 2 グループへ畳む。
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (tail) {
    const o = tail.slice(1, 5).map(Number) as [number, number, number, number];
    if (o.some((x) => x > 255)) return null;
    const g1 = ((o[0] << 8) | o[1]).toString(16);
    const g2 = ((o[2] << 8) | o[3]).toString(16);
    s = `${s.slice(0, tail.index)}${g1}:${g2}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) =>
    part === "" ? [] : part.split(":").map((g) => Number.parseInt(g, 16));
  const head = toGroups(halves[0]);
  const back = halves.length === 2 ? toGroups(halves[1]) : [];
  const groups =
    halves.length === 2
      ? [
          ...head,
          ...Array(Math.max(0, 8 - head.length - back.length)).fill(0),
          ...back,
        ]
      : head;
  if (
    groups.length !== 8 ||
    groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)
  ) {
    return null;
  }
  return groups;
}

/** ループバック 127/8・未指定 0/8・リンクローカル/メタデータ 169.254/16。 */
function isBlockedIpv4(o: readonly [number, number, number, number]): boolean {
  return o[0] === 127 || o[0] === 0 || (o[0] === 169 && o[1] === 254);
}

/** IPv6 のループバック・未指定、および IPv4 射影（::ffff:…）のブロック対象。 */
function isBlockedIpv6(host: string): boolean {
  const g = ipv6Groups(host);
  if (!g) return false;
  // ::1（ループバック）/ ::（未指定）— 上位 7 グループが 0。
  if (g.slice(0, 7).every((x) => x === 0)) return g[7] === 0 || g[7] === 1;
  // ::ffff:a.b.c.d — 末尾 32bit を IPv4 として判定。
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isBlockedIpv4([
      (g[6] >> 8) & 0xff,
      g[6] & 0xff,
      (g[7] >> 8) & 0xff,
      g[7] & 0xff,
    ]);
  }
  return false;
}

export type BaseUrlVerdict = "OK" | "SCHEME" | "HOST" | "BLOCKED";

export function baseUrlVerdict(
  provider: AiProvider,
  baseUrl: string,
): BaseUrlVerdict {
  if (baseUrl === "") return "OK";
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return "SCHEME";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "SCHEME";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host)) return "BLOCKED";
  // ループバック・未指定・リンクローカルは、基数や IPv6 射影で化けても弾く。
  // 単一ラベル（`ollama`）と RFC1918（自社 GPU の LAN）はここでは縛らない。
  const v4 = ipv4Octets(host);
  if (v4 ? isBlockedIpv4(v4) : isBlockedIpv6(host)) return "BLOCKED";
  const allowed = PROVIDER_HOSTS[provider];
  if (allowed && !allowed.includes(host)) return "HOST";
  return "OK";
}

export function aiProviderSettingsSchema(tr: Tr) {
  return z
    .object({
      provider: aiProviderEnumSchema,
      baseUrl: z
        .string()
        .trim()
        .refine((v) => v === "" || /^https?:\/\/.+/.test(v), {
          message: tr("settings.aiProviderCore.baseUrlMustStartWithHttp"),
        }),
      visionModel: z.string().trim().max(200),
      structModel: z.string().trim().max(200),
      maxOutputTokens: z.number().int().min(256).max(200_000),
    })
    .superRefine((s, ctx) => {
      const verdict = baseUrlVerdict(s.provider, s.baseUrl);
      if (verdict === "OK") return;
      ctx.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message:
          verdict === "HOST"
            ? tr("settings.aiProviderCore.baseUrlHostNotAllowed", {
                hosts: (PROVIDER_HOSTS[s.provider] ?? []).join(" / "),
              })
            : verdict === "BLOCKED"
              ? tr("settings.aiProviderCore.baseUrlHostBlocked")
              : tr("settings.aiProviderCore.baseUrlMustStartWithHttp"),
      });
    });
}

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
  tr: Tr,
): Record<string, unknown> {
  return {
    ...settings,
    apiToken:
      token.status === "absent"
        ? tr("settings.aiProviderCore.tokenAbsent")
        : tr("settings.aiProviderCore.tokenSet", {
            last4: token.last4 ?? "????",
            status: token.status,
          }),
  };
}
