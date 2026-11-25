/**
 * scenario-report.ts — <out>/<id>/result.json を束ねて、目で確かめるための 1 ページにする。
 *
 *   <out>/index.html   画像は相対パス（手元で開く用）
 *   <out>/report.html  画像を埋め込んだ 1 ファイル（人に渡す用。`--inline` のとき）
 *
 * 単体でも動く:  pnpm exec tsx scripts/scenario-report.ts <out> [--inline]
 * 前回までの結果も <out> に残っていれば一緒に載る（--only で 1 本だけ流し直しても、
 * レポートは全体のまま）。並びは scenarios/index.ts の登録順。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScenarioResult, StepResult } from "../scenarios/types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:"Noto Sans JP","Hiragino Sans",system-ui,sans-serif;color:#212529;background:#f1f3f5;font-size:14px;line-height:1.6}
a{color:#1c7ed6}
nav{position:fixed;top:0;left:0;bottom:0;width:320px;overflow:auto;background:#fff;border-right:1px solid #dee2e6;padding:16px}
nav h1{font-size:16px;margin:0 0 4px}
nav .meta{color:#868e96;font-size:12px;margin-bottom:12px}
nav h2{font-size:12px;color:#868e96;margin:14px 0 4px;font-weight:600}
nav a{display:flex;gap:6px;align-items:baseline;padding:3px 6px;border-radius:4px;text-decoration:none;color:#212529;font-size:13px}
nav a:hover{background:#f1f3f5}
main{margin-left:320px;padding:24px;max-width:1500px}
.pill{display:inline-block;min-width:44px;text-align:center;border-radius:3px;padding:0 6px;font-size:11px;font-weight:700;line-height:18px;flex:none}
.pass{background:#d3f9d8;color:#2b8a3e}.fail{background:#ffe3e3;color:#c92a2a}.skipped{background:#e9ecef;color:#868e96}
section.scn{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:20px;margin-bottom:28px}
section.scn>h2{margin:0;font-size:18px;display:flex;gap:10px;align-items:center}
section.scn .sub{color:#868e96;font-size:12px;margin:2px 0 12px}
.step{border-top:1px solid #e9ecef;padding:14px 0}
.step h3{margin:0 0 6px;font-size:14px;display:flex;gap:8px;align-items:baseline}
.step .url{color:#868e96;font-size:11px;word-break:break-all}
.err{background:#fff5f5;border-left:4px solid #e03131;padding:8px 12px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;margin:8px 0;overflow:auto}
table.checks{border-collapse:collapse;margin:6px 0;font-size:13px}
table.checks td{padding:2px 10px 2px 0;vertical-align:top}
table.checks td.actual{color:#495057;font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px;margin-top:8px}
figure{margin:0;border:1px solid #dee2e6;border-radius:6px;overflow:hidden;background:#f8f9fa}
figure img{display:block;width:100%;max-height:420px;object-fit:cover;object-position:top;cursor:zoom-in}
figcaption{font-size:12px;padding:4px 8px;color:#495057;border-top:1px solid #dee2e6;background:#fff}
#lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;overflow:auto;z-index:10;cursor:zoom-out;padding:24px;text-align:center}
#lightbox img{max-width:100%;background:#fff}
.summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.summary div{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:10px 18px}
.summary b{font-size:22px;display:block}
pre.log{background:#212529;color:#f1f3f5;padding:12px;border-radius:6px;overflow:auto;font-size:12px;max-height:320px}
@media(max-width:900px){nav{position:static;width:auto;border-right:0}main{margin-left:0}}
`;

const JS = `
const lb=document.getElementById('lightbox');
document.addEventListener('click',e=>{
  const t=e.target;
  if(t.tagName==='IMG'&&t.closest('figure')){lb.innerHTML='';const i=new Image();i.src=t.src;lb.appendChild(i);lb.style.display='block';lb.scrollTop=0;}
  else if(lb.contains(t)||t===lb){lb.style.display='none';}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')lb.style.display='none';});
`;

function renderStep(dir: string, id: string, step: StepResult, inline: boolean): string {
  const checks = step.checks.length
    ? `<table class="checks">${step.checks
        .map(
          (c) =>
            `<tr><td><span class="pill ${c.ok ? "pass" : "fail"}">${c.ok ? "PASS" : "FAIL"}</span></td><td>${esc(c.name)}</td><td class="actual">${esc(c.actual ?? "")}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const shots = step.shots.length
    ? `<div class="shots">${step.shots
        .map((s) => {
          const abs = join(dir, id, s.file);
          if (!existsSync(abs)) return "";
          const src = inline
            ? `data:image/${s.file.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(abs).toString("base64")}`
            : `${encodeURIComponent(id)}/${encodeURIComponent(s.file)}`;
          return `<figure><img loading="lazy" src="${src}" alt="${esc(s.label)}"><figcaption>${esc(s.label)}</figcaption></figure>`;
        })
        .join("")}</div>`
    : "";
  return `<div class="step"><h3><span class="pill ${step.status}">${step.status.toUpperCase()}</span><span>${step.no}. ${esc(step.caption)}</span></h3>${
    step.url ? `<div class="url">${esc(step.url)} ・ ${seconds(step.durationMs)}</div>` : ""
  }${step.error ? `<div class="err">${esc(step.error)}</div>` : ""}${checks}${shots}</div>`;
}

export function buildReport(outDir: string, opts: { inline?: boolean; order?: string[] } = {}): { total: number; failed: number } {
  const dir = resolve(outDir);
  const results: ScenarioResult[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = join(dir, entry.name, "result.json");
    if (existsSync(p)) results.push(JSON.parse(readFileSync(p, "utf8")) as ScenarioResult);
  }
  const order = opts.order ?? [];
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  results.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));

  const failed = results.filter((r) => r.status === "fail").length;
  const checks = results.flatMap((r) => r.steps.flatMap((s) => s.checks));
  const shots = results.reduce((n, r) => n + r.steps.reduce((m, s) => m + s.shots.length, 0), 0);

  const features: string[] = [];
  for (const r of results) if (!features.includes(r.feature)) features.push(r.feature);

  const render = (inline: boolean): string => {
    const nav = features
      .map(
        (f) =>
          `<h2>${esc(f)}</h2>${results
            .filter((r) => r.feature === f)
            .map((r) => `<a href="#${esc(r.id)}"><span class="pill ${r.status}">${r.status.toUpperCase()}</span><span>${esc(r.title)}</span></a>`)
            .join("")}`,
      )
      .join("");
    const body = results
      .map((r) => {
        const problems = r.problems.length
          ? `<div class="err">${esc(r.problems.join("\n"))}</div>`
          : "";
        const log = r.log && r.status === "fail" ? `<details><summary>ログ（末尾）</summary><pre class="log">${esc(r.log)}</pre></details>` : "";
        return `<section class="scn" id="${esc(r.id)}"><h2><span class="pill ${r.status}">${r.status.toUpperCase()}</span>${esc(r.title)}</h2><div class="sub">${esc(r.feature)} ・ <code>${esc(r.id)}</code> ・ ${seconds(r.durationMs)} ・ ${esc(r.startedAt)}</div>${problems}${r.steps
          .map((s) => renderStep(dir, r.id, s, inline))
          .join("")}${log}</section>`;
      })
      .join("");
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>シナリオ確認レポート</title><style>${CSS}</style></head><body><nav><h1>シナリオ確認レポート</h1><div class="meta">${results.length} 本 ・ 失敗 ${failed} 本</div>${nav}</nav><main><div class="summary"><div><b>${results.length - failed} / ${results.length}</b>シナリオ PASS</div><div><b>${checks.filter((c) => c.ok).length} / ${checks.length}</b>チェック PASS</div><div><b>${shots}</b>枚の画面</div></div>${body}</main><div id="lightbox"></div><script>${JS}</script></body></html>`;
  };

  writeFileSync(join(dir, "index.html"), render(false));
  if (opts.inline) writeFileSync(join(dir, "report.html"), render(true));
  return { total: results.length, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: tsx scripts/scenario-report.ts <out-dir> [--inline]");
    process.exit(2);
  }
  const { total, failed } = buildReport(out, { inline: process.argv.includes("--inline") });
  console.log(`${total} 本（失敗 ${failed}）→ ${join(resolve(out), "index.html")}`);
}
