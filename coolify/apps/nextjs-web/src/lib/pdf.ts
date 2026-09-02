/**
 * pdf.ts — HTML template → Gotenberg → PDF (server-only).
 *
 * Mirrors the design-preview reference (`design-preview/vite.config.ts`): the
 * server owns the HTML+CSS templates in `src/pdf-templates/`, renders the data
 * in, then POSTs the bundle to Gotenberg's Chromium HTML route. `base.css` is
 * uploaded alongside the template so its `<link rel="stylesheet">` resolves.
 *
 * Templating is intentionally dependency-free (no handlebars) to keep the
 * lockfile frozen: it supports `{{path.to.value}}`, `{{{path.to.html}}}` and
 * `{{#each list}}…{{/each}}` — enough for the document templates.
 *
 * ■ `{{x}}` は HTML エスケープ、`{{{x}}}` だけが生の HTML（監査 H4）
 * 以前は全部そのまま差し込んでいた（「ルートが信頼できる内部データを渡す」
 * という前提）が、顧客名・製品名・備考・顧客注文書番号（OCR 由来）は利用者や
 * 取引先が書く文字列で、`<img>` 1 つで出荷する請求書の金額欄を書き換えられた。
 * 生で入れてよいのは自分で組み立てた断片（QR の SVG・社印・列の HTML）だけで、
 * それらはテンプレート側で三重括弧にして「ここは生」と宣言する。
 * 備考の改行は route 側でエスケープ後に <br> にして三重括弧へ渡す。
 * Gotenberg 側も `--chromium-allow-list=file:///tmp/.*` + JS 無効なので、
 * 万一すり抜けても外部への取得は起きない（coolify/common/app-support）。
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { escapeHtml } from "./format";

const TEMPLATES_DIR = path.join(process.cwd(), "src", "pdf-templates");

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3100";

type TemplateData = Record<string, unknown>;

/** Resolve a dotted path (`a.b.c`) against a context object. */
function resolvePath(ctx: unknown, dotted: string): unknown {
  return dotted
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      ctx,
    );
}

function lookup(ctx: unknown, root: unknown, expr: string): string {
  const v = resolvePath(ctx, expr);
  const resolved = v === undefined ? resolvePath(root, expr) : v;
  return resolved == null ? "" : String(resolved);
}

/**
 * Replace placeholders in `tpl` using `ctx` (then `root` fallback).
 * `{{{path}}}` は生の HTML、`{{path}}` はエスケープ済みの文字列になる。
 * 三重括弧を先に処理する（二重括弧の正規表現が `{{{x}}}` の内側 `{{x}}` に
 * 当たると生のはずの値までエスケープされる）。
 */
function substitute(tpl: string, ctx: unknown, root: unknown): string {
  return tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, expr: string) =>
      lookup(ctx, root, expr),
    )
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, expr: string) =>
      escapeHtml(lookup(ctx, root, expr)),
    );
}

/** 備考など「改行だけを HTML にしたい」平文 → `{{{…}}}` に渡せる断片。 */
export function multilineHtml(text: string | null | undefined): string {
  return escapeHtml(text ?? "").replace(/\r?\n/g, "<br>");
}

/** Render a template string: expand `{{#each}}` blocks, then placeholders. */
export function renderTemplate(template: string, data: TemplateData): string {
  // 1. Expand each `{{#each key}}…{{/each}}` against the array `data[key]`.
  const withLists = template.replace(
    /\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_m, listExpr: string, inner: string) => {
      const list = resolvePath(data, listExpr);
      if (!Array.isArray(list)) return "";
      return list.map((item) => substitute(inner, item, data)).join("");
    },
  );
  // 2. Resolve the remaining root-level placeholders.
  return substitute(withLists, data, data);
}

/** Read a template (and its sibling `base.css`) from `src/pdf-templates/`. */
async function loadTemplate(
  name: string,
): Promise<{ html: string; css: string }> {
  const file = path.join(TEMPLATES_DIR, name);
  // Guard against path traversal — only files directly under the templates dir.
  if (path.dirname(file) !== TEMPLATES_DIR) {
    throw new Error(`Invalid template name: ${name}`);
  }
  const [html, css] = await Promise.all([
    readFile(file, "utf8"),
    readFile(path.join(TEMPLATES_DIR, "base.css"), "utf8"),
  ]);
  return { html, css };
}

export interface RenderPdfOptions {
  /**
   * Gotenberg (Chromium) の印刷余白。未指定なら Gotenberg 既定（≈10mm）に任せ、
   * テンプレート側の `@page { margin }` と併せて従来どおりの見た目になる。
   * ミリ単位のレイアウトを CSS で完全制御するテンプレート（例: QR カード
   * シート）は `"0"` を渡し、余白をテンプレート内の padding で持つ。
   */
  margins?: string;
  /**
   * ページボックスの寸法（既定 A4 縦 210mm × 297mm）。原寸印刷が必須の帳票
   * （QR カードシート）は、ビューアの「用紙（印刷可能領域）に合わせる」が
   * 縮小として働かないよう A4 より一回り小さいページボックスを渡す。
   * テンプレート CSS の `@page { size }` と必ず一致させること。
   */
  paperWidth?: string;
  paperHeight?: string;
}

/** Render `<template>.html` with `data` and convert it to a PDF via Gotenberg. */
export async function renderPdf(
  templateName: string,
  data: TemplateData,
  options: RenderPdfOptions = {},
): Promise<ArrayBuffer> {
  const { html, css } = await loadTemplate(templateName);
  const rendered = renderTemplate(html, data);

  const form = new FormData();
  form.append(
    "files",
    new Blob([rendered], { type: "text/html" }),
    "index.html",
  );
  // Upload base.css so `<link rel="stylesheet" href="base.css">` resolves.
  form.append("files", new Blob([css], { type: "text/css" }), "base.css");
  // Upload SVG assets (e.g. the CKK logo) so `<img src="logo.svg">` resolves.
  for (const asset of await readdir(TEMPLATES_DIR)) {
    if (!asset.toLowerCase().endsWith(".svg")) continue;
    const svg = await readFile(path.join(TEMPLATES_DIR, asset), "utf8");
    form.append("files", new Blob([svg], { type: "image/svg+xml" }), asset);
  }
  // Upload the self-hosted Noto Sans JP font files so `@font-face { url(...) }`
  // in base.css / kiosk-cards.html resolves — アプリ本体（next/font）と同じ
  // 実体を使うため。allow-list は file:///tmp/.* のみなので同梱以外の手段は無い。
  for (const asset of await readdir(TEMPLATES_DIR)) {
    if (!asset.toLowerCase().endsWith(".woff2")) continue;
    const font = await readFile(path.join(TEMPLATES_DIR, asset));
    form.append("files", new Blob([font], { type: "font/woff2" }), asset);
  }
  // A4 (210mm × 297mm); Gotenberg otherwise defaults to US Letter.
  form.append("paperWidth", options.paperWidth ?? "210mm");
  form.append("paperHeight", options.paperHeight ?? "297mm");
  form.append("printBackground", "true");
  if (options.margins != null) {
    form.append("marginTop", options.margins);
    form.append("marginBottom", options.margins);
    form.append("marginLeft", options.margins);
    form.append("marginRight", options.margins);
  }

  const res = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gotenberg ${res.status}: ${detail}`.trim());
  }
  return res.arrayBuffer();
}
