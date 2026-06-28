/**
 * pdf.ts — HTML template → Gotenberg → PDF (server-only).
 *
 * Mirrors the design-preview reference (`design-preview/vite.config.ts`): the
 * server owns the HTML+CSS templates in `src/pdf-templates/`, renders the data
 * in, then POSTs the bundle to Gotenberg's Chromium HTML route. `base.css` is
 * uploaded alongside the template so its `<link rel="stylesheet">` resolves.
 *
 * Templating is intentionally dependency-free (no handlebars) to keep the
 * lockfile frozen: it supports `{{path.to.value}}` and `{{#each list}}…{{/each}}`
 * — enough for the document templates. Values are substituted as-is (the route
 * pre-formats numbers/dates and supplies trusted, internal data).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

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

/** Replace `{{path}}` placeholders in `tpl` using `ctx` (then `root` fallback). */
function substitute(tpl: string, ctx: unknown, root: unknown): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, expr: string) => {
    const v = resolvePath(ctx, expr);
    const resolved = v === undefined ? resolvePath(root, expr) : v;
    return resolved == null ? "" : String(resolved);
  });
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

/** Render `<template>.html` with `data` and convert it to a PDF via Gotenberg. */
export async function renderPdf(
  templateName: string,
  data: TemplateData,
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
  // A4 (210mm × 297mm); Gotenberg otherwise defaults to US Letter.
  form.append("paperWidth", "210mm");
  form.append("paperHeight", "297mm");
  form.append("printBackground", "true");

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
