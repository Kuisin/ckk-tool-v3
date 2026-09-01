/**
 * codemod.mjs — 日本語のリテラルを `tr("…")` に包む。
 *
 * 辞書（ja→en/zh）は先にできているので、ここでやるのは
 * 「その場所を訳が通る形にする」だけ。**辞書に載っている語しか触らない** —
 * 未訳の語を巻き込んで壊さないための最初の防具。
 *
 * ■ フックをどこに入れるかが唯一の難所
 * `const tr = useTr()` は **コンポーネントの直下**でなければならない。
 * 素朴に「一番内側の関数」へ入れると
 *
 *     items.map((n) => ({ label: "件" }))     ← ここに useTr() を入れると
 *                                                コールバックの中でフックを
 *                                                呼ぶことになり実行時に壊れる
 *
 * になる。なので置換位置から**外側へ辿り、モジュール直下にある関数**（＝
 * コンポーネント）まで上がってそこに入れる。lint では拾いきれない類の壊れ方
 * なので、判定はここに閉じ込めてある。
 *
 * ■ 触らないもの
 *   - テンプレートリテラル … `${}` を挟む文は語順が言語で変わる（用語集 §2.6）
 *   - オブジェクトのキー   … 値であって文言ではない
 *   - import / export 文  … モジュール指定子
 *   - コメント             … tokenize が最初から返さない
 */

import { tokenize } from "./scan.mjs";

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

/** 文字列・コメントを空白に潰した写し。括弧の対応を数えるのに使う。 */
function maskLiterals(source) {
  const out = source.split("");
  let i = 0;
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++)
      if (out[k] !== "\n") out[k] = " ";
  };
  let prev = "";
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      blank(i, end === -1 ? n : end);
      i = end === -1 ? n : end;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      blank(i, end === -1 ? n : end + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) break;
        j++;
      }
      blank(i, Math.min(j + 1, n));
      i = j + 1;
      prev = quote;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.join("");
}

/**
 * `{` … `}` の対応表。返すのは [openIndex, closeIndex] の配列（開き順）。
 */
function bracePairs(masked) {
  const pairs = [];
  const stack = [];
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "{") stack.push(i);
    else if (masked[i] === "}") {
      const open = stack.pop();
      if (open !== undefined) pairs.push([open, i]);
    }
  }
  return pairs;
}

/** その `{` が関数本体の開きか（直前が `)` か `=>`）。 */
function isFunctionBody(masked, open) {
  const before = masked.slice(Math.max(0, open - 400), open).trimEnd();
  return before.endsWith(")") || before.endsWith("=>");
}

/**
 * その関数本体が `async` の関数のものか。
 *
 * サーバー側の入口は `const tr = await getTr()` なので、**async でない関数には
 * 入れられない**（構文エラーになる）。引数リストの手前まで戻って `async` を探す。
 */
function isAsyncBody(masked, open) {
  const head = masked.slice(Math.max(0, open - 600), open);
  const paren = head.lastIndexOf("(");
  if (paren < 0) return /\basync\s*$/.test(head);
  return /\basync\b[^()]*$/.test(head.slice(0, paren));
}

/**
 * その関数本体が **React コンポーネント（または自前フック）** のものか。
 *
 * モジュール直下にあっても、`notifyResult(...)` や `label(t)` のような
 * ただの補助関数はコンポーネントではない。そこへ `useTr()` を入れると
 * 「フックをコンポーネント以外から呼ぶ」ことになり実行時に壊れる
 * （実際に 3 ファイルでやってしまい、Biome の useHookAtTopLevel が拾った）。
 *
 * 判定は React の慣習どおり **名前が大文字で始まる / `use` で始まる**。
 * 弾かれた関数は `tr` を引数で受ける形に人が直す（lib/format.ts の
 * Formatters と同じ約束）。
 */
