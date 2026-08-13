/**
 * file-naming.ts — 保存ファイル名の系統的リネーム。
 *
 * アプリからストレージへ保存するファイルは必ずここを通し、
 * `{yyyyMMdd-HHmmss}_{rand4}_{ラベル_}{元ファイル名}` に統一する。
 * 一意（時刻 + 乱数）かつ元名・文脈ラベルで判別可能。isomorphic（依存なし）。
 */

const RAND_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function rand4(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += RAND_CHARS[Math.floor(Math.random() * RAND_CHARS.length)];
  }
  return s;
}

function timestamp(now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(
    now.getHours(),
  )}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** パス区切り・制御文字などを落とした安全なファイル名（拡張子は保持）。 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars from user-supplied names
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "file";
}

/**
 * 系統的な一意ファイル名を生成する。
 * label は文脈識別子（文書番号など）— 付けると判別しやすくなる。
 */
export function systematicFileName(original: string, label?: string): string {
  const safeLabel = label ? `${sanitizeFileName(label)}_` : "";
  return `${timestamp()}_${rand4()}_${safeLabel}${sanitizeFileName(original)}`;
}
