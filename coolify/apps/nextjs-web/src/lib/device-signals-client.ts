"use client";

/**
 * device-signals-client.ts — ブラウザから端末シグネチャを集めて送る。
 *
 * ここは**不純な層**（DOM / canvas / WebGL に触る）。正規化とハッシュは
 * サーバーがやる（device-signals-core.ts / device-signals.ts）。
 *
 * 方針:
 * - 個別に try/catch。1 つ取れなくても他は集める。
 * - 全体にタイムアウト。ログインの体感を遅くしない。
 * - **ハッシュは送らない**。生シグネチャだけを送り、サーバーが再計算する。
 */

import type { RawDeviceSignals } from "@/lib/device-signals-core";

const COLLECT_TIMEOUT_MS = 400;

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** UA からブラウザ名だけを取る（**バージョンは入れない**）。 */
function uaFamily(ua: string): string | undefined {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/chrome\/|crios/i.test(ua)) return "Chrome";
  if (/firefox\/|fxios/i.test(ua)) return "Firefox";
  if (/safari\//i.test(ua)) return "Safari";
  return undefined;
}

function osInfo(ua: string): { osFamily?: string; osMajor?: string } {
  const win = ua.match(/Windows NT ([0-9.]+)/);
  if (win) {
    // Windows 11 も NT 10.0 を名乗るのでメジャーは NT 版のまま持つ
    return { osFamily: "Windows", osMajor: win[1] };
  }
  const mac = ua.match(/Mac OS X ([0-9_]+)/);
  if (mac) return { osFamily: "macOS", osMajor: mac[1]?.split("_")[0] };
  const android = ua.match(/Android ([0-9.]+)/);
  if (android)
    return { osFamily: "Android", osMajor: android[1]?.split(".")[0] };
  const ios = ua.match(/OS ([0-9_]+) like Mac OS X/);
  if (ios) return { osFamily: "iOS", osMajor: ios[1]?.split("_")[0] };
  if (/Linux/i.test(ua)) return { osFamily: "Linux" };
  return {};
}

/** 固定フォント群が使えるかを幅測定で 0/1 に畳む。 */
function fontProbe(): string | undefined {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const sample = "MMMMMMMMMMlli";
  const baseline = ["monospace", "sans-serif", "serif"];
  const fonts = [
    "Arial",
    "Courier New",
    "Georgia",
    "Times New Roman",
    "Verdana",
    "Meiryo",
    "MS Gothic",
    "Yu Gothic",
    "Hiragino Sans",
    "Noto Sans JP",
    "Segoe UI",
    "Helvetica Neue",
  ];
  const widthOf = (font: string): number => {
    ctx.font = `72px ${font}`;
    return Math.round(ctx.measureText(sample).width);
  };
  const base = baseline.map(widthOf);
  return fonts
    .map((font) => {
      const measured = baseline.map((b) => widthOf(`"${font}", ${b}`));
      return measured.some((w, i) => w !== base[i]) ? "1" : "0";
    })
    .join(",");
}

function webglInfo(): { vendor?: string; renderer?: string } {
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl") ??
    canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return {};
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (!ext) return {};
  return {
    vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string,
    renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string,
  };
}

function canvasData(): string | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.textBaseline = "top";
  ctx.font = "14px 'Arial'";
  ctx.fillStyle = "#f60";
  ctx.fillRect(0, 0, 100, 20);
  ctx.fillStyle = "#069";
  ctx.fillText("CKK 端末識別 \u{1F512}", 2, 2);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.fillText("CKK 端末識別 \u{1F512}", 4, 8);
  return canvas.toDataURL();
}

/** 生シグネチャを集める。例外は投げない。 */
export function collectDeviceSignals(): RawDeviceSignals {
  const startedAt = Date.now();
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    webdriver?: boolean;
    pdfViewerEnabled?: boolean;
  };
  const ua = safe(() => nav.userAgent) ?? "";
  const os = safe(() => osInfo(ua)) ?? {};
  const webgl = safe(webglInfo) ?? {};

  return {
    platform: safe(() => nav.platform),
    uaFamily: safe(() => uaFamily(ua)),
    osFamily: os.osFamily,
    osMajor: os.osMajor,
    cpuCores: safe(() => nav.hardwareConcurrency),
    deviceMemoryGb: safe(() => nav.deviceMemory),
    timeZone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    languages: safe(() => Array.from(nav.languages ?? [])),
    touchPoints: safe(() => nav.maxTouchPoints),
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    fontProbe: safe(fontProbe),
    canvasData: safe(canvasData),

    uaFull: ua || undefined,
    screen: safe(
      () =>
        `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio}`,
    ),
    viewport: safe(() => `${window.innerWidth}x${window.innerHeight}`),
    tzOffsetMin: safe(() => -new Date().getTimezoneOffset()),
    clientNowMs: Date.now(),
    webdriver: safe(() => nav.webdriver === true),
    cookieEnabled: safe(() => nav.cookieEnabled),
    pdfViewer: safe(() => nav.pdfViewerEnabled),
    collectMs: Date.now() - startedAt,
  };
}

let inFlight: Promise<void> | null = null;

/**
 * シグネチャをサーバーへ送り、署名 Cookie を受け取る。
 * ログイン画面のマウント時に投げっぱなしで呼び、送信直前に await する。
 * 失敗しても黙って諦める（ログインを止めない）。
 */
export function ensureDeviceSignals(): Promise<void> {
  if (inFlight) return inFlight;
  const run = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        COLLECT_TIMEOUT_MS * 5,
      );
      await fetch("/api/device-signals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(collectDeviceSignals()),
        signal: controller.signal,
        credentials: "same-origin",
      });
      clearTimeout(timer);
    } catch {
      // シグネチャが付かないだけ。ログインには影響させない
    }
  };
  inFlight = run();
  return inFlight;
}
