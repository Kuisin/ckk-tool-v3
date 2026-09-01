/**
 * seed.mjs — **既に決まっている訳**を集めて ja→{en,zh} の対応にする。
 *
 * 6,200 語を訳し直す前に、この製品には既に決着済みの訳が 4 か所ある:
 *   1. `_specs/i18n-glossary.md` §3   … 用語集の対訳表（正）
 *   2. `messages/{ja,en,zh}.json`     … next-intl の枠の文言
 *   3. コード中の `{ ja, en, zh }`     … enum-labels / permission-labels /
 *                                       StatusBadge / privileged-operations …
 *   4. キオスクの `lib/i18n/messages/` … 共有端末アプリの辞書
 *
 * これを拾わずに訳し直すと、同じ語に 2 通りの訳が生まれる — 用語集が
 * 「表にある ja に、表と違う訳を当てない」と最初に書いている、まさにその事故。
 * だから**訳す前に必ずここから種を作る**。
 *
 * 衝突（同じ ja に違う訳）が見つかったら握り潰さず報告する。優先順位は
 * 上の 1 → 4 で、用語集が勝つ。
 */

import fs from "node:fs";
import path from "node:path";

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

/** `| a | b | c |` → セル配列。 */
function cells(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  return t
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}
const isSeparator = (row) => row.every((c) => /^:?-{2,}:?$/.test(c));

/** マークダウンの強調・コードを落として素の語にする。 */
function plain(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

/**
 * 用語集 §3 から ja→{en,zh}。
 *
 * 「閉じる / 戻る / 一覧へ | Close / Back / Back to list | 关闭 / 返回 / 返回列表」
 * のように **1 行に複数語をまとめた行**があるので、3 列とも同じ数に割れるときは
 * 分解する。数が合わない行（説明が入っているなど）はまとめて 1 語として扱う。
 */
export function seedFromGlossary(file) {
  const out = new Map();
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let inThree = false;
  let header = null;

  for (const line of lines) {
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      if (h[1] === "##") inThree = /^3\./.test(h[2].trim());
      header = null;
      continue;
    }
    if (!inThree) continue;
    const row = cells(line);
    if (!row) {
      header = null;
      continue;
    }
    if (isSeparator(row)) continue;
    const lower = row.map((c) => c.toLowerCase());
    if (lower.includes("ja") && lower.includes("en") && lower.includes("zh")) {
      header = {
        ja: lower.indexOf("ja"),
        en: lower.indexOf("en"),
        zh: lower.indexOf("zh"),
      };
      continue;
    }
    if (!header) continue;
    const ja = plain(row[header.ja] ?? "");
    const en = plain(row[header.en] ?? "");
    const zh = plain(row[header.zh] ?? "");
    if (!ja || !en || !zh) continue;

    const parts = [ja.split(" / "), en.split(" / "), zh.split(" / ")];
    if (parts[0].length > 1 && parts[1].length === parts[0].length && parts[2].length === parts[0].length) {
      for (let i = 0; i < parts[0].length; i++) {
        add(out, parts[0][i].trim(), parts[1][i].trim(), parts[2][i].trim());
      }
    } else {
      add(out, ja, en, zh);
    }
  }
  return out;
}

function add(map, ja, en, zh) {
  if (!ja || !en || !zh) return;
  if (!JAPANESE.test(ja)) return; // 英字だけの行（PIN, DEV …）は訳す対象でない
  if (ja === "〜" || ja.length > 120) return;
  if (!map.has(ja)) map.set(ja, { en, zh });
}

/** next-intl の 3 ファイルを同じキーで突き合わせる。 */
export function seedFromMessages(dir) {
  const out = new Map();
  const read = (loc) =>
    JSON.parse(fs.readFileSync(path.join(dir, `${loc}.json`), "utf8"));
  const flat = (o, p = "", acc = {}) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") flat(v, `${p}${k}.`, acc);
      else acc[`${p}${k}`] = v;
    }
    return acc;
  };
  const ja = flat(read("ja"));
  const en = flat(read("en"));
  const zh = flat(read("zh"));
  for (const [k, v] of Object.entries(ja)) {
    if (typeof v !== "string") continue;
    if (v.includes("{")) continue; // ICU 変数入りは ja 鍵で持たない（§2.6）
    add(out, v, en[k], zh[k]);
  }
  return out;
}

/**
 * ソース中の `{ ja: "…", en: "…", zh: "…" }` を拾う。
 * キーの順序は場所によって違うので、3 つが同じ波括弧の中に居ることだけを見る。
 */
export function seedFromSource(roots) {
  const out = new Map();
  const re =
    /\{[^{}]*?\bja:\s*"((?:[^"\\]|\\.)*)"[^{}]*?\}/g;
  const pick = (block, key) =>
    block.match(new RegExp(`\\b${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (/node_modules|\.next|\.source/.test(full)) continue;
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const block = m[0];
        add(out, pick(block, "ja"), pick(block, "en"), pick(block, "zh"));
      }
    }
  };
  for (const r of roots) walk(r);
  return out;
}

/** キオスクの in-house 辞書（ja.ts / en.ts / zh.ts、同じキー構造）。 */
export function seedFromKiosk(dir) {
  const out = new Map();
  const strings = (file) => {
    const src = fs.readFileSync(file, "utf8");
    // `key: "value"` の並び。関数値（テンプレート）は対象外。
    const map = new Map();
    const re = /(\w+):\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    let i = 0;
    while ((m = re.exec(src)) !== null) map.set(`${m[1]}#${i++}`, m[2]);
    return [...map.values()];
  };
  try {
    const ja = strings(path.join(dir, "ja.ts"));
    const en = strings(path.join(dir, "en.ts"));
    const zh = strings(path.join(dir, "zh.ts"));
    if (ja.length === en.length && ja.length === zh.length) {
      for (let i = 0; i < ja.length; i++) add(out, ja[i], en[i], zh[i]);
    }
  } catch {
    /* キオスク辞書が無くても種づくりは続ける */
  }
  return out;
}

/** 優先順に統合。衝突は最初のものを採り、報告する。 */
export function mergeSeeds(sources) {
  const merged = new Map();
  const conflicts = [];
  for (const { name, map } of sources) {
    for (const [ja, tr] of map) {
      const cur = merged.get(ja);
      if (!cur) {
        merged.set(ja, { ...tr, from: name });
        continue;
      }
      if (cur.en !== tr.en || cur.zh !== tr.zh) {
        conflicts.push({ ja, keep: cur, drop: { ...tr, from: name } });
      }
    }
  }
  return { merged, conflicts };
}
