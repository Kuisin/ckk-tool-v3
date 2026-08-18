import "server-only";

/**
 * intake-folder.ts — 注文書取込フォルダ（INTAKE_DIR）の参照と投入。server-only.
 *
 * 取込の入口は 2 つ（lib/intake.ts の冒頭を参照）— 監視フォルダと画面からの
 * 優先取込。このモジュールは **監視フォルダ側** をブラウザから扱えるようにする:
 *
 *   - `readIntakeFolder()` — 待ち / 処理中 / 取込済 / 失敗 の中身を読む
 *   - `saveToIntakeFolder()` — ファイルをフォルダへ置く（次のスキャンで拾われる）
 *   - `retryFailedIntake()` — failed/ の 1 件を待ちへ戻す
 *
 * これまでフォルダを触るにはサーバーへ SSH する必要があり、まとめて取り込むにも
 * 「今どこで詰まっているか」を見るにも手が無かった。SY0C はここだけを使う。
 *
 * **投入は取込そのものではない** — ファイルを置くだけで、採番・抽出は既存の
 * ポーラー（instrumentation.ts → scanIntakeFolder）が行う。つまり画面からの
 * 投入と、共有フォルダに直接置く運用は、まったく同じ経路を通る。
 *
 * 安全のため、外から来た名前は必ず `path.basename` + `sanitizeFileName` に
 * 通してから使う（`../` でフォルダの外に出さない）。
 */

import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { systematicFileName } from "./file-naming";

/** 取込対象の拡張子（lib/intake.ts の許可リストと同一）。 */
export const INTAKE_FOLDER_EXT = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];

/** 1 ファイルの上限（20MB — 添付・優先取込と同じ）。 */
export const INTAKE_MAX_BYTES = 20 * 1024 * 1024;

/** フォルダ内の 1 ファイル。 */
export interface IntakeFolderEntry {
  name: string;
  sizeBytes: number;
  /** ISO 文字列（表示は呼び出し側で整形）。 */
  modifiedAt: string;
}

/** 取込フォルダの現況。`configured=false` なら INTAKE_DIR が未設定。 */
export interface IntakeFolderStatus {
  configured: boolean;
  /** 設定されているパス（未設定なら null）。 */
  dir: string | null;
  /** フォルダが読めたか（設定済みでもマウント漏れなら false）。 */
  readable: boolean;
  error?: string;
  /** スキャン間隔（ms）— 表示用。 */
  pollIntervalMs: number;
  /** 取込待ち（次のスキャンで拾われる）。 */
  pending: IntakeFolderEntry[];
  /** 処理中（.processing でクレーム済み）。 */
  processing: IntakeFolderEntry[];
  /** 取込済（processed/）— 新しい順に最大 LIST_LIMIT 件。 */
  processed: IntakeFolderEntry[];
  /** 失敗（failed/）— 新しい順に最大 LIST_LIMIT 件。 */
  failed: IntakeFolderEntry[];
  /** 一覧を切り詰めた場合の全件数（processed / failed）。 */
  processedTotal: number;
  failedTotal: number;
}

/** 一覧に出す上限（processed / failed は溜まり続けるため）。 */
const LIST_LIMIT = 50;

const PROCESSING_SUFFIX = ".processing";

function intakeDir(): string | null {
  const dir = process.env.INTAKE_DIR;
  return dir?.trim() ? dir : null;
}

/** 取込対象の拡張子か。 */
export function isIntakeFile(name: string): boolean {
  return INTAKE_FOLDER_EXT.includes(path.extname(name).toLowerCase());
}

