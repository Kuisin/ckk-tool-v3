/**
 * scan.mjs — 未翻訳の日本語リテラルを数える（nextjs-web / nextjs-kiosk 共通）。
 *
 * 翻訳の移行は 1 回では終わらない（対象は約 7,500 文字列・640 ファイル）。
 * 途中で止まっていること自体は問題ではない — CLAUDE.md の約束どおり、
 * 移していない画面は日本語のまま**壊れずに**動く。困るのは
 * **後戻り**（移行済みの画面に新しい直書きが増える）なので、この道具は
 * 「全部消えたか」ではなく「増えていないか」を見るために作ってある。
 * 判定は tools/i18n/baseline.json との差分（ratchet）で、使い方は
 * tools/i18n/README.md。
 *
 * ■ 何を「未翻訳」と数えるか
 * 画面に出る日本語だけ。次は数えない（数えると本当の残りが見えなくなる）:
 *   - コメント               … 開発者向けの文書。ja が原文（_specs/i18n-glossary.md §1）
 *   - `ja:`/`en:`/`zh:` の値 … Record<Locale, string> の原文とその訳
 *   - 日本語のオブジェクトキー … 単位 `本:` のような**値**であって文言ではない
 *   - テスト                 … 期待値であって画面ではない
 *   - 明示除外               … i18n-ignore コメント / 除外パス
 *
 * ■ なぜ tsc の AST ではなく自前の走査か
 * 見たいのは「文字列リテラルの位置」だけで、型解決は要らない。TypeScript を
 * 実行時依存に足すより、コメントと文字列を 1 パスで分ける小さな字句解析で足りる
 * （_specs/techstack.md の依存方針 — 入れる前に相談し、自前で書けるものは書く）。
 */

import fs from "node:fs";
import path from "node:path";

/** ひらがな・カタカナ・漢字。半角記号や英数字は含めない。 */
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

/** 文字列リテラルのエスケープ → 実際の文字（表に無いものはその文字自身）。 */
const ESCAPES = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  v: "\v",
  0: "\0",
};

/** この行が来たら次の行の検出を 1 つ黙らせる（意図的な直書きの逃げ道）。 */
const IGNORE_LINE = /i18n-ignore/;

/**
 * 走査から丸ごと外すパス。**画面に出ないもの**だけを入れること —
 * 「まだ訳していないから」で除外すると、残りの見積もりが狂う。
 */
const EXCLUDED = [
  /\/node_modules\//,
  /\/\.next\//,
  /\/\.source\//,
  /\.test\.tsx?$/, // 期待値であって画面ではない
  /\.spec\.tsx?$/,
  /\/__tests__\//,
  /\/preview\//, // design-preview 用の複製（_specs/design.md §6）
  /\/ComponentCatalog\.tsx$/,
  // 辞書そのもの。ここの日本語は**原文**であって未翻訳ではない
  // （キオスクの in-house 辞書 — ja.ts の隣に en.ts / zh.ts が揃っている）。
  /\/lib\/i18n\/messages\//,
  // 生成した ja 鍵の対訳表（tools/i18n/build-dictionary.mjs の出力）。
  // 鍵が日本語・値が訳なので、走査すると自分の辞書を「未翻訳」と数える。
  /\/lib\/ui-dictionary\//,
  // 画面確認用の見本データ。「田中 太郎」「株式会社ABC製作所」のような
  // **架空の取引先名・人名**で、DB に入るデータと同じ扱い = 訳す対象ではない
  // （_specs/i18n-glossary.md §1）。mock.ts 自身が "preview only" と書いている。
  /\/mock\.ts$/,
  /\/fixtures\.ts$/,
  /\/display-sample\.ts$/,
];

