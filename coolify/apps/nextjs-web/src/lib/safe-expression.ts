/**
 * safe-expression.ts — 価格試算の計算基準（管理者が書く式）を評価する、
 * `new Function` を使わない小さな式言語（監査 C2）。
 *
 * ■ なぜ `new Function` をやめたのか
 * 以前の trial-pricing-script.ts は危険なグローバルを引数名で覆い隠す
 * 「便宜上のサンドボックス」で、`({}).constructor.constructor("return process")()`
 * の 1 行で process.env が読めた。式は system:UPDATE を持つ人が書き、
 * **価格表や価格試算を開いた全員のリクエストでサーバー側に評価される**ので、
 * 管理者 1 人の権限がそのまま Web コンテナの RCE になっていた。
 * SY0G（特権アクセス）が二人承認を要求する操作も、ここを通れば素通りだった。
 *
 * ■ 何ができるか（既定の計算基準 DEFAULT_CRITERIA が使っているものだけ）
 *   リテラル       数値 / 文字列（'…' "…"）/ true false null undefined
 *   識別子         評価時に渡された scope（入力値・係数・ヘルパー）だけを引く。
 *                  無い名前は undefined（typeof process === 'undefined' が成り立つ）
 *   演算子         + - * / %  ! 単項 -/+  typeof  比較  == != === !==
 *                  && || ??  三項 ?:  カンマ（値は右）  括弧
 *   メンバ参照      obj.name / obj?.name / obj["name"] — **自身のプロパティだけ**
 *                  （Object.hasOwn）。__proto__ / constructor / prototype は常に拒否
 *   関数呼び出し    scope から引けた**ホストの関数**だけ（round / lookupMatrix …
 *                  と、Math.max / Number(…) のような SAFE_BUILTINS）。関数は
 *                  scope（ホスト）にしか無い — 入力データは JSON なので関数を
 *                  含まない。即時関数・new は構文エラー
 *   コメント       行コメント（//）とブロックコメント
 *
 * ■ 何ができないか
 *   function / => / this / new / 代入 / テンプレート文字列 / 正規表現 /
 *   ブロック / return。式は 1 つの値を返す「式」であって「プログラム」ではない。
 *
 * 純粋・同型（ブラウザのプレビューとサーバーの両方で同じ結果）。依存なし。
 */

// ─── トークナイザ ────────────────────────────────────────────────────────────

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "str"; value: string; pos: number }
  | { kind: "ident"; value: string; pos: number }
  | { kind: "punct"; value: string; pos: number }
  | { kind: "eof"; pos: number };

const PUNCTUATORS = [
  "?.",
  "===",
  "!==",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "(",
  ")",
  "[",
  "]",
  ",",
  ".",
  "?",
  ":",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "<",
  ">",
] as const;

const KEYWORD_LITERALS: Record<string, unknown> = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
};

/** 式の中に現れてはいけない語。出た時点で構文エラー（評価には進まない）。 */
const FORBIDDEN_WORDS = new Set([
  "function",
  "new",
  "this",
  "class",
  "return",
  "var",
  "let",
  "const",
  "import",
  "export",
  "eval",
  "arguments",
  "with",
  "delete",
  "void",
  "in",
  "instanceof",
  "yield",
  "async",
  "await",
]);

/** メンバ参照で常に拒否する名前（プロトタイプ連鎖への入口）。 */
const FORBIDDEN_PROPERTIES = new Set(["__proto__", "constructor", "prototype"]);