/** ディレクトリ 1 つを読み、対象ファイルだけを新しい順に返す。 */
async function readDirEntries(
  dir: string,
  filter: (name: string) => boolean,
): Promise<IntakeFolderEntry[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const entries: IntakeFolderEntry[] = [];
  for (const name of names) {
    if (!filter(name)) continue;
    const info = await stat(path.join(dir, name)).catch(() => null);
    if (!info?.isFile()) continue;
    entries.push({
      name,
      sizeBytes: info.size,
      modifiedAt: new Date(info.mtimeMs).toISOString(),
    });
  }
  return entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/** 取込フォルダの現況を読む。未設定・未マウントでも例外は投げない。 */
export async function readIntakeFolder(): Promise<IntakeFolderStatus> {
  const dir = intakeDir();
  const base: IntakeFolderStatus = {
    configured: dir !== null,
    dir,
    readable: false,
    pollIntervalMs: Number(process.env.INTAKE_POLL_MS ?? 60_000),
    pending: [],
    processing: [],
    processed: [],
    failed: [],
    processedTotal: 0,
    failedTotal: 0,
  };
  if (!dir) return base;

  try {
    const info = await stat(dir);
    if (!info.isDirectory()) {
      return { ...base, error: `${dir} はディレクトリではありません` };
    }
  } catch {
    return {
      ...base,
      error: `${dir} を読めません（コンテナにマウントされていますか）`,
    };
  }

  const [pending, processing, processed, failed] = await Promise.all([
    readDirEntries(dir, (n) => isIntakeFile(n)),
    readDirEntries(dir, (n) => n.endsWith(PROCESSING_SUFFIX)),
    readDirEntries(path.join(dir, "processed"), isIntakeFile),
    readDirEntries(path.join(dir, "failed"), isIntakeFile),
  ]);

  return {
    ...base,
    readable: true,
    pending,
    processing,
    processed: processed.slice(0, LIST_LIMIT),
    failed: failed.slice(0, LIST_LIMIT),
    processedTotal: processed.length,
    failedTotal: failed.length,
  };
}

/**
 * ファイルを取込フォルダへ置く。名前は systematicFileName で一意化するので、
 * 同じ注文書を二度投げても上書きにならない（取込側で重複は人が判断する）。
 * 戻り値は実際に置かれたファイル名。
 */
export async function saveToIntakeFolder(input: {
  filename: string;
  bytes: Buffer;
}): Promise<string> {
  const dir = intakeDir();
  if (!dir) throw new Error("取込フォルダ（INTAKE_DIR）が未設定です");
  if (!isIntakeFile(input.filename)) {
    throw new Error("対応していないファイル形式です");
  }
  await mkdir(dir, { recursive: true });
  const name = systematicFileName(input.filename);
  // 書き込み途中のファイルをポーラーに拾われないよう、まず .processing 相当の
  // 一時名で書いてから改名する（scanIntakeFolder は mtime 5 秒待ちだが、
  // 大きい PDF ではそれでも足りないことがある）。
  const tmp = path.join(dir, `${name}.part`);
  await writeFile(tmp, input.bytes);
  await rename(tmp, path.join(dir, name));
  return name;
}

/**
 * failed/ の 1 件を待ちへ戻す（再取込）。取込は冪等ではない（番号は採り直し）
 * ので、戻すのは人の判断に任せる。
 *
 * 名前は一覧に出したものがそのまま返ってくる前提なので **加工しない** —
 * `sanitizeFileName` を通すと空白入りの実ファイル名と一致しなくなる。
 * 代わりに `path.basename` と拡張子だけで、フォルダ外を指せないことを保証する。
 */
export async function retryFailedIntake(fileName: string): Promise<string> {
  const dir = intakeDir();
  if (!dir) throw new Error("取込フォルダ（INTAKE_DIR）が未設定です");
  const base = path.basename(fileName);
  if (!base || base.startsWith(".") || !isIntakeFile(base)) {
    throw new Error("ファイル名が不正です");
  }
  const from = path.join(dir, "failed", base);
  const info = await stat(from).catch(() => null);
  if (!info?.isFile()) throw new Error("対象のファイルが見つかりません");
  // 待ちに同名があると上書きしてしまうので、空いているときだけ名前を維持する。
  const keep = path.join(dir, base);
  const taken = await stat(keep).then(
    () => true,
    () => false,
  );
  const to = taken ? path.join(dir, systematicFileName(base)) : keep;
  await rename(from, to);
  return path.basename(to);
}
