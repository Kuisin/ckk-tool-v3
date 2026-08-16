/**
 * backfill-link-index.mts — 既存メモ / コメント本文の外部リンクを索引へ取り込む。
 *
 * 拡張子が `.mts` なのは、shared-db に `"type": "module"` を足さずに Node へ
 * ESM だと伝えるため（package 全体のモジュール種別を変えると生成物や他の
 * スクリプトに影響するので避けている）。
 *
 * リンク機能の導入以前に保存された本文は外部 URL を生のまま持っている。この
 * スクリプトは全 document_memos を走査し、`http(s)` リンクを `app.link_index`
 * に登録して本文中の href を `/l/<code>` へ置き換える。以後その本文を開いた
 * 人は確認ページを経由するようになり、ブラックリストも効くようになる。
 *
 * **べき等** — すでに `/l/…` になっているリンクは触らない。何度実行しても
 * 結果は変わらない。導入後に貼られるリンクはアプリ側（saveMemo）が同じ処理を行う。
 *
 * 元 URL は link_index に残るので、置換で情報は失われない。
 *
 * 使い方（shared-db/ から。Node 22.18+ は .ts をそのまま実行できる）:
 *   pnpm backfill:links -- --dry-run     # 変更内容の確認のみ
 *   pnpm backfill:links                  # 実行
 *   pnpm backfill:links:remote           # dev DB に対して（SSH トンネル経由）
 *
 * ロジックは以下と一対一で対応させること（変更時は両方を直す）:
 *   docker-compose/nextjs-web/src/lib/link-index-core.ts   （normalizeUrl）
 *   docker-compose/nextjs-web/src/lib/rich-text-core.ts    （collect / rewrite）
 *   docker-compose/nextjs-web/src/lib/crockford.ts         （generateCode）
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/client.ts";

const DRY_RUN = process.argv.includes("--dry-run");

/** 短縮コードのアルファベット（lib/crockford.ts と同一 — I/O/0/1 を除外）。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const SHORT_LINK_PREFIX = "/l/";

interface RichTextNode {
  type?: string;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: RichTextNode[];
}

/** lib/crockford.generateCode と同じ規則（rejection sampling で偏りなし）。 */
function generateCode(length: number): string {
  const chars: string[] = [];
  const max = 256 - (256 % CODE_ALPHABET.length);
  while (chars.length < length) {
    const buf = new Uint8Array(length * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < max && chars.length < length) {
        chars.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
      }
    }
  }
  return chars.join("");
}

/** lib/link-index-core.normalizeUrl と同じ規則。 */
function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  return url.toString().replace(/#$/, "");
}

/** lib/rich-text-core.collectLinkHrefs と同じ走査。 */
function collectLinkHrefs(doc: RichTextNode | null): string[] {
  const found = new Set<string>();
  const walk = (node: RichTextNode): void => {
    for (const mark of node?.marks ?? []) {
      if (mark?.type === "link") {
        const href = mark?.attrs?.href;
        if (typeof href === "string" && href) found.add(href);
      }
    }
    for (const child of node?.content ?? []) walk(child);
  };
  for (const child of doc?.content ?? []) walk(child);
  return [...found];
}

/** lib/rich-text-core.rewriteLinkHrefs と同じ差し替え（非破壊）。 */
function rewriteLinkHrefs(
  doc: RichTextNode,
  map: Record<string, string>,
): RichTextNode {
  const mapNode = (node: RichTextNode): RichTextNode => {
    const next: RichTextNode = { ...node };
    if (Array.isArray(node.marks)) {
      next.marks = node.marks.map((mark) => {
        if (mark?.type !== "link") return mark;
        const href = mark?.attrs?.href;
        const replacement = typeof href === "string" ? map[href] : undefined;
        return replacement
          ? { ...mark, attrs: { ...mark.attrs, href: replacement } }
          : mark;
      });
    }
    if (Array.isArray(node.content)) next.content = node.content.map(mapNode);
    return next;
  };
  return { ...doc, content: doc?.content?.map(mapNode) };
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** URL → 短縮コード。既存があれば再利用する。 */
async function ensureCode(url: string): Promise<string> {
  const existing = await prisma.linkIndex.findUnique({
    where: { url },
    select: { code: true },
  });
  if (existing) return existing.code;
  if (DRY_RUN) return "(new)";

  const hostname = new URL(url).hostname.toLowerCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.linkIndex.create({
        data: { code: generateCode(CODE_LENGTH), url, hostname },
        select: { code: true },
      });
      return row.code;
    } catch (e) {
      const conflict = await prisma.linkIndex.findUnique({
        where: { url },
        select: { code: true },
      });
      if (conflict) return conflict.code;
      if (attempt === 4) throw e;
    }
  }
  throw new Error(`could not mint a code for ${url}`);
}

async function main(): Promise<void> {
  const memos = await prisma.documentMemo.findMany({
    select: { id: true, content: true, ownerType: true, ownerId: true },
  });
  console.log(
    `${memos.length} memo(s) to scan${DRY_RUN ? " — dry run, no writes" : ""}`,
  );

  let changed = 0;
  let linksIndexed = 0;

  for (const memo of memos) {
    const doc = memo.content as RichTextNode | null;
    if (!doc || typeof doc !== "object") continue;

    // すでに /l/… のものは対象外。生の http(s) だけを拾う。
    const raw = collectLinkHrefs(doc).filter(
      (href) => !href.startsWith(SHORT_LINK_PREFIX) && normalizeUrl(href),
    );
    if (raw.length === 0) continue;

    const map: Record<string, string> = {};
    for (const href of raw) {
      const url = normalizeUrl(href);
      if (!url) continue;
      map[href] = `${SHORT_LINK_PREFIX}${await ensureCode(url)}`;
      linksIndexed++;
    }
    if (Object.keys(map).length === 0) continue;

    console.log(
      `  ${memo.ownerType}/${memo.ownerId}: ${Object.entries(map)
        .map(([from, to]) => `${from} → ${to}`)
        .join(", ")}`,
    );
    if (!DRY_RUN) {
      await prisma.documentMemo.update({
        where: { id: memo.id },
        data: { content: rewriteLinkHrefs(doc, map) as object },
      });
    }
    changed++;
  }

  console.log(
    `done: ${changed} memo(s) ${DRY_RUN ? "would be " : ""}updated, ${linksIndexed} link(s) indexed`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
