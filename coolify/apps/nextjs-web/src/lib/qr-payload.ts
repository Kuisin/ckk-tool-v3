/**
 * qr-payload.ts — 印刷する QR の中身（統一フォーマット）。純関数・isomorphic。
 *
 * **社内で刷る QR は全てこの 1 形式**にする。1 つのリーダー（キオスクの
 * スキャナ）が「何の QR か」を見分けて画面を振り分けられるようにするため:
 *
 *     CKK:<KIND>:<KEY>        例) CKK:WO:1234
 *                                 CKK:CARD:ABCD-EFGH-JKLM-NPQR
 *                                 CKK:INV:CKK~INV-2026-00001
 *
 * 決めごと:
 * - **URL は入れない**。長い URL は QR を細かくして現場の読み取りを落とすし、
 *   紙が外に出たときにホスト名を晒す。中身は業務キーだけに留める。
 * - KEY は業務キー（人が読める番号）。内部 uuid を紙に出さずに済む。
 * - **書類番号を運ぶ QR の KEY は「法人コード~書類番号」**（lib/doc-number.ts の
 *   「id」の姿。例 `CKK~INV-2026-00001`）。書類番号は自社法人ごとの連番なので
 *   （番号設計 PR-C）、番号だけでは 2 つの法人の同じ番号を見分けられない。
 *   区切りが `~` なのは、`/` を QR の英数字モードが持たず、`:` はこの形式の
 *   区切りだから。先頭の `CKK`（形式のラベル）と法人コードは別物 — たまたま
 *   同じ綴りになり得るだけ。
 *   **番号設計 PR-C より前に刷った紙の QR は番号だけ**（`CKK:INV:INV-202608-00001`）。
 *   パーサはどちらも通す — 読み手は {@link parseQrDocKey} で法人コードの有無を
 *   見て、無ければ番号（旧番号を含む）から書類を引く。
 * - ロット番号（`CKK:WO:<int>`）・カード・作業場所は法人をまたいで一意なので、
 *   これまでどおり素のキー。
 * - 区切りは `:`。KEY にはダッシュが入る（QOT-2026-00001）ので、分割は
 *   **先頭 2 つの `:` だけ**で行う。
 * - 大文字小文字は問わない（読み取り機のブレを吸収）。KIND は大文字へ正規化。
 *
 * 既に配ってあるカードの QR は素の 16 桁コード（プレフィクス無し）で刷られて
 * いる。パーサはそれを壊さない — 呼び出し側が「プレフィクス無しなら従来の
 * 解釈」へフォールバックできるよう、判別できないときは null を返すだけにする。
 */

import { docUrlId, isDocNumber, parseDocId } from "./doc-ref-core";

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
   * 書類番号 WOR-FFFF-NNNNN は表示用で、QR には入れない。
   */
  WO: "WO",
  /** 見積書。KEY = 法人コード~QOT-FFFF-NNNNN（旧い紙は QOT-YYYYMM-NNNNN だけ）。 */
  QUOTE: "QOT",
  /** 注文請書。KEY = 法人コード~ORD-FFFF-NNNNN（旧い紙は ORD-YYYYMM-NNNNN だけ）。 */
  ORDER_ACCEPTANCE: "ORD",
  /** 素材発注書。KEY = 法人コード~PO-FFFF-NNNNN（旧い紙は PO-YYYYMM-NNNNN だけ）。 */
  PURCHASE_ORDER: "PO",
  /** 納品書。KEY = 法人コード~DRN-FFFF-NNNNN（旧い紙は DRN-YYYYMM-NNNNN だけ）。 */
  DELIVERY_NOTE: "DRN",
  /** 請求書。KEY = 法人コード~INV-FFFF-NNNNN（旧い紙は INV-YYYYMM-NNNNN だけ）。 */
  INVOICE: "INV",
  /** 検査表。KEY = 検査表コード。 */
  INSPECTION: "INSP",
  /**
   * 作業場所（MS0D）。KEY = 作業場所コード（work_locations.code — unique）。
   * 機械・エリアに貼るラベル。キオスクの工程実行画面で読むと、その実績の
   * 作業場所を上書きできる（端末の既定作業場所より優先）。
   */
  WORK_LOCATION: "LOC",
  /** 設計依頼書。KEY = 法人コード~DSG-FFFF-NNNNN（旧い紙は DSG-YYYYMM-NNNNN だけ）。 */
  DESIGN_REQUEST: "DSG",
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
 *
 * 書類の KEY は id の姿（`CKK~INV-2026-00001`）で渡す。DB の参照
 * （`CKK/INV-2026-00001`）をそのまま渡されたときは、ここで `~` へ揃える。
 */
export function encodeQrPayload(kind: QrKind | string, key: string): string {
  const raw = String(key).replace(/:/g, "").trim();
  const { companyCode, number } = parseDocId(raw);
  const safeKey =
    companyCode && isDocNumber(number) ? docUrlId(companyCode, number) : raw;
  return `${QR_PREFIX}:${String(kind).toUpperCase()}:${safeKey}`;
}

/**
 * 書類を運ぶ QR の KEY → 法人コードと書類番号。
 *
 *   `CKK~INV-2026-00001` → { companyCode: "CKK", number: "INV-2026-00001" }
 *   `INV-202608-00001`   → { companyCode: null,  number: "INV-202608-00001" }
 *                           （PR-C より前の紙。番号から書類を引く）
 *
 * 書類番号の形でない KEY（ロット番号・カード・作業場所コード）は null。
 */
export function parseQrDocKey(
  key: string,
): { companyCode: string | null; number: string } | null {
  const { companyCode, number } = parseDocId(key);
  const upper = number.toUpperCase();
  if (!isDocNumber(upper)) return null;
  return { companyCode, number: upper };
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
