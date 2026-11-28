/**
 * 指示書の印字番号（#974 の生産側）— 指示書詳細と、紙に刷る帯（ストリップ印刷）。
 *
 * 指示書の帳票は Gotenberg の PDF ではなく**ブラウザ印刷**
 * （/production/work-orders/print?ids=…）。なので印刷ページを開いて画面を撮り、
 * さらにブラウザの印刷（PDF 出力）で刷った 1 ページ目も撮る。
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

/** 印字番号の欄（ラベル + 値）の文字。無ければ null。 */
async function markingField(s: Scn): Promise<string | null> {
  const label = s.page.getByText("印字番号", { exact: true }).first();
  if ((await label.count()) === 0) return null;
  return (await label.locator("xpath=..").innerText()).replace(/\s+/g, " ").trim();
}

export const workOrderMarkingPrint: Scenario = {
  id: "work-order-marking-print",
  title: "指示書 — 印字番号の表示と帯（ストリップ）印刷",
  feature: "A 印字通し番号 (#974) — 指示書・帯の印刷",
  user: "staff",
  fixtures: ["scenarios/fixtures/work-order-marking-print.sql"],
  steps: [
    {
      caption: "指示書 #9001 の詳細 — 受注 150 本の明細から 50 本を分けた指示書なので、分割の番号（A2000001-001 〜 -050）が出る",
      run: async (s) => {
        await s.goto("/production/work-orders/9001");
        await s.see("工程ワークフロー");
        const line = s.sql(
          `select ol.marking_base || '|' || ol.quantity || '|' || l.quantity || '|' || l.marking_split from app.work_order_order_lines l
             join app.order_lines ol on ol.id = l.order_line_id join app.work_orders w on w.id = l.work_order_id
            where w.work_order_number = 9001`,
        );
        s.check("前提（DB）: 基番 200000・受注 150 本・この指示書への割当 50 本・分割 1", line === "200000|150|50|1", line);
        const field = await markingField(s);
        s.check("印字番号: 分割 1・1 本ずつ A2000001-001 〜 A2000001-050（割当 50 本ぶん）", !!field && field.includes("分割 1") && field.includes("1 本ずつ") && field.includes("A2000001-001 〜 A2000001-050"), field);
        s.check("印字番号: 分割ごと A2000001", !!field && /分割ごと\s?A2000001$/.test(field), field);
        const sharing = s.sqlRows(
          `select w.work_order_number || '=' || l.quantity || ':' || l.marking_split from app.work_order_order_lines l
             join app.work_orders w on w.id = l.work_order_id
            where l.order_line_id = 'e0000000-0000-4000-8000-000000000001' order by 1`,
        );
        s.check("同じ明細を分けた指示書は、それぞれ別の分割番号（#9001=1 / #9003=2 / #9004=3）", sharing.join(",") === "9001=50:1,9003=10:2,9004=50:3", sharing);
        await s.shot("指示書 #9001 — 分割 1 の印字番号");
      },
    },
    {
      caption: "受注 1200 本の明細（#9002・明細全部の割当 = 分割なし）は枝番が 4 桁に広がる。注文明細の割当が無い指示書（#9101）には印字番号の欄が出ない",
      run: async (s) => {
        await s.goto("/production/work-orders/9002");
        await s.see("工程ワークフロー");
        const field = await markingField(s);
        s.check("#9002: 1 本ずつ A200001-0001 〜 A200001-1200（桁は数量に合わせる）", !!field && field.includes("A200001-0001 〜 A200001-1200"), field);
        s.check("#9002: 明細ごと A200001（基番は明細ごとに別）", !!field && /明細ごと\s?A200001$/.test(field), field);
        await s.shot("指示書 #9002 — 受注 1200 本の印字番号（4 桁）");
        await s.goto("/production/work-orders/9101");
        await s.see("工程ワークフロー");
        s.check("#9101（割当なし）: 印字番号の欄が無い", (await markingField(s)) === null, await markingField(s));
      },
    },
    {
      caption: "操作メニューの「ストリップ印刷」— 帯に印字番号が刷られる（割当の無い指示書の帯には出ない）",
      run: async (s) => {
        const p = s.page;
        await s.goto("/production/work-orders/9001");
        await s.see("工程ワークフロー");
        await s.click(p.getByRole("button", { name: "操作メニュー" }).first());
        const item = p.getByRole("menuitem", { name: "ストリップ印刷" });
        await item.waitFor({ state: "visible", timeout: 10_000 });
        const href = await item.getAttribute("href");
        s.check("メニューに「ストリップ印刷」（印刷ページへのリンク）", href === "/production/work-orders/print?ids=9001", href);
        await s.shot("操作メニュー — ストリップ印刷");
        await p.keyboard.press("Escape");

        // 3 件まとめて刷る（一覧から複数選んだときと同じ URL の形）。
        await s.goto("/production/work-orders/print?ids=9001,9002,9101");
        await s.see("指示書ストリップ（3枚）", { exact: false });
        const strips = (await p.locator(".wo-strip-body").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
        s.check("帯が 3 本", strips.length === 3, strips);
        s.check("#9001 の帯（分割 1）: 印字番号 A2000001-001 〜 A2000001-050 ／ A2000001", /印字番号 A2000001-001 〜 A2000001-050 ／ A2000001/.test(strips[0] ?? ""), strips[0]);
        s.check("#9002 の帯: 印字番号 A200001-0001 〜 A200001-1200 ／ A200001", /印字番号 A200001-0001 〜 A200001-1200 ／ A200001/.test(strips[1] ?? ""), strips[1]);
        s.check("#9101 の帯（在庫向け）: 印字番号の行が無い", !!strips[2] && !strips[2].includes("印字番号") && strips[2].includes("在庫向け"), strips[2]);
        await s.shot("ストリップ印刷の画面（3 本）");

        // ブラウザの印刷で実際に刷った 1 ページ目（PDF にして画像化）。
        try {
          const pdfPath = join(s.env.outDir, "print-strips.pdf");
          writeFileSync(pdfPath, await p.pdf({ preferCSSPageSize: true, printBackground: true }));
          const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
          execFileSync("gs", [
            "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=jpeg", "-dJPEGQ=80", "-r110",
            "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${join(s.env.outDir, "print-strips.jpg")}`, pdfPath,
          ]);
          s.shots.push({ file: "print-strips.jpg", label: "ブラウザ印刷で刷った 1 ページ目（A4）" });
          const flat = text.replace(/\s+/g, " ");
          s.check("刷った紙に #9001 の印字番号（分割 1）が載る", flat.includes("A2000001-001") && flat.includes("A2000001-050"), flat.slice(0, 400));
          s.check("刷った紙に画面用の「印刷」ボタンは載らない", !/指示書ストリップ（3枚）/.test(flat), flat.slice(0, 120));
          const pages = execFileSync("gs", ["-q", "-dNODISPLAY", "-dNOSAFER", "-c", `(${pdfPath}) (r) file runpdfbegin pdfpagecount = quit`], { encoding: "utf8" }).trim();
          s.check("3 本は A4 1 枚に収まる", pages === "1", pages);
        } catch (e) {
          s.check("ブラウザ印刷（PDF 出力）を画像にする", false, String(e).slice(0, 300));
        }
      },
    },
  ],
};
