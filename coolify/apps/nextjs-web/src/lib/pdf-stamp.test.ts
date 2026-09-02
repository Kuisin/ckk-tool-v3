import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "./pdf";
import { companyStampImg } from "./pdf-stamp";

const TEMPLATES = path.join(process.cwd(), "src", "pdf-templates");

describe("companyStampImg", () => {
  it("承認済み（発行済み）なら data URI 入りの img タグを返す", async () => {
    const html = await companyStampImg(true);
    expect(html).toContain("<img");
    expect(html).toContain("data:image/png;base64,");
  });

  it("未承認（下書き）は空文字 — 印影を絶対に出さない", async () => {
    expect(await companyStampImg(false)).toBe("");
  });
});

describe("請求書テンプレートへの差し込み", () => {
  const tpl = readFileSync(path.join(TEMPLATES, "invoice.html"), "utf8");

  it("承認済みなら押印が入る", async () => {
    const html = renderTemplate(tpl, { stamp: await companyStampImg(true) });
    expect(html).toContain('class="stamp"');
    expect(html).toContain("<img");
    expect(html).not.toContain("{{stamp}}");
  });

  it("下書き相当（未承認）は枠が空のまま = CSS で消える", () => {
    const html = renderTemplate(tpl, { stamp: "" });
    expect(html).toContain('<div class="stamp"></div>');
  });
});
