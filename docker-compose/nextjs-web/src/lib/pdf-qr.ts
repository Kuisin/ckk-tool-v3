/**
 * pdf-qr.ts — 書類 PDF に載せる QR（テンプレートへ差し込む SVG 文字列）。
 *
 * 中身は統一形式 `CKK:<KIND>:<KEY>`（lib/qr-payload.ts）。**URL は入れない** —
 * 長い URL は QR を細かくして現場の読み取りを落とすし、紙が外に出たときに
 * ホスト名を晒す。載せるのは書類の表示番号だけで、開く画面は読み取った側
 * （キオスク / 社内ツール）が決める。
 *
 * テンプレートは `{{doc_qr}}` を素の HTML として差し込む（lib/pdf.ts の
 * substitute は値をそのまま埋める）。SVG は自前生成（lib/qr.ts）なので
 * 外部入力は混ざらない。
 */

import { qrSvg } from "./qr";
import { encodeQrPayload, type QrKind } from "./qr-payload";

/**
 * 書類 QR の SVG。キーが無い書類（採番前・空フォーム）は空文字を返し、
 * テンプレート側は何も描かない。
 */
export function documentQrSvg(
  kind: QrKind | string,
  key: string | number | null | undefined,
): string {
  if (key == null) return "";
  const text = String(key).trim();
  if (text === "") return "";
  return qrSvg(encodeQrPayload(kind, text), { margin: 2 });
}
