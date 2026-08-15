/**
 * system-files.ts — 「システムファイル」の判定（SY06 ファイル管理）。isomorphic.
 *
 * システムファイル = **人にも業務にも用が無い、OS・ツールが勝手に作る残骸**。
 * 隠しファイル（`.DS_Store` 等）・バックアップ（`~` 付き）・編集中の一時
 * ファイル（`.~lock.*` / `~$*` / `*.tmp`）・アップロード途中の断片
 * （`*.part` / `*.crdownload`）などが該当する。
 *
 * アプリが生成した PDF（見積書・請求書・納品書 …）や添付ファイルは
 * **システムファイルではない** — 業務上の実体なので既定で一覧に出す。
 * （旧実装は `pdfs/` 等の prefix をシステム扱いにして既定で隠していた。）
 *
 * SY06 の「システムファイル」トグルはこの判定で出し分ける。アクセス制御とは
 * 無関係（そちらは lib/file-access.ts）。
 */

/** そのままの名前でシステムファイル扱いにするもの（小文字で比較）。 */
const SYSTEM_FILENAMES = new Set([
  "thumbs.db",
  "ehthumbs.db",
  "desktop.ini",
  "icon\r",
  "__macosx",
]);

/** 拡張子がこれならシステムファイル（残骸・一時ファイル）。 */
const SYSTEM_EXTENSIONS = new Set([
  "tmp",
  "temp",
  "part",
  "partial",
  "crdownload",
  "swp",
  "swo",
  "swx",
  "bak",
  "orig",
  "lock",
]);

function isSystemSegment(segment: string): boolean {
  const name = segment.trim();
  if (!name) return false;
  // 隠しファイル / 隠しフォルダ（`.DS_Store`, `._foo`, `.~lock.x.odt#`, `.trash/`）
  if (name.startsWith(".")) return true;
  // Office の編集中一時ファイル（`~$報告書.xlsx`）
  if (name.startsWith("~$")) return true;
  // エディタのバックアップ（`memo.txt~`）
  if (name.endsWith("~")) return true;
  const lower = name.toLowerCase();
  if (SYSTEM_FILENAMES.has(lower)) return true;
  const dot = lower.lastIndexOf(".");
  if (dot > 0 && SYSTEM_EXTENSIONS.has(lower.slice(dot + 1))) return true;
  return false;
}

/**
 * ストレージキーがシステムファイル（OS・ツールの残骸）か。
 * 途中のフォルダが隠しフォルダなら、その配下も全てシステムファイル扱い。
 */
export function isSystemFileKey(key: string): boolean {
  return key
    .split("/")
    .filter((s) => s.length > 0)
    .some(isSystemSegment);
}
