/**
 * preview.mjs — diagrams/*.txt を書きながら図を見るための開発用サーバー。
 *
 *   node tools/swimlane/preview.mjs [--port 4321]
 *
 * 本番の経路は変えない — マニュアルが読むのは build-diagrams.mjs が書き出して
 * コミットした SVG のままで、このサーバーは何も書き出さない。DSL を直すたびに
 * ビルドしてコミットして画面を確認する往復を、保存した瞬間の再描画に置き換える
 * だけの道具。
 *
 * エラーで落とさないのが build-diagrams.mjs との違い。書いている途中の DSL は
 * ほとんどの時間が構文エラーなので、エラーは画面に出して次の保存を待つ。
 */

import { readdirSync, readFileSync, watch } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { textToSvg } from "./vendor/render-pure/text-to-svg.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, "diagrams");

const portArg = process.argv.indexOf("--port");
const PORT = portArg !== -1 ? Number(process.argv[portArg + 1]) : 4321;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`invalid --port: ${process.argv[portArg + 1]}`);
  process.exit(1);
}

const names = () =>
  readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => basename(f, ".txt"))
    .sort();

/** DSL 1 本を SVG に変換する。build-diagrams.mjs と同じ前処理・同じテーマ。 */
function render(name) {
  let dsl;
  try {
    dsl = readFileSync(join(SRC_DIR, `${name}.txt`), "utf8");
  } catch {
    return { errors: [{ message: `${name}.txt が見つかりません` }] };
  }
  if (!dsl.includes("@kai-swimlane")) dsl = `@kai-swimlane\n${dsl}\n@end\n`;
  try {
    const { svg, errors } = textToSvg(dsl, { themeKey: "basic" });
    if (errors?.length) return { errors };
    if (!/<svg\b[^>]*\bviewBox="/.test(svg)) {
      // build-diagrams.mjs が exit 1 にする条件。ここでも同じ判定を出しておかないと
      // 「preview では見えるのにビルドが通らない」が起きる。
      return { svg, errors: [{ message: "SVG root に viewBox がありません（ビルドは失敗します）" }] };
    }
    return { svg, errors: [] };
  } catch (e) {
    return { errors: [{ message: e?.message ?? String(e) }] };
  }
}

const clients = new Set();

const page = (name) => `<!doctype html>
<meta charset="utf-8">
<title>${name} — swimlane preview</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; }
  header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
           padding: 10px 16px; border-bottom: 1px solid #8884; position: sticky; top: 0;
           background: Canvas; }
  header a { text-decoration: none; padding: 3px 8px; border-radius: 4px; color: inherit; }
  header a[aria-current] { background: #8883; font-weight: 600; }
  #stage { padding: 16px; }
  #stage svg { max-width: 100%; height: auto; }
  #errors { margin: 0 16px 16px; padding: 12px 16px; border-left: 3px solid #d33;
            background: #d331; white-space: pre-wrap; font-family: ui-monospace, monospace; }
  [hidden] { display: none !important; }
</style>
<header>
  ${names()
    .map((n) => `<a href="/${n}"${n === name ? " aria-current='page'" : ""}>${n}</a>`)
    .join("")}
  <span id="stamp" style="margin-left:auto;opacity:.6"></span>
</header>
<pre id="errors" hidden></pre>
<div id="stage"></div>
<script>
  const name = ${JSON.stringify(name)};
  async function draw() {
    const r = await fetch("/render/" + name).then((r) => r.json());
    document.getElementById("stage").innerHTML = r.svg ?? "";
    const box = document.getElementById("errors");
    box.hidden = !r.errors.length;
    box.textContent = r.errors.map((e) => (e.line != null ? "L" + e.line + ": " : "") + (e.message ?? e)).join("\\n");
    document.getElementById("stamp").textContent = new Date().toLocaleTimeString();
  }
  new EventSource("/events").onmessage = draw;
  draw();
</script>
`;

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("retry: 500\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (path.startsWith("/render/")) {
    // パス片は 1 セグメントなので "/" は入らないが、.. や拡張子を弾いて
    // diagrams/ の外を読めないようにしておく。
    const name = decodeURIComponent(path.slice("/render/".length));
    if (name.includes("..") || extname(name) !== "" || !names().includes(name)) {
      res.writeHead(404).end("{}");
      return;
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(render(name)));
    return;
  }

  const all = names();
  if (all.length === 0) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`no *.txt sources in ${SRC_DIR}`);
    return;
  }
  const name = decodeURIComponent(path.slice(1));
  if (path === "/") {
    res.writeHead(302, { location: `/${all[0]}` }).end();
    return;
  }
  if (!all.includes(name)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page(name));
});

// fs.watch は 1 回の保存で複数回鳴く（エディタが書き換え + rename する）ので束ねる。
let timer;
watch(SRC_DIR, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const c of clients) c.write("data: change\n\n");
  }, 50);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`swimlane preview → http://127.0.0.1:${PORT}/  (watching ${SRC_DIR})`);
});