function isComponentLike(masked, open) {
  const head = masked.slice(Math.max(0, open - 600), open);
  const m = head.match(
    /(?:function\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)\s*[=(][^=]*$/,
  );
  const name = m?.[1];
  if (!name) return true; // 名前が読めないときは既定どおり入れる（型検査が拾う）
  return /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
}

/**
 * 置換位置を含む、**モジュール直下**の関数本体を探す。
 * 見つからなければ null（= コンポーネントの外なので包まない）。
 */
function componentBodyFor(pairs, masked, pos) {
  const containing = pairs
    .filter(([o, c]) => o < pos && pos < c && isFunctionBody(masked, o))
    .sort((a, b) => a[0] - b[0]); // 外側が先
  for (const [open, close] of containing) {
    const enclosingCount = pairs.filter(
      ([o, c]) => o < open && close < c,
    ).length;
    if (enclosingCount === 0) return open;
  }
  return null;
}

/** import / export のモジュール指定子の中か。 */
function isModuleSpecifier(source, start) {
  const lineStart = source.lastIndexOf("\n", start) + 1;
  const line = source.slice(lineStart, start);
  return /^\s*(?:import|export)\b/.test(line) || /\bfrom\s*$/.test(line);
}

/** 直後が `:` = オブジェクトのキー。 */
function isKey(source, end) {
  return /^\s*:/.test(source.slice(end, end + 4));
}

/**
 * 1 ファイルを変換する。
 * 返り値 `{ code, changed, needsHook }` — `needsHook` は
 * `const tr = ...` を足すべき関数本体の開き位置の集合（呼び出し側が使う）。
 */
export function transform(source, dict, { accessor, requireAsync = false } = {}) {
  const edits = [];
  const masked = maskLiterals(source);
  const pairs = bracePairs(masked);

  // ① 文字列リテラル
  for (const t of tokenize(source)) {
    if (t.quote === "`") continue; // テンプレートは ICU 行き
    if (!JAPANESE.test(t.value)) continue;
    if (!Object.hasOwn(dict, t.value)) continue;
    const end = t.end; // tokenize が記録したソース上の終端（エスケープに強い）
    if (isKey(source, end)) continue;
    if (isModuleSpecifier(source, t.start)) continue;
    // すでに tr("…") になっている
    if (/\btr\(\s*$/.test(source.slice(Math.max(0, t.start - 6), t.start)))
      continue;
    // JSX の属性値（`label="顧客"`）は式なので波括弧が要る:
    //   label="顧客"  →  label={tr("顧客")}
    // 見分けは「`=` の直後に空白なく引用符が来る」— Biome が整形しているので
    // 代入（`const a = "…"`）は必ず `= ` と空く。波括弧を忘れると
    // `label=tr("顧客")` になり TSX が構文エラーになる（実際になった）。
    const jsxAttr = source[t.start - 1] === "=";
    const call = `tr(${JSON.stringify(t.value)})`;
    edits.push({
      start: t.start,
      end,
      text: jsxAttr ? `{${call}}` : call,
      pos: t.start,
    });
  }

  // ② JSX のテキストノード
  const jsxRe = />([^<>{}]+)</g;
  let m;
  while ((m = jsxRe.exec(masked)) !== null) {
    const raw = source.slice(m.index + 1, m.index + 1 + m[1].length);
    const text = raw.trim();
    if (!JAPANESE.test(text) || !Object.hasOwn(dict, text)) continue;
    const lead = raw.length - raw.trimStart().length;
    const start = m.index + 1 + lead;
    edits.push({
      start,
      end: start + text.length,
      text: `{tr(${JSON.stringify(text)})}`,
      pos: start,
    });
  }

  if (edits.length === 0)
    return { code: source, changed: false, hooked: 0, replaced: 0 };

  // フックを入れるコンポーネント本体。置換位置から**外側へ**辿って求める。
  //
  // コンポーネントの外（モジュール直下の定数・素の関数）にある文言は
  // **包まない**。`tr` を置ける場所が無いので、包むと未定義参照になる。
  // それらは locale を引数で受ける形にするか、呼び出し側の画面で訳す —
  // どちらも機械的には決められないので人が見る（`outside` で数える）。
  const bodies = new Set();
  const inside = [];
  let outside = 0;
  for (const e of edits) {
    const body = componentBodyFor(pairs, masked, e.pos);
    if (body === null) {
      outside++;
      continue;
    }
    // コンポーネントでない素の関数にフックは置けない。
    if (!requireAsync && !isComponentLike(masked, body)) {
      outside++;
      continue;
    }
    // サーバー側は async でない関数に `await getTr()` を置けない。
    if (requireAsync && !isAsyncBody(masked, body)) {
      outside++;
      continue;
    }
    bodies.add(body);
    inside.push(e);
  }
  edits.length = 0;
  edits.push(...inside);
  if (edits.length === 0)
    return { code: source, changed: false, hooked: 0, replaced: 0, outside };

  const replaced = edits.length;

  for (const open of bodies) {
    const close = pairs.find(([o]) => o === open)?.[1] ?? source.length;
    // 既に tr を持っている（前回の適用・手書き）ならもう足さない。
    if (/\bconst\s+tr\s*=/.test(masked.slice(open, close))) continue;
    edits.push({
      start: open + 1,
      end: open + 1,
      text: `\n  ${accessor ?? "const tr = useTr();"}`,
      pos: open,
    });
  }

  // 後ろから当てる（前の編集で位置がずれないように）
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let code = source;
  for (const e of edits)
    code = code.slice(0, e.start) + e.text + code.slice(e.end);

  return { code, changed: true, hooked: bodies.size, replaced, outside };
}