/**
 * 日本語が **ja の原文であると同時に内部キー** になっているファイル。
 *
 * `app-list.ts` の `label: "見積書"` は表示名でもあり、`APP_LABEL_I18N` を
 * 引くキーでもあり、`CATEGORY_COLORS` のキーでもある。だからベタ書きが正しく、
 * 走査では「訳が別ファイルにある」ことを判定できない（`ja:` のような目印が
 * 無い）。ここに挙げたファイルは丸ごと数えない。
 *
 * **除外して良いのは、対訳の抜けを別のテストが落とすときだけ。**
 * テストの無いファイルをここに足さないこと — 検出も保証も無くなり、静かに
 * 未翻訳が増える。現状の担保:
 *   app-list.ts       → src/lib/app-list.test.ts（全アプリ・全カテゴリに en/zh）
 *   operation-codes.ts → src/lib/operation-codes.i18n.test.ts
 *                        （全コードが en/zh で日本語のまま返らない）
 *
 * enum-labels.ts / permission-labels.ts / privileged-operations.ts /
 * StatusBadge.tsx はここに要らない。値の隣に `ja:` `en:` `zh:` が並ぶ形なので、
 * ロケールキーの判定（isLocaleValue）だけで 0 件になる。
 */
const SOURCE_LABEL_FILES = [
  /\/lib\/app-list\.ts$/,
  /\/lib\/operation-codes\.ts$/,
];

/**
 * コメントと文字列を分ける 1 パスの字句解析。
 *
 * 正規表現でコメントを消すやり方は URL の `//` や文字列の中の `/*` で壊れる。
 * 逆に文字列だけを拾うと、コメントに書かれた例文まで数えてしまう。両方を
 * 同時に追うので、状態機械にしてある。
 *
 * 返すのは「コードとして有効な文字列リテラル」と「JSX のテキスト」の位置。
 */
