/**
 * qr-payload.ts — 印刷する QR の中身（統一フォーマット）。純関数・isomorphic。
 *
 * **社内で刷る QR は全てこの 1 形式**にする。1 つのリーダー（キオスクの
 * スキャナ）が「何の QR か」を見分けて画面を振り分けられるようにするため:
 *
 *     CKK:<KIND>:<KEY>        例) CKK:WO:1234
 *                                 CKK:CARD:ABCD-EFGH-JKLM-NPQR
 *                                 CKK:INV:INV-202608-00001
 *
 * 決めごと:
 * - **URL は入れない**。長い URL は QR を細かくして現場の読み取りを落とすし、
 *   紙が外に出たときにホスト名を晒す。中身は業務キーだけに留める。
 * - KEY は書類の**表示番号**（人が読める番号）そのまま。紙と画面を突き合わせ
 *   られるし、内部 uuid を紙に出さずに済む。
 * - 区切りは `:`。KEY にはダッシュが入る（QOT-202608-00001）ので、分割は
 *   **先頭 2 つの `:` だけ**で行う。
 * - 大文字小文字は問わない（読み取り機のブレを吸収）。KIND は大文字へ正規化。
 *
 * 既に配ってあるカードの QR は素の 16 桁コード（プレフィクス無し）で刷られて
 * いる。パーサはそれを壊さない — 呼び出し側が「プレフィクス無しなら従来の
 * 解釈」へフォールバックできるよう、判別できないときは null を返すだけにする。
 */

/** 全ての社内 QR に付く先頭ラベル。 */
export const QR_PREFIX = "CKK";

/**
 * QR の種別。増やすときはキオスク側の振り分けも一緒に見ること
 * （nextjs-kiosk は twin ファイルとしてこのファイルを複製している）。
 */
export const QR_KINDS = {
  /** 従業員の QR カード（キオスクのログイン）。KEY = カード ID。 */
  CARD: "CARD",
  /**
   * 指示書。KEY = ロット番号（通し連番 int — キオスクの数値入力と互換）。
   * 書類番号 WO-YYYYMM-NNNNN は表示用で、QR には入れない。
   */
  WO: "WO",
  /** 見積書。KEY = QOT-YYYYMM-NNNNN。 */
  QUOTE: "QOT",
  /** 注文請書。KEY = ORD-YYYYMM-NNNNN。 */
  ORDER_ACCEPTANCE: "ORD",
  /** 素材発注書。KEY = PO-YYYYMM-NNNNN。 */
  PURCHASE_ORDER: "PO",
  /** 納品書。KEY = DRN-YYYYMM-NNNNN。 */
  DELIVERY_NOTE: "DRN",
  /** 請求書。KEY = INV-YYYYMM-NNNNN。 */
  INVOICE: "INV",
  /** 検査表。KEY = 検査表コード。 */
  INSPECTION: "INSP",
  /**
   * 作業場所（MS0D）。KEY = 作業場所コード（work_locations.code — unique）。
   * 機械・エリアに貼るラベル。キオスクの工程実行画面で読むと、その実績の
   * 作業場所を上書きできる（端末の既定作業場所より優先）。
   */
  WORK_LOCATION: "LOC",
} as const;

export type QrKind = (typeof QR_KINDS)[keyof typeof QR_KINDS];

export interface QrPayload {
  /** 大文字へ正規化した種別（未知の種別もそのまま返す）。 */
  kind: string;
  /** 業務キー（前後の空白のみ落とす）。 */
  key: string;
}

/**
 * 印刷する文字列を組み立てる。KEY 内の `:` は形式が壊れるので落とす
 * （業務キーに `:` は現れない — 現れたら採番規則の方を疑うこと）。
 */
export function encodeQrPayload(kind: QrKind | string, key: string): string {
  const safeKey = String(key).replace(/:/g, "").trim();
  return `${QR_PREFIX}:${String(kind).toUpperCase()}:${safeKey}`;
}

/**
 * 読み取った文字列を解釈する。統一フォーマットでなければ null
 * （= 呼び出し側で従来形式へフォールバックしてよい、の意）。
 */
export function parseQrPayload(raw: string): QrPayload | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return null;
  const first = trimmed.indexOf(":");
  if (first < 0) return null;
  if (trimmed.slice(0, first).toUpperCase() !== QR_PREFIX) return null;
  const rest = trimmed.slice(first + 1);
  const second = rest.indexOf(":");
  if (second < 0) return null;
  const kind = rest.slice(0, second).trim().toUpperCase();
  const key = rest.slice(second + 1).trim();
  if (kind === "" || key === "") return null;
  return { kind, key };
}

/** 指定の種別として読めたときだけ KEY を返す（違う種別・非対応は null）。 */
export function qrKeyOfKind(raw: string, kind: QrKind | string): string | null {
  const parsed = parseQrPayload(raw);
  if (!parsed) return null;
  return parsed.kind === String(kind).toUpperCase() ? parsed.key : null;
}