export class ExpressionSyntaxError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(`${message}（位置 ${pos}）`); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
    this.name = "ExpressionSyntaxError";
  }
}

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0)
        throw new ExpressionSyntaxError("コメントが閉じていません", i); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
      i = end + 2;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      const start = i;
      while (i < n && isDigit(src[i])) i++;
      if (src[i] === "." && isDigit(src[i + 1] ?? "")) {
        i++;
        while (i < n && isDigit(src[i])) i++;
      } else if (src[i] === "." && !isIdentStart(src[i + 1] ?? "")) {
        // `1.` のような末尾ドット
        i++;
      }
      if (src[i] === "e" || src[i] === "E") {
        let j = i + 1;
        if (src[j] === "+" || src[j] === "-") j++;
        if (isDigit(src[j] ?? "")) {
          i = j;
          while (i < n && isDigit(src[i])) i++;
        }
      }
      const text = src.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new ExpressionSyntaxError(`数値として読めません: ${text}`, start); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
      }
      out.push({ kind: "num", value, pos: start });
      continue;
    }
    if (c === "'" || c === '"') {
      const start = i;
      let j = i + 1;
      let value = "";
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") {
          const next = src[j + 1];
          if (next === undefined) break;
          value +=
            next === "n"
              ? "\n"
              : next === "t"
                ? "\t"
                : next === "r"
                  ? "\r"
                  : next;
          j += 2;
          continue;
        }
        if (src[j] === "\n") {
          throw new ExpressionSyntaxError(
            "文字列の途中で改行しています", // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
            start,
          );
        }
        value += src[j];
        j++;
      }
      if (src[j] !== c) {
        throw new ExpressionSyntaxError("文字列が閉じていません", start); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
      }
      out.push({ kind: "str", value, pos: start });
      i = j + 1;
      continue;
    }
    if (c === "`") {
      throw new ExpressionSyntaxError(
        "テンプレート文字列は使えません（'…' か \"…\" で書いてください）", // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
        i,
      );
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(src[i])) i++;
      const word = src.slice(start, i);
      if (FORBIDDEN_WORDS.has(word)) {
        throw new ExpressionSyntaxError(
          `「${word}」は式の中で使えません`, // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
          start,
        );
      }
      out.push({ kind: "ident", value: word, pos: start });
      continue;
    }
    const punct = PUNCTUATORS.find((p) => src.startsWith(p, i));
    if (punct) {
      out.push({ kind: "punct", value: punct, pos: i });
      i += punct.length;
      continue;
    }
    throw new ExpressionSyntaxError(`使えない文字です: ${c}`, i); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
  }
  out.push({ kind: "eof", pos: n });
  return out;
}

// ─── 構文木 ─────────────────────────────────────────────────────────────────

export type ExprNode =
  | { type: "lit"; value: unknown }
  | { type: "ident"; name: string }
  | { type: "member"; object: ExprNode; property: string; optional: boolean }
  | { type: "index"; object: ExprNode; index: ExprNode; optional: boolean }
  | { type: "call"; callee: ExprNode; args: ExprNode[] }
  | { type: "unary"; op: "!" | "-" | "+" | "typeof"; arg: ExprNode }
  | { type: "binary"; op: string; left: ExprNode; right: ExprNode }
  | { type: "logical"; op: "&&" | "||" | "??"; left: ExprNode; right: ExprNode }
  | { type: "cond"; test: ExprNode; then: ExprNode; else: ExprNode }
  | { type: "seq"; items: ExprNode[] };

/** ネストの上限。再帰下降なので深すぎる式でスタックを溢れさせない。 */
const MAX_DEPTH = 64;
/** 式の長さ上限（criterionSchema の 4000 と同じ）。 */
export const MAX_EXPRESSION_LENGTH = 4000;

