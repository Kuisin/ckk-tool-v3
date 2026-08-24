/**
 * link-index-core.ts — 外部リンクの正規化とブロック判定（純粋関数）。
 *
 * DB を触らないロジックだけをここに置き、server 側（lib/link-index.ts）と
 * バックフィルスクリプトの両方から同じ規則を使う。
 */

/** URL の正規化。同じ遷移先を 1 コードに寄せるための鍵になる。 */
export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // ホスト名は小文字（URL が既に正規化するが、明示しておく）。
  url.hostname = url.hostname.toLowerCase();
  // 既定ポートは落とす（http:80 / https:443）。
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  // 空のフラグメント（末尾 "#"）は落とす。中身のある # は遷移先が変わるので残す。
  // 注: WHATWG URL は "…/a#" の hash を "" と報告しつつ toString() では "#" を
  // 残すため、hash への代入では消えない。文字列側で落とす。
  return url.toString().replace(/#$/, "");
}

/** 正規化済み URL からホスト名（小文字）を取り出す。 */
export function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * ブロック指定パターンの正規化。
 * 先頭の `*.` / `.` と前後の空白を落とし、小文字のホスト名にそろえる。
 * URL を貼られた場合はホスト名だけを取り出す。
 */
export function normalizeBlacklistPattern(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("://")) {
    const host = hostnameOf(value);
    if (!host) return null;
    value = host;
  }
  value = value.replace(/^\*\./, "").replace(/^\./, "");
  // ホスト名として妥当な文字だけ（ラベル . ラベル）。
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(value)) return null;
  return value;
}

/**
 * ホスト名がブロック対象か。パターンは**完全一致またはサフィックス一致**で、
 * サフィックスはラベル境界でのみ一致する
 * （"evil.example" は "sub.evil.example" に一致するが "notevil.example" には
 * 一致しない — ここを部分文字列一致にすると誤爆する）。
 *
 * 一致したパターンを返す（理由表示用）。無ければ null。
 */
export function matchBlacklist(
  hostname: string,
  patterns: readonly string[],
): string | null {
  const host = hostname.toLowerCase();
  for (const pattern of patterns) {
    const p = pattern.toLowerCase();
    if (!p) continue;
    if (host === p) return pattern;
    if (host.endsWith(`.${p}`)) return pattern;
  }
  return null;
}
