/**
 * inventory-note-core.ts — inventory_transactions.notes / audit_logs.after_data.note
 * に埋め込む構造化ノートのエンコード/デコード。依存なし。
 *
 * これらの note は**書いた瞬間の言語で固定してはいけない** — 誰が
 * いつどの言語で完了させたかに関わらず、後で開いた人の言語で読めるべき値
 * だから。なので実際の文言はここでは持たず、**鍵 + パラメータ**だけを
 * 文字列へエンコードして保存し、読み出し側（web の
 * lib/inventory-note-labels.ts）が自分の i18n で翻訳する。
 *
 * ★ **nextjs-kiosk との twin file**（逐語コピー）。原本はこちら（nextjs-web）で、
 *   `pnpm twin:sync` で複製する。kiosk はキオスクが最終工程を完了したときに
 *   encodeInventoryNote() を書き込む側（inventory.ts 経由）だが、読み出して
 *   翻訳する画面は今のところ web にしかないので decode 側は使わない。
 *
 * 旧データ（この形式より前に書かれた素の日本語文字列）は
 * decodeInventoryNote が null を返す — 呼び出し側はそのまま表示する。
 */

export interface InventoryNote {
  key: string;
  params?: Record<string, string | number>;
}

const PREFIX = "i18n:";

export function encodeInventoryNote(
  key: string,
  params?: Record<string, string | number>,
): string {
  return PREFIX + JSON.stringify(params ? { key, params } : { key });
}

export function decodeInventoryNote(
  notes: string | null | undefined,
): InventoryNote | null {
  if (!notes || !notes.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(PREFIX.length)) as {
      key?: unknown;
      params?: unknown;
    };
    if (typeof parsed.key !== "string") return null;
    return {
      key: parsed.key,
      params:
        parsed.params && typeof parsed.params === "object"
          ? (parsed.params as Record<string, string | number>)
          : undefined,
    };
  } catch {
    return null; // 旧形式の素の文字列
  }
}
