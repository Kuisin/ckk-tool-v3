/**
 * 自社法人のロゴ（MS0I）— PDF の見出しに、その書類の法人のロゴが刷られる。
 *
 *   - ロゴの無い既定の法人（CKK）は従来どおり同梱の logo.svg
 *   - ロゴの無い他の法人（TSP）は**何も刷らない**（CKK のマークを刷らない）
 *   - TSP にロゴを上げると、TSP の書類にだけそれが刷られる。外すと戻る
 *   - ロゴの画像が読めなくても（保存先から消えた）PDF は止まらず、ロゴ無しで刷られる
 *
 * 始まり: fixtures/company-tsp.sql。`storage: true` で保存先（SeaweedFS）の代わりに
 * メモリだけの Filer もどきが立つので、アップロードから PDF まで通しで確かめられる。
 *
 * PDF の中のロゴは文字にならないので、**PDF に埋め込まれたラスタ画像の数**で見る。
 * 上げるロゴは PNG（= ラスタ画像になる）、同梱の logo.svg と書類 QR はベクタなので
 * 画像としては数えられない。見出しは 1 ページ目の画像でも目で確かめる。
 */

import { deflateSync } from "node:zlib";
import { docNumber, docUrl } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const TSP_NAME = "ティー・エス・ピー株式会社";

/** CRC-32（PNG のチャンク用）。 */
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 横長の PNG（左半分が濃い緑・右半分が橙の 2 色）— 「TSP のロゴ」として上げる。 */
function logoPng(w = 240, h = 80): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const [r, g, b] = x < w / 2 ? [0x1b, 0x5e, 0x20] : [0xef, 0x6c, 0x00];
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 直前に取った PDF に埋め込まれたラスタ画像の数。 */
function rasterImages(s: Scn): number {
  const raw = s.lastPdf?.toString("latin1") ?? "";
  return (raw.match(/\/Subtype\s*\/Image\b/g) ?? []).length;
}

/** いま開いている詳細画面の URL から id（`TSP~QOT-2026-00001`）を取り出す。 */
function idFromUrl(s: Scn): string {
  return decodeURIComponent(new URL(s.page.url()).pathname.split("/").pop() ?? "");
}

/** 法人の詳細画面（MS2I）を開く。 */
async function openCompany(s: Scn, code: string): Promise<void> {
  const id = s.sql(`select id from app.own_companies where code = '${code}'`);
  await s.goto(`/master/own-companies/${id}`);
  await s.see("書類の発行元");
}

/** 法人の見積書を 1 通作って発行し、id を返す（承認者 = 2 社にまたがる人）。 */
async function issuedQuote(s: Scn, company: RegExp): Promise<string> {
  const p = s.page;
  await s.goto("/sales/quotes/new");
  await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/);
  await s.pick(p.getByRole("combobox", { name: /^発行会社/ }), company);
  await s.pickDate(p.getByRole("button", { name: /^有効期限/ }), { nextMonthDay: 20 });
  await s.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬エンドミル/, { search: "エンドミル" });
  await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "30");
  await s.see("単価（価格表）");
  await s.click(p.getByRole("button", { name: "保存", exact: true }));
  await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
  await s.see(docNumber("QOT"));
  const id = idFromUrl(s);
  await s.menu("発行");
  await s.clickInDialog("発行");
  await s.see("発行済", { exact: true });
  return id;
}

/** 手順 2 で作った見積書の id（手順 3・4 で同じ書類の PDF を取り直す）。 */
const quotes = { tsp: "", ckk: "" };

