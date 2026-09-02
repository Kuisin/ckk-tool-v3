/**
 * pdf-stamp.ts — 発行済み書類にだけ載せる社印（電子印影）。
 *
 * 押印は書類が確定した証跡なので、下書き段階の PDF には出さない。各 PDF
 * ルートは呼び出し前に `isIssued` で 403 を返す既存のガードを持つが、この
 * 関数自身にも同じ判定を持たせる — `{{stamp}}` を差し込む呼び出し側が増えても
 * 判定を書き忘れて下書きに印影が付く事故を防ぐため（テンプレートは
 * `{{stamp}}` を素の HTML として差し込むだけで、下書きかどうかは知らない）。
 *
 * 画像は `src/pdf-templates/company-stamp.png` を base64 data URI に変換して
 * 埋め込む。lib/pdf.ts の SVG アップロードループ（`.svg` のみ拾う）とは別経路
 * — QR（lib/pdf-qr.ts）と同じく `{{stamp}}` に素の HTML 文字列を差し込む方式
 * なので、Gotenberg への追加ファイルアップロードは不要。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "./i18n";
import { label } from "./messages";

const STAMP_FILE = path.join(
  process.cwd(),
  "src",
  "pdf-templates",
  "company-stamp.png",
);

// プロセス内キャッシュ（ユーザー依存の値ではない静的アセットなのでリクエスト
// をまたいで共有してよい — lib/format.ts が戒める「ユーザー設定をモジュール
// 状態に持つ」とは別種）。
let cachedDataUri: string | null = null;

async function stampDataUri(): Promise<string> {
  if (cachedDataUri) return cachedDataUri;
  const buf = await readFile(STAMP_FILE);
  cachedDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  return cachedDataUri;
}

/**
 * 承認済み（発行済み）のときだけ `<img>` タグを返す。それ以外は空文字 —
 * テンプレート側の `.stamp:empty { display: none }` で枠ごと消える。
 *
 * `locale` は省略可能（既定 "ja"）— この印は今のところ請求書（受取先の言語で
 * 出す 3 帳票の 1 つ）だけが使うので、呼び出し元（api/pdf/invoice）が
 * `normalizeLocale(invoice.recipientDocumentLocale)` を渡す。
 */
export async function companyStampImg(
  approved: boolean,
  locale: Locale = "ja",
): Promise<string> {
  if (!approved) return "";
  const src = await stampDataUri();
  const alt = label("pdf.stamp.companySeal", locale, "社印");
  return `<img class="stamp-img" src="${src}" alt="${alt}" />`;
}
