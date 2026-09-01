/**
 * template.mjs — 変数入りのテンプレートリテラルを「1 つの鍵 + 名前つきの穴」に直す。
 *
 *   `承認（この段の残り ${acted.remaining} 名）`
 *     → 鍵  "承認（この段の残り {remaining} 名）"
 *     → 値  { remaining: acted.remaining }
 *
 * ■ なぜ連結ではなく 1 つの鍵にするか
 * `"承認（この段の残り " + n + " 名）"` のように切ると、**語順が言語で変わる文を
 * 表現できない**（英語では数が先に来たり、単位が後ろに付いたりする）。文まるごとを
 * 鍵にして穴だけ空けておけば、訳す側が語順を自由に組める。用語集 §2.6 の
 * 「文を連結しない。1 文 = 1 キー + 変数」がこれ。
 *
 * ■ 穴の名前は式から導く
 * §2.6 は「変数名は意味を表す英語」と言っている。`${acted.remaining}` のような
 * 素直な式からは最後の識別子（`remaining`）が取れるので、それを使う。取れない式
 * （関数呼び出し・三項など）だけ `v0` `v1` に落とす。全部を通し番号にすると訳す側が
 * 何の値か分からなくなるので、取れるものは取る。
 *
 * 抽出（訳す語を出す）と codemod（コードを書き換える）が**同じ鍵**を作らないと
 * 辞書と一致しないので、その 1 箇所をここに置いている。
 */

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

/** 式から穴の名前を導く。素直な識別子・プロパティ参照だけ拾う。 */
function nameFor(expr, index, used) {
  const trimmed = expr.trim();
  let base = null;
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) base = trimmed;
  else {
    // `a.b.c` / `a?.b` の末尾、`a.b ?? "…"` の左辺なども拾う
    const m = trimmed.match(/^([A-Za-z_$][\w$]*\??\.)+([A-Za-z_$][\w$]*)\s*$/);
    if (m) base = m[2];
  }
  if (base) {
    // 予約語っぽい/短すぎるものは避ける
    if (/^(?:v\d+|length|value)$/.test(base)) base = null;
  }
  let name = base ?? `v${index}`;
  let n = 2;
  while (used.has(name)) name = `${base ?? `v${index}`}${n++}`;
  used.add(name);
  return name;
}

/**
 * テンプレートリテラルの中身（バッククォートを除いた本体）を分解する。
 * 返り値 `{ key, slots }`。日本語を含まない・穴が無いものは null。
 */
export function parseTemplateBody(body) {
  const slots = [];
  const used = new Set();
  let key = "";
  let i = 0;

  while (i < body.length) {
    if (body[i] === "\\") {
      key += body[i] + (body[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (body[i] === "$" && body[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      for (; j < body.length && depth > 0; j++) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
      }
      const expr = body.slice(i + 2, j - 1);
      const name = nameFor(expr, slots.length, used);
      slots.push({ name, expr });
      key += `{${name}}`;
      i = j;
      continue;
    }
    key += body[i];
    i++;
  }

  if (slots.length === 0) return null;

  // 画面の文ではないものを外す。
  //
  // ・**コメントの中だけが日本語**のもの … `WorkOrderStripSheets.tsx` の
  //   インライン CSS のように、`/* ページサイズは必ず「長さ」で書く */` を
  //   含む数十行のスタイル塊。訳す対象ではない（用語集 §1）。
  // ・**長すぎるもの** … 画面の文は 1 文で収まる。CSS/HTML の塊を鍵にすると
  //   辞書が読めなくなるうえ、少し直っただけで鍵が変わって訳が外れる。
  const withoutComments = key
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  if (!JAPANESE.test(withoutComments)) return null;
  if (key.length > 300) return null;

  // サーバーログ（`[intake] …` `[mailer] …`）は画面に出ない。
  if (/^\[[a-z][a-z-]*\]/.test(key)) return null;
  // HTML の断片（PDF の組み立て）。中の文言は帳票側の仕組みで訳す
  // （`lib/pdf-labels.ts` — 受取先の言語で出すため閲覧者の locale では決まらない）。
  if (/<\/?[a-zA-Z][^>]*>/.test(key)) return null;

  return { key, slots };
}

/**
 * ソースからテンプレートリテラルを 1 つずつ取り出す。
 * 返り値は `{ start, end, body }`（start/end はバッククォートを含む）。
 *
 * 入れ子のテンプレート（`${ `…` }`）は扱わない — 対象に 1 件も無いので、
 * 対応するより**見つけたら飛ばす**ほうが安全（黙って壊すより出ないほうがよい）。
 */
export function findTemplates(source) {
  const out = [];
  let i = 0;
  const n = source.length;
  let prev = "";

  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const e = source.indexOf("\n", i);
      i = e === -1 ? n : e;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const e = source.indexOf("*/", i + 2);
      i = e === -1 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < n) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i] === q) { i++; break; }
        i++;
      }
      prev = q;
      continue;
    }
    if (c === "`") {
      const start = i;
      i++;
      let nested = false;
      let body = "";
      while (i < n) {
        if (source[i] === "\\") { body += source[i] + (source[i + 1] ?? ""); i += 2; continue; }
        if (source[i] === "`") { i++; break; }
        if (source[i] === "$" && source[i + 1] === "{") {
          let depth = 1;
          let j = i + 2;
          for (; j < n && depth > 0; j++) {
            if (source[j] === "`") nested = true;
            else if (source[j] === "{") depth++;
            else if (source[j] === "}") depth--;
          }
          body += source.slice(i, j);
          i = j;
          continue;
        }
        body += source[i];
        i++;
      }
      if (!nested) out.push({ start, end: i, body });
      prev = "`";
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}