class Parser {
  private i = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i];
  }
  private next(): Token {
    return this.tokens[this.i++];
  }
  private isPunct(value: string): boolean {
    const t = this.peek();
    return t.kind === "punct" && t.value === value;
  }
  private expectPunct(value: string): void {
    const t = this.next();
    if (t.kind !== "punct" || t.value !== value) {
      throw new ExpressionSyntaxError(`「${value}」が必要です`, t.pos); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
    }
  }
  private enter(): void {
    if (++this.depth > MAX_DEPTH) {
      throw new ExpressionSyntaxError("式が深すぎます", this.peek().pos); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
    }
  }
  private leave(): void {
    this.depth--;
  }

  parse(): ExprNode {
    const node = this.sequence();
    const t = this.peek();
    if (t.kind !== "eof") {
      throw new ExpressionSyntaxError("式の後ろに余分なものがあります", t.pos); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
    }
    return node;
  }

  /** `a, b, c` — 値は最後。既定の式が `(warn(...), value)` の形で使う。 */
  private sequence(): ExprNode {
    const first = this.conditional();
    if (!this.isPunct(",")) return first;
    const items = [first];
    while (this.isPunct(",")) {
      this.next();
      items.push(this.conditional());
    }
    return { type: "seq", items };
  }

  private conditional(): ExprNode {
    const test = this.nullish();
    if (!this.isPunct("?")) return test;
    this.enter();
    this.next();
    const then = this.conditional();
    this.expectPunct(":");
    const otherwise = this.conditional();
    this.leave();
    return { type: "cond", test, then, else: otherwise };
  }

  private nullish(): ExprNode {
    let left = this.or();
    while (this.isPunct("??")) {
      this.next();
      left = { type: "logical", op: "??", left, right: this.or() };
    }
    return left;
  }

  private or(): ExprNode {
    let left = this.and();
    while (this.isPunct("||")) {
      this.next();
      left = { type: "logical", op: "||", left, right: this.and() };
    }
    return left;
  }

  private and(): ExprNode {
    let left = this.equality();
    while (this.isPunct("&&")) {
      this.next();
      left = { type: "logical", op: "&&", left, right: this.equality() };
    }
    return left;
  }

  private binaryLevel(
    ops: readonly string[],
    operand: () => ExprNode,
  ): ExprNode {
    let left = operand();
    for (;;) {
      const t = this.peek();
      if (t.kind !== "punct" || !ops.includes(t.value)) return left;
      this.next();
      left = { type: "binary", op: t.value, left, right: operand() };
    }
  }

  private equality(): ExprNode {
    return this.binaryLevel(["===", "!==", "==", "!="], () =>
      this.relational(),
    );
  }
  private relational(): ExprNode {
    return this.binaryLevel(["<", "<=", ">", ">="], () => this.additive());
  }
  private additive(): ExprNode {
    return this.binaryLevel(["+", "-"], () => this.multiplicative());
  }
  private multiplicative(): ExprNode {
    return this.binaryLevel(["*", "/", "%"], () => this.unary());
  }

  private unary(): ExprNode {
    const t = this.peek();
    if (
      t.kind === "punct" &&
      (t.value === "!" || t.value === "-" || t.value === "+")
    ) {
      this.next();
      this.enter();
      const arg = this.unary();
      this.leave();
      return { type: "unary", op: t.value, arg };
    }
    if (t.kind === "ident" && t.value === "typeof") {
      this.next();
      this.enter();
      const arg = this.unary();
      this.leave();
      return { type: "unary", op: "typeof", arg };
    }
    return this.postfix();
  }

  private postfix(): ExprNode {
    let node = this.primary();
    for (;;) {
      if (this.isPunct(".") || this.isPunct("?.")) {
        const dot = this.next();
        const optional = dot.kind === "punct" && dot.value === "?.";
        if (optional && this.isPunct("[")) {
          this.next();
          const index = this.sequence();
          this.expectPunct("]");
          node = { type: "index", object: node, index, optional: true };
          continue;
        }
        const name = this.next();
        if (name.kind !== "ident") {
          throw new ExpressionSyntaxError("プロパティ名が必要です", name.pos); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
        }
        if (FORBIDDEN_PROPERTIES.has(name.value)) {
          throw new ExpressionSyntaxError(
            `「${name.value}」は参照できません`, // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
            name.pos,
          );
        }
        node = { type: "member", object: node, property: name.value, optional };
        continue;
      }
      if (this.isPunct("[")) {
        this.next();
        const index = this.sequence();
        this.expectPunct("]");
        node = { type: "index", object: node, index, optional: false };
        continue;
      }
      if (this.isPunct("(")) {
        const open = this.next();
        if (node.type !== "ident" && node.type !== "member") {
          throw new ExpressionSyntaxError(
            "呼び出せるのはヘルパー関数（round / lookup / Math.max など）だけです", // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
            open.pos,
          );
        }
        const args: ExprNode[] = [];
        if (!this.isPunct(")")) {
          for (;;) {
            args.push(this.conditional());
            if (this.isPunct(",")) {
              this.next();
              continue;
            }
            break;
          }
        }
        this.expectPunct(")");
        node = { type: "call", callee: node, args };
        continue;
      }
      return node;
    }
  }

  private primary(): ExprNode {
    const t = this.next();
    switch (t.kind) {
      case "num":
        return { type: "lit", value: t.value };
      case "str":
        return { type: "lit", value: t.value };
      case "ident":
        if (t.value in KEYWORD_LITERALS) {
          return { type: "lit", value: KEYWORD_LITERALS[t.value] };
        }
        return { type: "ident", name: t.value };
      case "punct":
        if (t.value === "(") {
          this.enter();
          const inner = this.sequence();
          this.leave();
          this.expectPunct(")");
          return inner;
        }
        throw new ExpressionSyntaxError(
          `予期しない記号です: ${t.value}`, // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
          t.pos,
        );
      case "eof":
        throw new ExpressionSyntaxError("式が途中で終わっています", t.pos); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
    }
  }
}