export function tokenize(source) {
  const strings = []; // { value, quote, start, line, keyPath }
  let i = 0;
  let line = 1;
  const n = source.length;
  // 直前の意味のあるトークン。正規表現リテラルと除算の区別に使う。
  let prevSignificant = "";
  /**
   * いま居るオブジェクトのキーの入れ子（`{ ja: { notes: "備考" } }` なら
   * ["ja","notes"]）。`Record<Locale, X>` の形——**文字列ごとではなく
   * オブジェクトごとに言語で分かれている**書き方（lib/pdf-labels.ts）を
   * 訳済みと判定するために要る。直前の `ja:` だけを見ていた頃は、この形の
   * 中国語 105 件が「未翻訳」に数えられていた。
   */
  const keyStack = [];
  let lastWord = "";
  let pendingKey = null;

  const at = (k) => (k < n ? source[k] : "");

  while (i < n) {
    const c = source[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }

    // 行コメント
    if (c === "/" && at(i + 1) === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    // ブロックコメント
    if (c === "/" && at(i + 1) === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && at(i + 1) === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    // 文字列 / テンプレートリテラル
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const start = i;
      const startLine = line;
      let value = "";
      i++;
      while (i < n) {
        const d = source[i];
        if (d === "\\") {
          // **エスケープは実際の文字へ復号する。** バックスラッシュを落として
          // 次の 1 文字をそのまま足すと、`"a\\nb"` の値が改行ではなく "anb" に
          // なり、`tr("…\\n…")` の鍵が辞書と一致しなくなる（実際に 2 件
          // 取りこぼした）。実行時の JS 文字列と同じ値にするのが正。
          const esc = source[i + 1] ?? "";
          value += ESCAPES[esc] ?? esc;
          i += 2;
          continue;
        }
        if (d === quote) {
          i++;
          break;
        }
        // テンプレートの ${...} は式なので、中身は文字列として数えない。
        if (quote === "`" && d === "$" && at(i + 1) === "{") {
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") depth--;
            else if (source[i] === "\n") line++;
            i++;
          }
          continue;
        }
        if (d === "\n") line++;
        value += d;
        i++;
      }
      strings.push({
        value,
        quote,
        start,
        // 引用符を含むソース上の終端。**value の長さから計算してはいけない** —
        // `"^[A-Z]{2}-\\d{4}$"` のようにエスケープを含むと value は元より
        // 短くなり、置換が 1 文字ぶんずれて引用符が取り残される（実際に壊れた）。
        end: i,
        line: startLine,
        keyPath: [...keyStack],
      });
      pendingKey = value; // `"ja": {` のように文字列キーで書かれる場合
      prevSignificant = quote;
      continue;
    }

    // 正規表現リテラル（`/` の後ろが値を取り得ない位置なら除算）
    if (c === "/" && /[=(,:[!&|?{};+\-*%^~<>]|^$/.test(prevSignificant)) {
      i++;
      let inClass = false;
      while (i < n) {
        const d = source[i];
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) {
          i++;
          break;
        } else if (d === "\n") {
          line++;
          break;
        }
        i++;
      }
      prevSignificant = "/";
      continue;
    }

    // オブジェクトキーの追跡（`ja: {` / `"en": {`）。
    if (/[A-Za-z0-9_$]/.test(c)) {
      lastWord += c;
    } else {
      if (c === ":" && lastWord) pendingKey = lastWord;
      else if (c === ":" && pendingKey === null) pendingKey = null;
      if (c === "{") {
        keyStack.push(pendingKey);
        pendingKey = null;
      } else if (c === "}") {
        keyStack.pop();
      }
      if (!/\s/.test(c)) lastWord = "";
    }

    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }

  return strings;
}

/**
 * JSX のテキストノード（`<Text>保存</Text>` の「保存」）。
 *
 * 属性値・式・コメントの中は拾わないよう、タグの外側だけを見る素朴な走査に
 * している。文字列リテラルは tokenize が別に拾うので、ここは重複しない。
 */
export function jsxTextNodes(source) {
  const out = [];
  // コメントを先に落とす（コメント内の擬似 JSX を拾わないため）。
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ");

  const re = />([^<>{}]+)</g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const text = m[1];
    if (!JAPANESE.test(text)) continue;
    const trimmed = text.trim();
    if (!trimmed) continue;
    const line = stripped.slice(0, m.index).split("\n").length;
    out.push({ value: trimmed, line });
  }
  return out;
}

/**
 * 文字列・コメントを空白に潰した写し（改行は残す）。`isLocaleValue` /
 * `isTranslationCall` の「直前が何か」判定を、行をまたいでも安全に**無制限に
 * 遡れる**ようにするために使う。
 *
 * 以前はどちらも `source` の直前を固定の文字数（40 / 12）だけ見ていた。
 * Biome が長い呼び出しを複数行に整形すると
 * （`tr(\n              "…"`）改行とインデントですぐその文字数を超え、
 * 「訳を引いていない」と誤判定していた —
 * `tools/i18n/lib/codemod.mjs` で実際に起きた `tr(tr(tr("…")))` の多重包みと
 * 同じ根っこのバグで、走査側にも同じ形で潜んでいた（気づいた誤検出の分だけ
 * 「未翻訳」の数が実態より多く出ていた）。
 */
