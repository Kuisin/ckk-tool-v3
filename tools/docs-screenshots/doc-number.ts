/**
 * doc-number.ts — 書類番号と書類の URL を**形で**待つための正規表現。
 *
 * 書類番号は DB が INSERT 時に振る（`PREFIX-FFFF-NNNNN`。FFFF = 会計年度、
 * 自社法人 × 年度ごとの連番）。**何番になるかは作った順で決まる**ので、
 * ここの道具（撮影・通し操作・e2e）は番号を決め打ちしない:
 *
 *   画面の文字    … `docNumber("QOT")`（= /^QOT-\d{4}-\d{5}$/）や `anyDocNumber("QOT")`
 *   詳細の URL    … `docUrl("/sales/quotes", "QOT")`
 *                   正規の URL は id（法人コード~番号 — `/sales/quotes/CKK~QOT-2026-00001`）
 *   行き先の指定  … シードが旧番号（legacy_number）を付けて入れた書類は**旧番号の URL**
 *                   （`/sales/quotes/QOT-202607-00001`）で開ける。詳細ページが
 *                   legacy_number から引いて正規の URL へ送る。
 *
 * DB から引くとき（e2e の裏取り）は `legacy_number` か `app.to_doc_ref(type, 旧番号)`。
 */

import type { Page, Response } from "@playwright/test";

/** 番号の本体（会計年度 4 桁 + 連番 5 桁）。 */
const BODY = String.raw`\d{4}-\d{5}`;

/** 要素の文字**全体**が書類番号（`QOT-2026-00001`）。`getByText` / `getByRole({ name })` 用。 */
export function docNumber(prefix: string): RegExp {
  return new RegExp(`^${prefix}-${BODY}$`);
}

/** 文字の**どこか**に書類番号がある（一覧・関連書類の行が描かれたのを待つ用）。 */
export function anyDocNumber(prefix: string): RegExp {
  return new RegExp(`\\b${prefix}-${BODY}\\b`);
}

/** 注文明細の番号（`ORD-2026-00001-01`）。branch を渡すとその枝番だけ。 */
export function orderLineNumber(branch?: number): RegExp {
  const nn = branch == null ? String.raw`\d{2}` : String(branch).padStart(2, "0");
  return new RegExp(`^ORD-${BODY}-${nn}$`);
}

/** 文字のどこかに注文明細の番号がある。 */
export const ANY_ORDER_LINE_NUMBER = new RegExp(String.raw`\bORD-${BODY}-\d{2}\b`);

/**
 * 書類の詳細画面の URL（保存後の遷移を待つ用）。
 *
 * 正規の URL は `<base>/<法人コード>~<番号><suffix>`。`~` は符号化されて
 * `%7E` で載ることがあるので両方通す。
 *
 * @param suffix 番号のあとに続くパス（`/edit` など）
 * @param open   true = 番号のあとに何が続いてもよい（`?tab=…` など）
 */
export function docUrl(
  base: string,
  prefix: string,
  suffix = "",
  open = false,
): RegExp {
  const esc = (s: string) => s.replace(/[/.]/g, "\\$&");
  const tail = open ? "" : String.raw`(\?.*)?$`;
  return new RegExp(
    `${esc(base)}\\/[^/~%]+(~|%7E)${prefix}-${BODY}${esc(suffix)}${tail}`,
  );
}

/**
 * 指示書の詳細の URL。指示書だけは URL の id が**ロット番号**（通し連番 int）で、
 * 書類番号（WOR-…）で開くとロット番号の URL へ送られる。
 */
export const WORK_ORDER_URL = /\/production\/work-orders\/(\d+|[^/]*WOR-\d{4,6}-\d{5})(\?.*)?$/;

/** パスに「法人コードの無い書類番号」（旧番号・番号だけ）の区切りがあるか。 */
const BARE_DOC_SEGMENT = /\/[A-Z]{2,4}-\d{4,6}-\d{5}(-\d{2})?(\/|$)/;

/**
 * `page.goto` と同じ。ただし**旧番号の URL に付けたクエリを落とさない**。
 *
 * 旧番号・番号だけの URL（`/sales/quotes/QOT-202607-00001?tab=pdf`）は詳細ページが
 * 正規の URL へ送るが、その転送は**クエリを運ばない**（ページはパスしか知らない）。
 * そのままだと `?tab=…` 付きで撮りたい画面が既定のタブで開く。転送で落ちたときは、
 * 着いた先のパスに元のクエリを付けて開き直す。
 *
 * それ以外の URL では `page.goto` そのもの（開き直さない）。
 */
export async function gotoDoc(
  page: Page,
  url: string,
  options?: Parameters<Page["goto"]>[1],
): Promise<Response | null> {
  const res = await page.goto(url, options);
  let wanted: URL;
  let got: URL;
  try {
    got = new URL(page.url());
    wanted = new URL(url, got);
  } catch {
    return res;
  }
  if (
    (wanted.search || wanted.hash) &&
    BARE_DOC_SEGMENT.test(wanted.pathname) &&
    got.pathname !== wanted.pathname &&
    got.pathname !== "/login" &&
    !got.pathname.startsWith("/doc/choose") &&
    !got.search
  ) {
    return page.goto(
      `${got.origin}${got.pathname}${wanted.search}${wanted.hash}`,
      options,
    );
  }
  return res;
}