/** 式を構文木にする。構文エラーは ExpressionSyntaxError。 */
export function parseExpression(src: string): ExprNode {
  if (src.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionSyntaxError(
      `式が長すぎます（${MAX_EXPRESSION_LENGTH} 文字まで）`, // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
      0,
    );
  }
  const tokens = tokenize(src);
  if (tokens.length === 1) {
    throw new ExpressionSyntaxError("式が空です", 0); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
  }
  return new Parser(tokens).parse();
}

// ─── 評価 ───────────────────────────────────────────────────────────────────

/**
 * 式から使ってよい組み込み。値の変換と Math だけ — I/O も時刻も乱数も無い
 * （Math.random は外す: 価格試算は決定的でなければならない）。
 * Math は素のオブジェクトなので readProperty の「自身のプロパティ」規則で
 * そのまま読める（Math.constructor は禁止語で弾かれる）。
 */
export const SAFE_BUILTINS: Readonly<Record<string, unknown>> = Object.freeze({
  Number,
  String,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Math: Object.freeze(
    Object.fromEntries(
      Object.getOwnPropertyNames(Math)
        .filter((k) => k !== "random")
        .map((k) => [k, (Math as unknown as Record<string, unknown>)[k]]),
    ),
  ),
});

export type ExpressionScope = ReadonlyMap<string, unknown>;

