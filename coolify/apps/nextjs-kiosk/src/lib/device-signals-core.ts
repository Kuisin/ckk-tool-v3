/**
 * device-signals-core.ts — 端末シグネチャの正規化とハッシュ。純関数・isomorphic。
 *
 * ブラウザから集めた特徴量を 1 本の 64 桁 hex（**端末シグネチャ**）に畳む。
 * ログイン試行ログ（login_attempts）と端末台帳（user_devices）の**相関キー**。
 *
 * ■ これは認証要素ではない
 * 集めた値は全てクライアントの自己申告で、拡張機能や devtools で自由に
 * 書き換えられる。「いつもと同じ端末か / 初めて見る端末か」の目安であり、
 * 一致したから本人だ、とは絶対に扱わない。暗号的な証拠はキオスクの
 * Keystore 署名（attest-core.ts）だけ。
 *
 * ■ ハッシュはサーバーが計算する（クライアントの hex を受け取らない）
 * クライアント計算の hex は自己申告 ID にすぎず、(a) 既知の正規端末の値を
 * 送りつけて「見慣れた端末」に化ける、(b) 毎回ランダムを送って端末単位の
 * 相関を無効化する、が 1 行でできてしまう。加えてサーバー計算なら
 * アルゴリズム版が常に 1 本で、版を上げたとき保存済み signals から過去分を
 * 再ハッシュできる。ここが純関数なのは、ハッシュ関数（node:crypto）を
 * **注入**して web / kiosk の双子ファイルに保つため。
 *
 * ■ 安定と揮発を分ける（この設計の肝）
 * 「同じ端末なら変わらない」ものだけをハッシュに入れる。ブラウザのバージョン、
 * ウィンドウサイズ、外部モニタの抜き差しでシグネチャが変わると、毎回「初めて
 * 見る端末」になって台帳が無意味になる。揮発値は**記録はする**（調査で効く）
 * がハッシュには入れない。
 */

/**
 * シグネチャの版。正規形の先頭に入るので、上げると全ハッシュが変わる。
 * 上げたときは保存済みの signals から再計算できる（だから signals を残す）。
 */
export const SIGNALS_VERSION = 1;

/** 1 値あたりの上限（正規化時にクリップ）。 */
const MAX_VALUE_LENGTH = 200;
/** canvas / WebGL の生データを digest に掛ける前の上限。 */
const MAX_BLOB_LENGTH = 32_768;
/** languages の保持数。 */
const MAX_LANGUAGES = 8;

/** 正規形の区切り（値からは必ず剥がすので衝突しない制御文字）。 */
const FIELD_SEPARATOR = "\u001f";
const KEY_VALUE_SEPARATOR = "\u001d";
const VERSION_SEPARATOR = "\u001e";

/**
 * クライアントが送ってくる生シグネチャ。**全て任意・全て信用しない**。
 * 増やすときは STABLE_KEYS に入れるか（＝版を上げる）、揮発として
 * 記録だけに留めるかを必ず決めること。
 */
export interface RawDeviceSignals {
  // ── 安定（ハッシュに入る） ──────────────────────────────────────────
  platform?: unknown;
  /** ブラウザ名のみ。**バージョンは入れない**（月次更新で毎回変わるため） */
  uaFamily?: unknown;
  osFamily?: unknown;
  /** OS のメジャーのみ */
  osMajor?: unknown;
  cpuCores?: unknown;
  deviceMemoryGb?: unknown;
  timeZone?: unknown;
  languages?: unknown;
  touchPoints?: unknown;
  webglVendor?: unknown;
  webglRenderer?: unknown;
  /** 固定フォント群の幅測定を "1,0,1,…" に畳んだもの */
  fontProbe?: unknown;
  /** canvas.toDataURL() の生データ（サーバー側で digest 化してからハッシュへ） */
  canvasData?: unknown;

  // ── 揮発（記録するがハッシュに入れない） ────────────────────────────
  uaFull?: unknown;
  screen?: unknown;
  viewport?: unknown;
  tzOffsetMin?: unknown;
  /** クライアントの時刻。サーバー時刻との差 = 時計ずれ（自動化の手掛かり） */
  clientNowMs?: unknown;
  /** navigator.webdriver — 自動操作フラグ。失敗調査での価値が高い */
  webdriver?: unknown;
  cookieEnabled?: unknown;
  pdfViewer?: unknown;
  /** 収集にかかった ms */
  collectMs?: unknown;
  /** キオスク: window.KioskDevice.appVersion() */
  wrapperVersion?: unknown;
}

/** 正規化済みシグネチャ。欠損は null に統一する。 */
export interface NormalizedSignals {
  platform: string | null;
  uaFamily: string | null;
  osFamily: string | null;
  osMajor: string | null;
  cpuCores: number | null;
  deviceMemoryGb: number | null;
  timeZone: string | null;
  languages: string[] | null;
  touchPoints: number | null;
  webglVendor: string | null;
  webglRenderer: string | null;
  fontProbe: string | null;
  /** canvasData を digest に掛けた結果 */
  canvasDigest: string | null;

  uaFull: string | null;
  screen: string | null;
  viewport: string | null;
  tzOffsetMin: number | null;
  clientNowMs: number | null;
  webdriver: boolean | null;
  cookieEnabled: boolean | null;
  pdfViewer: boolean | null;
  collectMs: number | null;
  wrapperVersion: string | null;
}

/**
 * ハッシュ対象キーと**その順序**。Object.keys に依存しない
 * （プロパティ順で正規形が揺れるとハッシュが割れる）。
 */
