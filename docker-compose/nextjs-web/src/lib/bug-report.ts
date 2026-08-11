/**
 * bug-report.ts — バグ報告用のクライアント診断収集（ヘッダーのバグ報告ボタン）。
 *
 * installBugReportCapture(): console.error / console.warn と window の
 * error / unhandledrejection をリングバッファ（最新 BUFFER_MAX 件）へ記録する。
 * 元の console 動作は変えない（パススルー）。AppHeader のマウント時に一度だけ
 * インストールされる（多重インストールはガード）。
 *
 * collectDiagnostics(): 送信時点のページ・ブラウザ環境スナップショットを返す。
 * クライアント専用（window 前提）— Server Component から import しないこと。
 */

export interface CapturedLog {
  /** "error" | "warn" | "uncaught" | "unhandledrejection" */
  level: string;
  /** ISO 8601 記録時刻 */
  at: string;
  message: string;
}

export interface BugReportDiagnostics {
  url: string;
  title: string;
  referrer: string;
  userAgent: string;
  language: string;
  timezone: string;
  viewport: string;
  screen: string;
  devicePixelRatio: number;
  online: boolean;
  appVersion: string;
}

const BUFFER_MAX = 200;
const MESSAGE_MAX = 1000;

const buffer: CapturedLog[] = [];
let installed = false;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function formatValue(v: unknown): string {
  if (v instanceof Error) {
    const stack = (v.stack ?? "").split("\n").slice(1, 4).join("\n");
    return `${v.name}: ${v.message}${stack ? `\n${stack}` : ""}`;
  }
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function push(level: string, parts: unknown[]): void {
  buffer.push({
    level,
    at: new Date().toISOString(),
    message: truncate(parts.map(formatValue).join(" "), MESSAGE_MAX),
  });
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
}

/** 記録済みログ（新しい順ではなく発生順）のコピー。 */
export function capturedLogs(): CapturedLog[] {
  return [...buffer];
}

/** console / window のエラー捕捉を開始する（何度呼んでも 1 回だけ有効）。 */
export function installBugReportCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      push(level, args);
      original(...args);
    };
  }

  window.addEventListener("error", (event) => {
    push("uncaught", [
      event.message,
      event.filename ? `@ ${event.filename}:${event.lineno}` : "",
    ]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    push("unhandledrejection", [event.reason]);
  });
}

/** 送信時点のページ・環境スナップショット。 */
export function collectDiagnostics(): BugReportDiagnostics {
  return {
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    online: navigator.onLine,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "",
  };
}