function maskForLookback(source) {
  const out = source.split("");
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const e = source.indexOf("\n", i);
      blank(i, e === -1 ? n : e);
      i = e === -1 ? n : e;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const e = source.indexOf("*/", i + 2);
      blank(i, e === -1 ? n : e + 2);
      i = e === -1 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === q) break;
        j++;
      }
      blank(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * `ja: "..."` / `en: "..."` / `zh: "..."` の右辺か。
 *
 * ja は原文、en/zh は**その訳**なので、どれも「未翻訳」ではない。
 * ja だけを除外していたとき、中国語の訳（`zh: "已确定"`）が漢字を含むために
 * 未翻訳として数えられ、翻訳済みの StatusBadge が 102 件の違反に見えていた。
 */
function isLocaleValue(masked, stringStart) {
  return /\b(?:ja|en|zh)\s*:\s*$/.test(masked.slice(0, stringStart));
}

/**
 * 囲っているオブジェクトのキーが言語コードか（`Record<Locale, X>` の形）。
 *
 * `const COMMON: Record<Locale, Labels> = { ja: { notes: "備考" },
 *  en: { notes: "Notes" }, zh: { notes: "备注" } }` — 言語で分かれているのは
 * **文字列ではなくオブジェクト**なので、直前の `ja:` を見るだけでは判らない。
 * lib/pdf-labels.ts がこの形。
 */
function isInsideLocaleBlock(keyPath) {
  return keyPath.some((k) => k === "ja" || k === "en" || k === "zh");
}

/**
 * `tr("…")` / `translate("…", …)` の引数か = **既に訳を引いている**。
 *
 * ja 鍵の対訳（src/lib/ui-text.ts）では日本語がそのまま鍵なので、包んだ後も
 * ソースには日本語が残る。ここを数えると移行しても残数が減らず、ratchet が
 * 働かない。
 *
 * 「鍵が辞書に有るか」はここでは見ない — それは i18n-verify-keys.mjs の仕事。
 * 走査は「包まれているか」だけを見る。
 */
function isTranslationCall(masked, stringStart) {
  return /\b(?:tr|translate)\(\s*$/.test(masked.slice(0, stringStart));
}

/** 日本語のオブジェクトキー（`本: {...}`, `"本": {...}`）— 値であって文言ではない。 */
function isObjectKey(source, stringStart, raw) {
  const after = source.slice(
    stringStart + raw.length + 2,
    stringStart + raw.length + 6,
  );
  return /^\s*:/.test(after);
}

/** その行が i18n-ignore で明示的に黙らされているか。 */
function isIgnored(lines, lineNo) {
  const cur = lines[lineNo - 1] ?? "";
  const prev = lines[lineNo - 2] ?? "";
  return IGNORE_LINE.test(cur) || IGNORE_LINE.test(prev);
}

/** 1 ファイルを走査して、未翻訳の日本語文字列を返す。 */
export function scanFile(filePath, source) {
  const lines = source.split("\n");
  const findings = [];
  const masked = maskForLookback(source);

  for (const s of tokenize(source)) {
    if (!JAPANESE.test(s.value)) continue;
    if (isLocaleValue(masked, s.start)) continue;
    if (isInsideLocaleBlock(s.keyPath ?? [])) continue;
    if (isTranslationCall(masked, s.start)) continue;
    if (isObjectKey(source, s.start, s.value)) continue;
    if (isIgnored(lines, s.line)) continue;
    findings.push({
      file: filePath,
      line: s.line,
      text: s.value.trim(),
      // テンプレートリテラルは `${...}` を挟んだ**文の断片**（「第」+「承認」）に
      // なる。断片を辞書の鍵にすると語順が言語で変わって壊れるので、ja 鍵の
      // 対訳ではなく next-intl の変数付きキーへ移す対象として区別する
      // （用語集 §2.6「文を連結しない」）。
      kind: s.quote === "`" ? "template" : "string",
    });
  }

  for (const t of jsxTextNodes(source)) {
    if (isIgnored(lines, t.line)) continue;
    findings.push({ file: filePath, line: t.line, text: t.value, kind: "jsx" });
  }

  return findings;
}

/** ディレクトリを再帰的に走査。返り値は findings の配列。 */
export function scanDir(root, { extensions = [".ts", ".tsx"] } = {}) {
  const findings = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (EXCLUDED.some((re) => re.test(full))) continue;
      if (SOURCE_LABEL_FILES.some((re) => re.test(full))) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      const source = fs.readFileSync(full, "utf8");
      findings.push(...scanFile(full, source));
    }
  };

  walk(root);
  return findings;
}

export { JAPANESE, SOURCE_LABEL_FILES, EXCLUDED };
