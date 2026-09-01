#!/usr/bin/env node
/**
 * messages-editor/server.mjs — messages/*.json（next-intl のカタログ）を
 * ブラウザから直接編集するための、ローカル専用のミニ道具。
 *
 *   node tools/messages-editor/server.mjs
 *   node tools/messages-editor/server.mjs --dir coolify/apps/nextjs-web/messages --port 5178
 *
 * ■ なぜ足すか
 * `messages/{ja,en,zh}.json` は 3 ファイルに分かれていて、同じキーを 3 箇所
 * 見比べながら直すのは辛い。ここは**言語を列にして 1 画面に並べ、名前空間は
 * 折りたためるグループにする**——編集そのものは素朴な JSON の書き換えなので、
 * サーバーは「木にして返す・書き戻す」だけに徹する。
 *
 * ■ 依存ライブラリを入れない
 * `tools/i18n/*.mjs` と同じ方針（_specs/techstack.md の依存方針）。
 * Node 標準の `http` だけで足りる規模なので、Express 等は要らない。
 *
 * ■ ja が正
 * 木の順序・「どのキーがあるべきか」は常に `ja.json` を基準にする
 * （CLAUDE.md 「ja is the source of truth」）。他言語に無いキー・空文字は
 * 警告として出す（`lib/user-preferences-core.test.ts` が CI で見ているのと
 * 同じ不変条件——保存前に気づけるようにするのがこの道具の値打ち）。
 *
 * ■ 保存の単位
 * クライアントは編集のたびに**木全体**を送り返す（`POST /api/save`）。
 * 89 キー程度の小さなファイルなので往復のコストは無視でき、パスごとの
 * パッチ処理を書くより「木を組み立てて 3 ファイルへ書き出す」だけのほうが
 * 誤りにくい。
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const PUBLIC_DIR = path.join(HERE, "public");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const MESSAGES_DIR = path.resolve(
  REPO,
  arg("--dir", "coolify/apps/nextjs-web/messages"),
);
const PORT = Number(arg("--port", process.env.PORT ?? "5178"));

if (!fs.existsSync(MESSAGES_DIR)) {
  console.error(`ディレクトリが無い: ${MESSAGES_DIR}`);
  process.exit(1);
}

/** ロケールは `<dir>/*.json` から自動検出する。ja を常に先頭に。 */
function listLocales() {
  const files = fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  files.sort((a, b) => (a === "ja" ? -1 : b === "ja" ? 1 : a.localeCompare(b)));
  return files;
}

function readLocale(locale) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * 3 つの `{ [locale]: object }` を、ja の順序を基準にした 1 本の木にする。
 * 返り値のノードは group（`children` を持つ）か leaf（`values` を持つ）。
 */
function buildTree(locales, dataByLocale) {
  const ja = dataByLocale.ja ?? {};

  function walk(obj, otherObjs, pathSoFar) {
    const children = [];
    for (const [key, value] of Object.entries(obj)) {
      const p = [...pathSoFar, key];
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const nested = {};
        for (const loc of locales) {
          const parent = otherObjs[loc];
          const child = parent && typeof parent === "object" ? parent[key] : undefined;
          nested[loc] = child;
        }
        children.push({
          type: "group",
          key,
          path: p,
          children: walk(value, nested, p),
        });
      } else {
        const values = {};
        const missing = {};
        for (const loc of locales) {
          const parent = otherObjs[loc];
          const v = parent && typeof parent === "object" ? parent[key] : undefined;
          if (v === undefined) {
            values[loc] = "";
            missing[loc] = true;
          } else {
            values[loc] = String(v);
          }
        }
        children.push({ type: "leaf", key, path: p, values, missing });
      }
    }
    // 他言語だけにあって ja に無いキーも見えるようにする（削除漏れ・
    // 訳す前に消し忘れた形跡を拾うため）。
    for (const loc of locales) {
      if (loc === "ja") continue;
      const other = otherObjs[loc];
      if (!other || typeof other !== "object") continue;
      for (const key of Object.keys(other)) {
        if (Object.hasOwn(obj, key)) continue;
        const p = [...pathSoFar, key];
        const value = other[key];
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          const nested = {};
          for (const l of locales) nested[l] = undefined;
          nested[loc] = value;
          children.push({ type: "group", key, path: p, children: walk({}, nested, p) });
        } else {
          const values = {};
          const missing = {};
          for (const l of locales) {
            values[l] = l === loc ? String(value) : "";
            if (l !== loc) missing[l] = true;
          }
          children.push({ type: "leaf", key, path: p, values, missing, extraneous: true });
        }
      }
    }
    return children;
  }

  const others = {};
  for (const loc of locales) others[loc] = dataByLocale[loc];
  return walk(ja, others, []);
}

/** 木を集計して「無いキー」「空文字」を数える（保存直後に見せる警告）。 */
function collectWarnings(children, locales, acc = { missing: {}, empty: {} }) {
  for (const loc of locales) {
    acc.missing[loc] ??= 0;
    acc.empty[loc] ??= 0;
  }
  for (const node of children) {
    if (node.type === "group") {
      collectWarnings(node.children, locales, acc);
      continue;
    }
    for (const loc of locales) {
      if (node.missing?.[loc]) acc.missing[loc]++;
      else if (node.values[loc] === "") acc.empty[loc]++;
    }
  }
  return acc;
}

/** 木からロケールごとの入れ子オブジェクトを組み立て直す。 */
function treeToLocaleObjects(children, locales) {
  const out = {};
  for (const loc of locales) out[loc] = {};

  function walk(nodes, targets) {
    for (const node of nodes) {
      if (node.type === "group") {
        for (const loc of locales) {
          targets[loc][node.key] ??= {};
        }
        const nextTargets = {};
        for (const loc of locales) nextTargets[loc] = targets[loc][node.key];
        walk(node.children, nextTargets);
      } else {
        for (const loc of locales) {
          const v = node.values?.[loc];
          if (v === undefined) continue;
          if (v === "" && node.missing?.[loc]) continue; // 空のまま = 追加しない
          targets[loc][node.key] = v;
        }
      }
    }
  }
  walk(children, out);
  return out;
}

function writeLocale(locale, obj) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function serveStatic(req, res) {
  const reqPath = req.url === "/" ? "/index.html" : req.url;
  const full = path.join(PUBLIC_DIR, reqPath);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full)) {
    res.writeHead(404).end("not found");
    return;
  }
  const ext = path.extname(full);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10_000_000) req.destroy(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/tree") {
      const locales = listLocales();
      const dataByLocale = {};
      for (const loc of locales) dataByLocale[loc] = readLocale(loc);
      const tree = buildTree(locales, dataByLocale);
      const warnings = collectWarnings(tree, locales);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ locales, tree, warnings, dir: path.relative(REPO, MESSAGES_DIR) }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/save") {
      const body = JSON.parse(await readBody(req));
      const locales = listLocales();
      const objects = treeToLocaleObjects(body.tree, locales);
      for (const loc of locales) writeLocale(loc, objects[loc]);
      const warnings = collectWarnings(body.tree, locales);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, warnings }));
      return;
    }

    serveStatic(req, res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  }
});

server.listen(PORT, () => {
  console.log(`messages editor — http://localhost:${PORT}`);
  console.log(`対象: ${path.relative(REPO, MESSAGES_DIR)}`);
});
