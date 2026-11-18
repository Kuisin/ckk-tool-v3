/**
 * customer-product-code-core.ts — 顧客専用の製品コード（製品 × 顧客の別名）を
 * 読み取り文字列に当てる。純ロジック・client-safe（DB を触らない）。
 *
 * 相手は**自分の品番で**注文を出す。こちらの製品コードも製品名も相手の書類には
 * 出てこないので、これまで注文書の突合は品名の表記ゆれ（products.match_names）
 * に頼るしかなかった。品名は揺れるが**品番は揺れない** — 顧客が確定している
 * 注文書では、この表が最も確かな手がかりになる。
 *
 * だから突合の順序は **顧客専用コード → 自社コード → 学習エイリアス → 推測**。
 * 学習エイリアス（match_aliases）より先なのは、あちらが「過去にこう直された」
 * という実績からの推測なのに対し、こちらは人がマスタに登録した**事実**だから。
 *
 * ★ **曖昧なら当てない。** 同じ段で 2 つ以上の製品に当たったら null を返す。
 *   (customer_bp_id, code) は DB で一意なので主品番同士は衝突しないが、
 *   追加表記（aliases）と正規化（記号・全半角を均す）は衝突し得る。
 *   ここで黙って片方を選ぶと、誤った製品が指示書・出荷まで流れる。
 */

import { productMatchKey } from "./product-match";

/** 顧客 1 人ぶんの対応表の 1 行（DB 行から必要な列だけを写したもの）。 */
export interface CustomerProductCodeEntry {
  /** 指す製品の**品目 id**（`app.items.id` / itemType = PRODUCT）。 */
  itemId: number;
  /** 顧客の品番（印字・検索・突合の主表記）。 */
  code: string;
  /** 顧客がその製品を呼ぶ品名（印字に併記する）。null = 併記しない。 */
  name?: string | null;
  /** 旧品番など、突合にだけ使う追加の表記。 */
  aliases?: readonly string[] | null;
}

/** どの表記で当たったか。`via` は監査行と画面の説明に出す。 */
export interface CustomerProductCodeHit {
  /** 当たった製品の**品目 id**（`app.items.id`）。 */
  itemId: number;
  /** 当たった**登録側**の表記（読み取り側ではない）。 */
  matchedKey: string;
  via: "code" | "alias" | "name";
  confidence: "exact" | "normalized";
}

/**
 * 正規化して当てにいってよい最小の長さ。
 *
 * 品番は 2 文字（`A1`）もあり得るので短く取るが、**品名は 4 文字**を要求する
 * — 顧客品名は「カッター」のような共通部分を持つことがあり、短い一致で自動
 * 確定させると別の製品を掴む（products の突合が MIN_LEN=4 を置いているのと
 * 同じ理由）。
 */
const MIN_CODE_LEN = 2;
const MIN_NAME_LEN = 4;

type Kind = CustomerProductCodeHit["via"];

interface Key {
  itemId: number;
  raw: string;
  via: Kind;
}

/** 突合に使う登録側の表記を、優先順（品番 → 追加表記 → 品名）に並べて取り出す。 */
function entryKeys(e: CustomerProductCodeEntry): Key[] {
  const out: Key[] = [];
  const push = (raw: string | null | undefined, via: Kind) => {
    const v = raw?.trim();
    if (v) out.push({ itemId: e.itemId, raw: v, via });
  };
  push(e.code, "code");
  for (const a of e.aliases ?? []) push(a, "alias");
  push(e.name, "name");
  return out;
}

function minLenFor(via: Kind): number {
  return via === "name" ? MIN_NAME_LEN : MIN_CODE_LEN;
}

/**
 * 同じ段に当たった候補を 1 件へ畳む。**別の製品に割れていたら当てない**
 * （同じ製品の別表記に複数当たるのは構わない — 結果は同じ製品）。
 */
function resolve(
  hits: Key[],
  confidence: CustomerProductCodeHit["confidence"],
): CustomerProductCodeHit | null {
  if (hits.length === 0) return null;
  const items = new Set(hits.map((h) => h.itemId));
  if (items.size > 1) return null;
  // 同じ製品なら優先順（code → alias → name）の先頭を採る。
  const order: Kind[] = ["code", "alias", "name"];
  const best = hits.reduce((a, b) =>
    order.indexOf(b.via) < order.indexOf(a.via) ? b : a,
  );
  return {
    itemId: best.itemId,
    matchedKey: best.raw,
    via: best.via,
    confidence,
  };
}

/**
 * 読み取った文字列（品番欄・品名欄のどちらでもよい）を顧客の対応表に当てる。
 *
 * `reads` は**具体的な順**に渡す（品番欄 → 品名欄）。段は 2 つだけ:
 *   exact      … 前後の空白を落としただけで一致
 *   normalized … productMatchKey（NFKC・大文字化・記号と空白の除去・かな寄せ・
 *                寸法区切りの吸収）を通して一致
 * 前方一致・部分一致は**置かない** — 品番の部分一致は別の品番に当たる
 * （`A-1000` と `A-10` のような関係が普通にある）。
 */
export function matchCustomerProductCode(
  reads: readonly (string | null | undefined)[],
  entries: readonly CustomerProductCodeEntry[],
): CustomerProductCodeHit | null {
  const keys = entries.flatMap(entryKeys);
  if (keys.length === 0) return null;

  const texts = reads
    .map((r) => r?.trim())
    .filter((r): r is string => !!r)
    // 同じ文字列を 2 度当てない（品番欄と品名欄に同じものが入っていることがある）。
    .filter((r, i, a) => a.indexOf(r) === i);

  for (const text of texts) {
    const exact = keys.filter(
      (k) => k.raw.length >= minLenFor(k.via) && k.raw === text,
    );
    const hit = resolve(exact, "exact");
    if (hit) return hit;
  }

  for (const text of texts) {
    const read = productMatchKey(text);
    if (!read) continue;
    const normalized = keys.filter((k) => {
      const key = productMatchKey(k.raw);
      return key.length >= minLenFor(k.via) && key === read;
    });
    const hit = resolve(normalized, "normalized");
    if (hit) return hit;
  }

  return null;
}

/**
 * 相手に出す書類（納品書・請求書）の品名欄に刷る文字列。
 *
 * **自社の品名は必ず残す** — 相手の品番だけにすると、こちら側で問い合わせを
 * 受けたときに何の製品か分からない。顧客の表記は括弧で添える形にする。
 * 登録が無い顧客・製品では従来どおり自社の品名だけが出る（既存書類の
 * 見た目は変わらない）。
 *
 * `aliases` は使わない（旧品番を刷ると、どちらが現行か読めなくなる）。
 */
export function customerFacingProductLabel(
  ownName: string,
  entry: Pick<CustomerProductCodeEntry, "code" | "name"> | null | undefined,
): string {
  const parts = [entry?.name?.trim(), entry?.code?.trim()].filter(
    (v): v is string => !!v,
  );
  if (parts.length === 0) return ownName;
  const own = ownName.trim();
  // 顧客品名が自社品名と同じなら重ねない（括弧の中に同じ語が並ぶのを避ける）。
  const shown = parts.filter((p) => p !== own);
  if (shown.length === 0) return own;
  return own ? `${own}（${shown.join(" ")}）` : shown.join(" ");
}
