/**
 * migrate-docs-content.ts — 旧 /docs コンテンツ → fumadocs 2 ツリー移行（1回限り）。
 *
 * src/content/docs/<slug>/<lang>.md（41 ページ × ja/en/zh）を
 *   - system/*                → content/internal/<slug>.md（+ .en.md / .zh.md）
 *   - それ以外（ユーザー向け） → content/manual/<slug>.md（+ .en.md / .zh.md）
 * へ移す。frontmatter（title = docs-tree.ts のタイトル / description = 本文
 * 先頭段落）を付与し、H1 行を落とす（fumadocs は title からページ見出しを描画）。
 * セクション順は meta.json（+ meta.en.json / meta.zh.json）に落とす。
 *
 * 実行: node --experimental-strip-types scripts/migrate-docs-content.ts
 * （移行完了・コミット後は旧 src/content/docs と docs-tree.ts を削除する）
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_LANGS, DOCS_TREE, type DocLang } from "../src/lib/docs-tree.ts";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(APP_ROOT, "src/content/docs");
const OUT_MANUAL = join(APP_ROOT, "content/manual");
const OUT_INTERNAL = join(APP_ROOT, "content/internal");

/** ページタイトル → フォルダ名（「見積書 — 操作マニュアル」→「見積書」）。 */
const FOLDER_TITLE_SUFFIXES: Record<DocLang, string[]> = {
  ja: [" — 操作マニュアル", " — 設定マニュアル"],
  en: [" — User Manual", " — Settings Manual"],
  zh: [" — 操作手册", " — 设置手册"],
};

function stripSuffix(title: string, lang: DocLang): string {
  for (const s of FOLDER_TITLE_SUFFIXES[lang]) {
    if (title.endsWith(s)) return title.slice(0, -s.length);
  }
  return title;
}

function yamlString(v: string): string {
  return `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** H1 行を除去し、frontmatter 用 description（先頭段落）を抽出する。 */
function splitContent(md: string): { body: string; description: string } {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && /^#\s/.test(lines[i])) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  const bodyLines = lines.slice(i);

  let description = "";
  for (const line of bodyLines) {
    const t = line.trim();
    if (t === "") {
      if (description) break;
      continue;
    }
    if (/^[#>\-*\d!|`]/.test(t)) break; // 見出し・リスト・引用・画像等は対象外
    description += (description ? " " : "") + t;
  }
  description = description
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // リンクはテキストだけ残す
    .replaceAll("`", "")
    .replaceAll("*", "");
  if (description.length > 120) description = `${description.slice(0, 117)}…`;

  return { body: bodyLines.join("\n").trimEnd(), description };
}

