/**
 * device-signals.ts — 端末シグネチャの受け取り・署名 Cookie・リクエスト文脈。
 * サーバー専用（純ロジックは device-signals-core.ts / cidr-core.ts）。
 *
 * ■ SSO はサイトを離れて戻ってくる
 * リクエストボディにシグネチャを載せる方式は SSO で使えない（Authentik へ
 * リダイレクトして戻る）。そこで **HMAC 署名した第一者 Cookie 1 本**で両方を
 * まかなう。SameSite=Lax なので、credentials の同一サイト POST でも、
 * Authentik からのトップレベル GET ナビゲーションでも送られる。
 *
 * ■ ハッシュはサーバーが計算する
 * クライアントが送るのは生シグネチャだけ。hex は受け取らない
 * （理由は device-signals-core.ts 冒頭）。
 *
 * ■ Cookie の作りは attest-core.ts の mintAttestCookie と同じ体裁
 * value = base64url(JSON) + "." + HMAC-SHA256(base64url)。改竄すれば検証で落ちる。
 */

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parseCidrList } from "@/lib/cidr-core";
import {
  classifyDeviceOwnership,
  type DeviceOwnership,
} from "@/lib/device-ownership-core";
import {
  deviceLabelFrom,
  fingerprintOfSignals,
  type NormalizedSignals,
} from "@/lib/device-signals-core";
import { clientIpOf, forwardedChainOf, userAgentOf } from "@/lib/request-ip";

export const DEVICE_SIGNALS_COOKIE = "ckk_dev";
/** Cookie の寿命。ログイン 1 回ぶんの往復に足りればよい。 */
export const DEVICE_SIGNALS_TTL_MS = 10 * 60_000;
/** Cookie 全体を 4KB に収めるための、正規化シグネチャ埋め込みの上限。 */
const MAX_EMBEDDED_SIGNALS_BYTES = 3500;

export function digest(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Cookie 署名鍵。未設定なら AUTH_SECRET を流用（attestSecret と同じ姿勢）。 */
function signalsSecret(): string | null {
  return process.env.DEVICE_SIGNALS_SECRET || process.env.AUTH_SECRET || null;
}

interface CookiePayload {
  v: number;
  fp: string;
  exp: number;
  s?: NormalizedSignals;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** 署名付き Cookie 値を作る。鍵が無ければ null（機能を落とすだけ）。 */
export function mintSignalsCookie(
  version: number,
  fingerprint: string,
  signals: NormalizedSignals,
  now = Date.now(),
): string | null {
  const secret = signalsSecret();
  if (!secret) return null;
  const exp = now + DEVICE_SIGNALS_TTL_MS;
  let body = b64url(
    JSON.stringify({ v: version, fp: fingerprint, exp, s: signals }),
  );
  if (body.length > MAX_EMBEDDED_SIGNALS_BYTES) {
    // シグネチャ本体を落としても指紋だけは運ぶ（相関は維持できる）
    body = b64url(JSON.stringify({ v: version, fp: fingerprint, exp }));
  }
  return `${body}.${sign(secret, body)}`;
}

/** Cookie を検証して中身を返す。改竄・期限切れ・鍵未設定は null。 */
export function verifySignalsCookie(
  value: string | null | undefined,
  now = Date.now(),
): CookiePayload | null {
  const secret = signalsSecret();
  if (!secret || !value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(secret, body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as CookiePayload;
    if (typeof parsed?.fp !== "string" || typeof parsed?.exp !== "number") {
      return null;
    }
    if (parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 生シグネチャ → 正規化 + サーバー側ハッシュ。 */
export function computeSignals(raw: unknown): {
  version: number;
  fingerprint: string;
  normalized: NormalizedSignals;
  label: string;
} {
  const result = fingerprintOfSignals(raw, digest);
  return { ...result, label: deviceLabelFrom(result.normalized) };
}

export interface DeviceContext {
  ip: string | null;
  ipChain: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  version: number | null;
  signals: NormalizedSignals | null;
  ownership: DeviceOwnership;
  ownershipSource: string;
  label: string | null;
}

/** Cookie ヘッダから 1 本だけ取り出す（next/headers に依存しない）。 */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * リクエストから記録用の端末文脈を作る。
 *
 * IdP 起点の SSO（/api/sso）はログイン画面を通らないので Cookie が無く、
 * fingerprint は null になる。**これは正常** — 画面では「—」と出し、
 * 異常として赤くしない。
 */
export function resolveDeviceContext(req: Request): DeviceContext {
  const ip = clientIpOf(req);
  const payload = verifySignalsCookie(readCookie(req, DEVICE_SIGNALS_COOKIE));
  const signals = payload?.s ?? null;
  const verdict = classifyDeviceOwnership({
    wrapper: null,
    kioskDeviceLinked: false,
    attested: false,
    ip,
    corporateCidrs: parseCidrList(process.env.CORPORATE_CIDRS),
  });
  return {
    ip,
    ipChain: forwardedChainOf(req),
    userAgent: userAgentOf(req),
    fingerprint: payload?.fp ?? null,
    version: payload?.v ?? null,
    signals,
    ownership: verdict.ownership,
    ownershipSource: verdict.source,
    label: signals ? deviceLabelFrom(signals) : null,
  };
}

/** 文脈が取れないときの既定値（cron・ビルド時など）。 */
export const EMPTY_DEVICE_CONTEXT: DeviceContext = {
  ip: null,
  ipChain: null,
  userAgent: null,
  fingerprint: null,
  version: null,
  signals: null,
  ownership: "UNKNOWN",
  ownershipSource: "no-evidence",
  label: null,
};