export const STABLE_KEYS = [
  "platform",
  "uaFamily",
  "osFamily",
  "osMajor",
  "cpuCores",
  "deviceMemoryGb",
  "timeZone",
  "languages",
  "touchPoints",
  "webglVendor",
  "webglRenderer",
  "fontProbe",
  "canvasDigest",
] as const;

export type StableKey = (typeof STABLE_KEYS)[number];

/** 制御文字を落として空白を畳み、上限で切る。 */
function cleanString(value: unknown, max = MAX_VALUE_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: 正規形の区切り制御文字を値から必ず剥がすための意図的な指定
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

/** 大小を問わない項目用（言語タグなど）。 */
function cleanLower(value: unknown, max = MAX_VALUE_LENGTH): string | null {
  const cleaned = cleanString(value, max);
  return cleaned ? cleaned.toLowerCase() : null;
}

function cleanInt(value: unknown, min: number, max: number): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function cleanBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function cleanLanguages(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list: string[] = [];
  for (const item of value) {
    const tag = cleanLower(item, 24);
    // 順序に意味があるので重複だけ落とし、並べ替えはしない
    if (tag && !list.includes(tag)) list.push(tag);
    if (list.length >= MAX_LANGUAGES) break;
  }
  return list.length > 0 ? list : null;
}

/**
 * 生シグネチャを正規化する。**例外を投げない** — 何を渡されても
 * NormalizedSignals を返す（ログイン経路から呼ばれるため）。
 *
 * digest は canvas の生データを畳むために使う（呼び出し側が注入する
 * SHA-256 等）。ここで畳むので canvasData 自体は保存も送出もしない。
 */
export function normalizeSignals(
  raw: unknown,
  digest: (input: string) => string,
): NormalizedSignals {
  const r = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<RawDeviceSignals>;

  const canvasSource = cleanString(r.canvasData, MAX_BLOB_LENGTH);
  let canvasDigest: string | null = null;
  if (canvasSource) {
    try {
      canvasDigest = cleanString(digest(canvasSource), 64);
    } catch {
      canvasDigest = null;
    }
  }

  return {
    platform: cleanString(r.platform, 64),
    uaFamily: cleanString(r.uaFamily, 32),
    osFamily: cleanString(r.osFamily, 32),
    osMajor: cleanString(r.osMajor, 16),
    cpuCores: cleanInt(r.cpuCores, 1, 1024),
    deviceMemoryGb: cleanInt(r.deviceMemoryGb, 1, 1024),
    timeZone: cleanString(r.timeZone, 64),
    languages: cleanLanguages(r.languages),
    touchPoints: cleanInt(r.touchPoints, 0, 64),
    webglVendor: cleanString(r.webglVendor, 96),
    webglRenderer: cleanString(r.webglRenderer, 128),
    fontProbe: cleanString(r.fontProbe, 96),
    canvasDigest,

    uaFull: cleanString(r.uaFull, MAX_VALUE_LENGTH),
    screen: cleanString(r.screen, 32),
    viewport: cleanString(r.viewport, 32),
    tzOffsetMin: cleanInt(r.tzOffsetMin, -1080, 1080),
    clientNowMs: cleanInt(r.clientNowMs, 0, Number.MAX_SAFE_INTEGER),
    webdriver: cleanBool(r.webdriver),
    cookieEnabled: cleanBool(r.cookieEnabled),
    pdfViewer: cleanBool(r.pdfViewer),
    collectMs: cleanInt(r.collectMs, 0, 600_000),
    wrapperVersion: cleanString(r.wrapperVersion, 32),
  };
}

function stableValueString(signals: NormalizedSignals, key: StableKey): string {
  const value = signals[key];
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

/**
 * ハッシュ対象の正規形文字列。版を先頭に入れるので、版が違えば必ず別ハッシュ。
 * 区切りは制御文字で、値からは normalizeSignals が剥がしてある
 * （= 値の中に区切りを混ぜてキーを詐称することはできない）。
 */
export function canonicalSignalString(signals: NormalizedSignals): string {
  const parts = STABLE_KEYS.map(
    (key) => `${key}${KEY_VALUE_SEPARATOR}${stableValueString(signals, key)}`,
  );
  return `v${SIGNALS_VERSION}${VERSION_SEPARATOR}${parts.join(FIELD_SEPARATOR)}`;
}

export interface SignalsFingerprint {
  version: number;
  /** digest の出力そのまま（node:crypto の sha256 なら 64 桁 hex） */
  fingerprint: string;
  normalized: NormalizedSignals;
}

/**
 * 生シグネチャ → 正規化 → 正規形 → ハッシュ。
 * digest は呼び出し側が注入する（この関数を純粋に保つため）。
 */
export function fingerprintOfSignals(
  raw: unknown,
  digest: (input: string) => string,
): SignalsFingerprint {
  const normalized = normalizeSignals(raw, digest);
  return {
    version: SIGNALS_VERSION,
    fingerprint: digest(canonicalSignalString(normalized)),
    normalized,
  };
}

/**
 * 一覧に出す短いラベル（user_devices.label）。
 * 「どの端末か」を人が見分けるためだけのもので、判定には使わない。
 */
export function deviceLabelFrom(signals: NormalizedSignals): string {
  const browser = signals.uaFamily;
  const os = signals.osFamily
    ? signals.osMajor
      ? `${signals.osFamily} ${signals.osMajor}`
      : signals.osFamily
    : null;
  if (browser && os) return `${browser} / ${os}`.slice(0, 80);
  if (browser) return browser.slice(0, 80);
  if (os) return os.slice(0, 80);
  // i18n-ignore — ログイン時（Auth.js callback）に呼ばれ next-intl の
  // request-scope が無い。ブラウザ/OS シグネチャが一切パースできない
  // 稀なケースの label 保存値のみに使われる（判定には使わない表示専用の値）。
  return "不明な端末";
}