function isPlainContainer(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * プロパティ参照。自身のプロパティだけを返す（プロトタイプ連鎖を辿らない）。
 * 配列と文字列の length だけは例外として読める（`lots.length` のため）。
 * 関数のプロパティは読ませない（ヘルパーは呼ぶものであって覗くものではない）。
 */
function readProperty(obj: unknown, key: string): unknown {
  if (FORBIDDEN_PROPERTIES.has(key)) return undefined;
  if (typeof obj === "string" || Array.isArray(obj)) {
    if (key === "length") return obj.length;
  }
  if (!isPlainContainer(obj)) return undefined;
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

function indexKey(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  throw new TypeError("添字は数値か文字列にしてください"); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
}

function evaluate(node: ExprNode, scope: ExpressionScope): unknown {
  switch (node.type) {
    case "lit":
      return node.value;
    case "ident":
      return scope.has(node.name) ? scope.get(node.name) : undefined;
    case "seq": {
      let last: unknown;
      for (const item of node.items) last = evaluate(item, scope);
      return last;
    }
    case "member": {
      const obj = evaluate(node.object, scope);
      if (obj === null || obj === undefined) {
        if (node.optional) return undefined;
        throw new TypeError(
          `「${node.property}」を読めません（値が ${obj === null ? "null" : "undefined"} です）`, // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
        );
      }
      return readProperty(obj, node.property);
    }
    case "index": {
      const obj = evaluate(node.object, scope);
      if (obj === null || obj === undefined) {
        if (node.optional) return undefined;
        throw new TypeError("添字で読めません（値が空です）"); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
      }
      return readProperty(obj, indexKey(evaluate(node.index, scope)));
    }
    case "call": {
      const fn = evaluate(node.callee, scope);
      if (typeof fn !== "function") {
        const label =
          node.callee.type === "ident"
            ? node.callee.name
            : node.callee.type === "member"
              ? node.callee.property
              : "?";
        throw new TypeError(`「${label}」は関数ではありません`); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
      }
      const args = node.args.map((a) => evaluate(a, scope));
      // this を渡さない（ヘルパーも Math.* も this に依存しない）
      return (fn as (...a: unknown[]) => unknown)(...args);
    }
    case "unary": {
      const v = evaluate(node.arg, scope);
      switch (node.op) {
        case "!":
          return !v;
        case "-":
          return -(v as number);
        case "+":
          return +(v as number);
        case "typeof":
          return typeof v;
      }
      break;
    }
    case "logical": {
      const left = evaluate(node.left, scope);
      switch (node.op) {
        case "&&":
          return left ? evaluate(node.right, scope) : left;
        case "||":
          return left ? left : evaluate(node.right, scope);
        case "??":
          return left ?? evaluate(node.right, scope);
      }
      break;
    }
    case "cond":
      return evaluate(node.test, scope)
        ? evaluate(node.then, scope)
        : evaluate(node.else, scope);
    case "binary": {
      const l = evaluate(node.left, scope) as never;
      const r = evaluate(node.right, scope) as never;
      switch (node.op) {
        case "+":
          return (l as number) + (r as number);
        case "-":
          return (l as number) - (r as number);
        case "*":
          return (l as number) * (r as number);
        case "/":
          return (l as number) / (r as number);
        case "%":
          return (l as number) % (r as number);
        case "<":
          return (l as number) < (r as number);
        case "<=":
          return (l as number) <= (r as number);
        case ">":
          return (l as number) > (r as number);
        case ">=":
          return (l as number) >= (r as number);
        case "===":
          return l === r;
        case "!==":
          return l !== r;
        case "==":
          // biome-ignore lint/suspicious/noDoubleEquals: 式言語として JS の == をそのまま提供する
          return l == r;
        case "!=":
          // biome-ignore lint/suspicious/noDoubleEquals: 同上
          return l != r;
      }
      break;
    }
  }
  throw new Error("評価できないノードです"); // i18n-ignore — 式の構文エラー文（管理者向け・engine の warning に載る）
}

/**
 * 式をコンパイルし、`paramNames` の順に値を受け取って評価する関数を返す。
 * 旧 compileSandboxed と同じ呼び出し形（engine 側の差し替えを 1 行にするため）。
 * 構文エラーはここで投げる（保存時の検査にも使う）。
 */
export function compileExpression(
  paramNames: readonly string[],
  expression: string,
): (...args: unknown[]) => unknown {
  const ast = parseExpression(expression);
  return (...args: unknown[]) => {
    const scope = new Map<string, unknown>(Object.entries(SAFE_BUILTINS));
    for (let i = 0; i < paramNames.length; i++)
      scope.set(paramNames[i], args[i]);
    return evaluate(ast, scope);
  };
}

/** 1 回きりの評価（テスト・プレビュー用）。 */
export function evaluateExpression(
  expression: string,
  scope: Record<string, unknown>,
): unknown {
  return evaluate(
    parseExpression(expression),
    new Map([...Object.entries(SAFE_BUILTINS), ...Object.entries(scope)]),
  );
}
