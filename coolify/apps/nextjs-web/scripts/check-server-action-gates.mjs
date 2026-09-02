#!/usr/bin/env node
/**
 * check-server-action-gates.mjs — CI ガード: `"use server"` モジュールが export する
 * すべての async 関数（= Server Action）が、認可の門を通っていることを検査する。
 *
 * 背景: Server Action は画面に部品が描かれていなくても、ID さえ分かれば
 * ログイン済みの誰からでも直接呼べる。ページ側の requireAppRead は効かない。
 * 2026-09 の監査で、検索ピッカー（_shared/option-search.ts）ほか 26 本が
 * 権限チェック無しで業務データを返していた。再発を CI で止める。
 *
 * 判定: 関数本文（署名の直後の `{` から対応する `}` まで）に GATE_PATTERN の
 * いずれかが含まれること。lib 側で門を通す「委譲だけ」の関数は、本文が
 * 1 つの `return <ident>(…)` 呼び出しで、その ident がこのファイルの import
 * 由来なら委譲とみなして通す（門は lib の側にある前提 — そちらは型と
 * コードレビューで守る）。それ以外は ALLOWLIST に理由つきで載せる。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const GATE_NAMES = [
  "checkPermission",
  "requirePermissionResponse",
  "checkApprovalDocAccess",
  "requireAnyRead",
  "requireAppRead",
  "requireElevation",
  "useElevation",
  "peekElevation",
  "sessionUserId",
  "currentUserId",
  "getPortalSession",
  "requirePortalView",
  "requirePortalFeature",
  "getCurrentActorId",
  "isAdminBypass",
  "resolveFileAccess",
  "auth",
];
// check<Xxx>Permission（checkFloorMapPermission 等の派生）と require<Xxx> も門とみなす。
// saveCurrentPreferences はセッションの本人の行しか触れない。
const GATE_PATTERN = new RegExp(
  `\\b(${GATE_NAMES.join("|")}|check\\w*Permission|require\\w+|saveCurrentPreferences)\\s*\\(`,
);

/** 本文が無いのに門が要らない関数（理由を書く）。 */
const ALLOWLIST = new Set([
  // Auth.js の signIn を呼ぶだけ — ログイン前に呼ぶものなので門は無い
  "app/(auth)/login/actions.ts::ssoSignIn",
  // 短縮リンクの解決 — 公開情報（ブラックリスト判定は lib 側）
  "app/l/[code]/actions.ts::followShortLinkAction",
  // lib/link-index.ts の各関数が checkPermission(BLACKLIST_PERMISSION, …) を通す。
  // revalidatePath を挟むので「1 行の委譲」の形にならないだけ。
  "app/(dashboard)/settings/links/actions.ts::addBlacklistAction",
  "app/(dashboard)/settings/links/actions.ts::setBlacklistActiveAction",
  "app/(dashboard)/settings/links/actions.ts::deleteBlacklistAction",
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

/** `export async function NAME(` の位置から本文 [start,end) を返す。 */
function bodyRange(src, sigStart) {
  let i = src.indexOf("(", sigStart);
  let paren = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") paren++;
    else if (ch === ")") {
      paren--;
      if (paren === 0) {
        i++;
        break;
      }
    }
  }
  // 戻り型の中の `{`（ActionResult<{ id }>）を飛ばし、山括弧の外の `{` を本文とする
  let angle = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "<") angle++;
    else if (ch === ">") angle = Math.max(0, angle - 1);
    else if (ch === "{" && angle === 0) break;
  }
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return [start, i + 1];
    }
  }
  return [start, src.length];
}

/**
 * このファイル内の非 export 関数のうち、本文が門を通しているもの
 * （transitionCard / applyOrRequest のような共通の前処理）。
 * それを呼ぶ Server Action も門を通しているとみなす（1 段だけ）。
 */
function locallyGatedHelpers(src) {
  const names = new Set();
  for (const m of src.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
    const [start, end] = bodyRange(src, m.index);
    if (GATE_PATTERN.test(src.slice(start, end))) names.add(m[1]);
  }
  return names;
}

function importedIdentifiers(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const id = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (id) names.add(id);
    }
  }
  for (const m of src.matchAll(/import\s+(\w+)\s+from/g)) names.add(m[1]);
  return names;
}

/** `{ return foo(...); }` / `{ const tr = …; return foo(...); }` の委譲だけの本文か。 */
function isPureDelegation(body, imported) {
  const inner = body.slice(1, -1).trim();
  const stmts = inner
    .split(/;\s*(?=\S)/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (stmts.length === 0 || stmts.length > 2) return false;
  const last = stmts[stmts.length - 1].replace(/;$/, "");
  const m = /^return\s+(?:await\s+)?(\w+)\s*\(/.exec(last);
  if (!m || !imported.has(m[1])) return false;
  if (
    stmts.length === 2 &&
    !/^const tr = await getTranslations\(\)/.test(stmts[0])
  )
    return false;
  return true;
}

const failures = [];
let checked = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  if (!/^\s*["']use server["']/m.test(src)) continue;
  const rel = relative(ROOT, file);
  const imported = importedIdentifiers(src);
  const local = locallyGatedHelpers(src);
  const localPattern =
    local.size > 0 ? new RegExp(`\\b(${[...local].join("|")})\\s*\\(`) : null;
  const show = process.argv.includes("--show");
  for (const m of src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)) {
    checked++;
    const name = m[1];
    const key = `${rel}::${name}`;
    const [start, end] = bodyRange(src, m.index);
    const body = src.slice(start, end);
    if (GATE_PATTERN.test(body)) continue;
    if (localPattern?.test(body)) continue;
    if (isPureDelegation(body, imported)) continue;
    if (ALLOWLIST.has(key)) continue;
    failures.push(key);
    if (show) console.error(`----- ${key}\n${body}\n`);
  }
}

if (failures.length > 0) {
  console.error(
    `check-server-action-gates: 次の Server Action に認可の門がありません（${failures.length} 件 / 検査 ${checked} 件）:`,
  );
  for (const f of failures) console.error(`  MISSING GATE: ${f}`);
  console.error(
    "\n先頭で checkPermission / requireAnyRead 等を呼ぶか、lib 側で門を通す関数へ 1 行で委譲してください。",
  );
  process.exit(1);
}
console.log(`check-server-action-gates: OK（${checked} 件を検査）`);
