#!/usr/bin/env node
/**
 * check-api-gates.mjs — CI ガード: /api/v1 配下の全ルートハンドラが
 * 認可の門を通っていることを検査する。
 *
 * 背景: /api/v1 は**インターネットに面した**機械向けの口で、`src/proxy.ts` の
 * matcher からも外してある（Bearer トークンで独自に認証するため）。つまり
 * 門を書き忘れたハンドラは、そのまま**誰でも読める業務データ**になる。
 * 画面や Server Action と違って「ログインしていないと届かない」という
 * 二重の網が無いので、機械で見る価値がここだけ突出して高い。
 *
 * 判定は 2 つ:
 *   ① 各 HTTP メソッドの export の本文に GATE_NAMES のいずれかが現れること。
 *   ② **書き込みハンドラが prisma を直に触っていないこと**（下記）。
 * 門（requireApiAuth / requireApiPermission）は内部で isDevFeatureEnabled("api")
 * も見るので、機能フラグの検査はそれに委ねる（api-auth.ts の 1 行目）。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const API_V1 = join(ROOT, "app", "api", "v1");

// runWrite は中で requireApiPermission を呼ぶ（書き込みの口の唯一の入口）。
// 門を「中に持っている」関数はここに挙げ、その関数自身の試験で
// 門を通ることを固定する。
const GATE_NAMES = ["requireApiPermission", "requireApiAuth", "runWrite"];
const GATE_RE = new RegExp(`\\b(${GATE_NAMES.join("|")})\\s*\\(`);

const METHOD_RE =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;

/**
 * 書き込みメソッド。これらのハンドラは **lib の関数**を呼ぶこと —
 * `prisma.x.create()` などを直に書くと、画面の Server Action が持っている
 * 業務規則（採番・在庫・監査・承認）を迂回した第 2 の書き込み経路ができる。
 * それはこの API の設計が最も避けたいもの（_specs/api.md §8）。
 */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** ハンドラ本文に現れてはいけない直接書き込み。 */
const DIRECT_WRITE_RE =
  /\bprisma\s*\.\s*\$?\w+\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

/**
 * 門が要らないルート。**理由を必ず書くこと。**
 * ここに足すのは「認証しないことがその口の存在理由である」場合だけ。
 */
const EXCLUDE = new Map([
  [
    "health/route.ts",
    "認証しない口。外部の監視が「サービスが落ちている」と「資格情報が違う」を" +
      "切り分けるためにある。DB を触らず定数を返すだけで、機能フラグは中で見る。",
  ],
]);

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

/** 関数本文（署名直後の `{` から対応する `}` まで）を返す。 */
function bodyAfter(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(openIndex, i + 1);
    }
  }
  return src.slice(openIndex);
}

const files = walk(API_V1);
let checked = 0;
let failed = 0;

for (const file of files) {
  const rel = relative(API_V1, file);
  const src = readFileSync(file, "utf8");

  if (EXCLUDE.has(rel)) {
    checked++;
    continue;
  }

  const methods = [...src.matchAll(METHOD_RE)];
  if (methods.length === 0) {
    console.error(`NO HTTP METHOD EXPORTED: v1/${rel}`);
    failed++;
    continue;
  }

  for (const m of methods) {
    const brace = src.indexOf("{", m.index + m[0].length);
    const body = brace < 0 ? "" : bodyAfter(src, brace);
    if (!GATE_RE.test(body)) {
      console.error(`MISSING GATE: v1/${rel}::${m[1]}`);
      failed++;
    }
    if (WRITE_METHODS.has(m[1]) && DIRECT_WRITE_RE.test(body)) {
      console.error(
        `DIRECT PRISMA WRITE: v1/${rel}::${m[1]}` +
          "\n  書き込みは lib の関数を呼ぶこと（画面の Server Action と同じ関数）。" +
          "\n  ここで prisma を直に触ると、採番・在庫・監査・承認を迂回した" +
          "\n  第 2 の書き込み経路ができる。",
      );
      failed++;
    }
    checked++;
  }
}

// 空振りで OK を出さない。ルートが移動して 0 件になったら、このガードは
// 「常に通る飾り」になる — それは検査していないのと同じ。
if (files.length > 0 && checked === 0) {
  console.error("check-api-gates: ルートは在るのに 1 つも検査できていない");
  process.exit(1);
}

if (failed > 0) {
  console.error(
    `\ncheck-api-gates: ${failed} 件が門を通っていない。` +
      `\n/api/v1 は proxy の認証から外れているので、門が無いハンドラは` +
      `\nそのまま誰でも読める業務データになる。` +
      `\n${GATE_NAMES.join(" / ")} のいずれかで始めること。`,
  );
  process.exit(1);
}

console.log(`check-api-gates: OK（${checked} 件を検査）`);