export const ownCompanyLogo: Scenario = {
  id: "own-company-logo",
  title: "自社法人のロゴ — PDF の見出しはその書類の法人のロゴ（無ければ CKK 以外は刷らない）",
  feature: "PR 発行会社の見え方とロゴ（法人ごとのロゴ）",
  user: "admin",
  pdf: true,
  storage: true,
  fixtures: ["scenarios/fixtures/company-tsp.sql"],
  steps: [
    {
      caption: "ロゴ未設定のとき — 既定の CKK は従来のロゴ、TSP は「ロゴなし」と発行元の見本に出る",
      run: async (s) => {
        const p = s.page;
        await openCompany(s, "CKK");
        const ckk = await p.locator("[data-logo-source]").first().getAttribute("data-logo-source");
        s.check("CKK の見本は同梱のロゴ（bundled）", ckk === "bundled", ckk);
        await s.shot("CKK — 発行元の見本（従来のロゴ）");
        await openCompany(s, "TSP");
        const tsp = await p.locator("[data-logo-source]").first().getAttribute("data-logo-source");
        s.check("TSP の見本はロゴなし（none）", tsp === "none", tsp);
        await s.checkVisible("TSP の見本に「ロゴなし」と出る", "ロゴなし", { exact: true });
        await s.click(p.getByRole("tab", { name: "ロゴ" }));
        await s.checkVisible("ロゴのタブに、未設定なら刷られないことが書いてある", "未設定のため、書類にロゴは刷られません");
        await s.shot("TSP — ロゴのタブ（未設定）");
      },
    },
    {
      caption: "ロゴ未設定の PDF — TSP の見積書には何も刷られず、CKK の見積書は従来のロゴ（ベクタ）",
      run: async (s) => {
        await s.switchUser("approver", "/sales/quotes");
        // TSP にはまだ価格表が無い（価格表は法人ごと）— CKK のものをコピーして作る。
        const p = s.page;
        await s.goto("/sales/price-lists/new");
        await s.pick(p.getByRole("combobox", { name: /^発行会社/ }), /^TSP /);
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await s.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬エンドミル/, { search: "エンドミル" });
        await s.see("他社の価格表があります");
        await s.click(p.getByRole("button", { name: /の価格表からコピー/ }));
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/price-lists", "PRC"));

        const tspId = await issuedQuote(s, /^TSP /);
        s.check("TSP の見積書ができた", tspId.startsWith("TSP~QOT-"), tspId);
        const tspText = await s.pdf("TSP の見積書（ロゴ未設定）", `/api/pdf/quote?id=${encodeURIComponent(tspId)}&force=1`);
        s.check("TSP の見積書 PDF が出る（発行元は TSP）", tspText.includes(TSP_NAME), tspText.slice(0, 200));
        s.check("TSP の見積書 PDF にラスタ画像は無い（ロゴを刷らない）", rasterImages(s) === 0, `${rasterImages(s)} 個`);

        const ckkId = await issuedQuote(s, /^CKK /);
        const ckkText = await s.pdf("CKK の見積書（ロゴ未設定）", `/api/pdf/quote?id=${encodeURIComponent(ckkId)}&force=1`);
        s.check("CKK の見積書 PDF が出る", ckkText.includes("シー・ケィ・ケー株式会社"), ckkText.slice(0, 200));
        s.check("CKK の見積書 PDF もラスタ画像は無い（同梱のロゴはベクタ）", rasterImages(s) === 0, `${rasterImages(s)} 個`);
        quotes.tsp = tspId;
        quotes.ckk = ckkId;
      },
    },
    {
      caption: "TSP にロゴを上げる（MS0I）— 発行元の見本がそのロゴになり、TSP の見積書 PDF にだけ刷られる",
      run: async (s) => {
        const p = s.page;
        await s.switchUser("admin", "/master/own-companies");
        await openCompany(s, "TSP");
        await s.click(p.getByRole("tab", { name: "ロゴ" }));
        await p.locator('input[type="file"][aria-label="ロゴをアップロード"]').setInputFiles({
          name: "tsp-logo.png",
          mimeType: "image/png",
          buffer: logoPng(),
        });
        await s.toast("ロゴを保存しました");
        const stored = s.sql(
          "select f.filename || '|' || f.mime_type || '|' || f.storage_key from app.own_companies c join app.files f on f.id = c.logo_file_id where c.code = 'TSP'",
        );
        s.check("DB: TSP の logo_file_id が PNG を指す（own-companies/logos/…）", /^tsp-logo\.png\|image\/png\|own-companies\/logos\//.test(stored), stored);
        const img = p.getByRole("img", { name: "ロゴ" });
        await img.waitFor({ state: "visible", timeout: 8000 }).catch(() => undefined);
        const loaded = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth).catch(() => 0);
        s.check("ロゴのタブに上げた画像が出る", loaded === 240, `naturalWidth ${loaded}`);
        await s.shot("TSP — ロゴを上げた");
        await s.click(p.getByRole("tab", { name: "概要" }));
        const source = await p.locator("[data-logo-source]").first().getAttribute("data-logo-source");
        s.check("発行元の見本は TSP のロゴ（own）", source === "own", source);
        await s.shot("TSP — 発行元の見本（ロゴつき）");

        await s.pdf("TSP の見積書（ロゴあり）", `/api/pdf/quote?id=${encodeURIComponent(quotes.tsp)}&force=1`);
        s.check("TSP の見積書 PDF にロゴ（ラスタ画像）が 1 つ刷られる", rasterImages(s) === 1, `${rasterImages(s)} 個`);
        await s.pdf("CKK の見積書（TSP のロゴを上げたあと）", `/api/pdf/quote?id=${encodeURIComponent(quotes.ckk)}&force=1`);
        s.check("CKK の見積書 PDF には TSP のロゴは刷られない", rasterImages(s) === 0, `${rasterImages(s)} 個`);
      },
    },
    {
      caption: "ロゴの画像が保存先から消えても PDF は止まらない — ロゴ無しで刷られる。外すと「ロゴなし」に戻る",
      run: async (s) => {
        const p = s.page;
        // 保存先に無いオブジェクトを指す files 行に付け替える（SeaweedFS から消えた状態）。
        const realLogo = s.sql("select logo_file_id from app.own_companies where code = 'TSP'");
        s.sqlExec(`
          insert into app.files (id, storage_key, filename, mime_type, size_bytes)
          values (gen_random_uuid(), 'own-companies/logos/missing.png', 'missing.png', 'image/png', 10);
          update app.own_companies
             set logo_file_id = (select id from app.files where storage_key = 'own-companies/logos/missing.png')
           where code = 'TSP';
        `);
        const text = await s.pdf("TSP の見積書（ロゴの画像が読めない）", `/api/pdf/quote?id=${encodeURIComponent(quotes.tsp)}&force=1`);
        s.check("画像が読めなくても TSP の見積書 PDF は出る", text.includes(TSP_NAME), text.slice(0, 200));
        s.check("読めないロゴは刷らない（ラスタ画像 0）", rasterImages(s) === 0, `${rasterImages(s)} 個`);
        // 画面の確認は本物のロゴに戻してから（読めない画像は画面でも 404 になるだけなので）。
        s.sqlExec(`update app.own_companies set logo_file_id = '${realLogo}' where code = 'TSP'`);

        await openCompany(s, "TSP");
        await s.click(p.getByRole("tab", { name: "ロゴ" }));
        await s.click(p.getByRole("button", { name: "ロゴを外す" }));
        await s.toast("ロゴを外しました");
        const after = s.sql("select coalesce(logo_file_id::text, 'null') from app.own_companies where code = 'TSP'");
        s.check("DB: TSP の logo_file_id は null に戻る", after === "null", after);
        await s.checkVisible("ロゴのタブは未設定の案内に戻る", "未設定のため、書類にロゴは刷られません");
        await s.shot("TSP — ロゴを外した");
      },
    },
  ],
};