/** 本文内の /docs/ リンクを新 URL（ロケール付き）へ書き換える。 */
function rewriteDocLinks(md: string, lang: DocLang): string {
  return md.replace(
    /\]\(\/docs\/([^)#?]+)([#?][^)]*)?\)/g,
    (_m, slug, rest) => {
      const base = slug.startsWith("system/")
        ? `/internal-docs/${lang}/${slug}`
        : `/manual/${lang}/${slug}`;
      return `](${base}${rest ?? ""})`;
    },
  );
}

/** MDX 事故防止: コードスパン外の < / { を警告（.md なので JSX は無効だが念のため）。 */
function scanRisky(md: string, file: string): void {
  const noCode = md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "");
  if (/[<{]/.test(noCode)) {
    console.warn(`  [warn] ${file}: contains "<" or "{" outside code spans`);
  }
}

const LANG_FILE: Record<DocLang, (base: string) => string> = {
  ja: (b) => `${b}.md`,
  en: (b) => `${b}.en.md`,
  zh: (b) => `${b}.zh.md`,
};

function metaFile(dir: string, lang: DocLang): string {
  return join(dir, lang === "ja" ? "meta.json" : `meta.${lang}.json`);
}

function writeMeta(
  dir: string,
  title: Record<DocLang, string> | null,
  pages: string[] | null,
): void {
  mkdirSync(dir, { recursive: true });
  for (const lang of DOCS_LANGS) {
    const meta: Record<string, unknown> = {};
    if (title) meta.title = title[lang];
    if (pages) meta.pages = pages;
    writeFileSync(metaFile(dir, lang), `${JSON.stringify(meta, null, 2)}\n`);
  }
}

let migrated = 0;
let missing = 0;

function migratePage(
  slug: string,
  title: Record<DocLang, string>,
  outRoot: string,
  withScreenshots: boolean,
): void {
  for (const lang of DOCS_LANGS) {
    const srcFile = join(SRC, slug, `${lang}.md`);
    let raw: string;
    try {
      raw = readFileSync(srcFile, "utf8");
    } catch {
      console.warn(`  [warn] missing source: ${slug}/${lang}.md`);
      missing++;
      continue;
    }
    scanRisky(raw, `${slug}/${lang}.md`);
    const { body, description } = splitContent(rewriteDocLinks(raw, lang));
    const fm = [
      "---",
      `title: ${yamlString(title[lang])}`,
      ...(description ? [`description: ${yamlString(description)}`] : []),
      ...(withScreenshots ? ["screenshots: []"] : []),
      "---",
      "",
    ].join("\n");
    const outFile = join(
      outRoot,
      dirname(slug),
      LANG_FILE[lang](slug.split("/").pop() as string),
    );
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${fm}${body}\n`);
    migrated++;
  }
}

// ── 移行本体 ────────────────────────────────────────────────────────────────

const appOrder: string[] = [];
const masterOrder: string[] = [];
const systemOrder: string[] = [];
const topOrder: string[] = [];

for (const section of DOCS_TREE) {
  for (const page of section.pages) {
    const isInternal = page.slug.startsWith("system/");
    migratePage(
      page.slug,
      page.title,
      isInternal ? OUT_INTERNAL : OUT_MANUAL,
      !isInternal,
    );

    const parts = page.slug.split("/");
    if (isInternal) {
      systemOrder.push(parts[1]);
    } else if (parts[0] === "apps") {
      if (!appOrder.includes(parts[1])) appOrder.push(parts[1]);
      // アプリフォルダのタイトル（サフィックスを剥いだ名前）
      const folderTitle = Object.fromEntries(
        DOCS_LANGS.map((l) => [l, stripSuffix(page.title[l], l)]),
      ) as Record<DocLang, string>;
      const dir = join(OUT_MANUAL, "apps", parts[1]);
      // user ページ優先でフォルダ名を決める（既存 meta は上書きしない）
      const hasMeta = readdirSafe(dir).includes("meta.json");
      if (!hasMeta || parts[2] === "user") {
        const pages = pagesInAppFolder(page.slug, parts[1]);
        writeMeta(dir, folderTitle, pages);
      }
    } else if (parts[0] === "masters") {
      masterOrder.push(parts[1]);
      const folderTitle = Object.fromEntries(
        DOCS_LANGS.map((l) => [l, stripSuffix(page.title[l], l)]),
      ) as Record<DocLang, string>;
      writeMeta(join(OUT_MANUAL, "masters", parts[1]), folderTitle, ["user"]);
    } else {
      topOrder.push(page.slug);
    }
  }
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** アプリフォルダ内のページ順（user → settings）。 */
function pagesInAppFolder(_slug: string, app: string): string[] {
  const all = DOCS_TREE.flatMap((s) => s.pages.map((p) => p.slug));
  const pages: string[] = [];
  if (all.includes(`apps/${app}/user`)) pages.push("user");
  if (all.includes(`apps/${app}/settings`)) pages.push("settings");
  return pages;
}

// ルート・セクションの meta.json
writeMeta(OUT_MANUAL, null, [...topOrder, "apps", "masters"]);
writeMeta(
  join(OUT_MANUAL, "apps"),
  { ja: "アプリ操作マニュアル", en: "App Guides", zh: "应用操作手册" },
  appOrder,
);
writeMeta(
  join(OUT_MANUAL, "masters"),
  {
    ja: "マスタ操作マニュアル",
    en: "Master Data Guides",
    zh: "主数据操作手册",
  },
  masterOrder,
);
writeMeta(OUT_INTERNAL, null, ["system"]);
writeMeta(
  join(OUT_INTERNAL, "system"),
  {
    ja: "システム管理マニュアル",
    en: "System Administration Guides",
    zh: "系统管理手册",
  },
  systemOrder,
);

console.log(`migrated ${migrated} files (${missing} missing)`);
