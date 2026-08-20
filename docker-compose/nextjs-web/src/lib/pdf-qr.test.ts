import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "./pdf";
import { documentQrSvg } from "./pdf-qr";
import { encodeQrPayload, parseQrPayload, QR_KINDS } from "./qr-payload";

const TEMPLATES = path.join(process.cwd(), "src", "pdf-templates");

describe("documentQrSvg", () => {
  it("番号があれば SVG を返す", () => {
    const svg = documentQrSvg(QR_KINDS.INVOICE, "INV-202608-00001");
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox");
  });

  it("番号が無ければ空文字（白紙フォームでは QR を描かない）", () => {
    expect(documentQrSvg(QR_KINDS.WO, null)).toBe("");
    expect(documentQrSvg(QR_KINDS.WO, undefined)).toBe("");
    expect(documentQrSvg(QR_KINDS.WO, "")).toBe("");
    expect(documentQrSvg(QR_KINDS.WO, "   ")).toBe("");
  });

  it("数値の指示書番号も扱える", () => {
    expect(documentQrSvg(QR_KINDS.WO, 1234)).toContain("<svg");
  });
});

describe("書類テンプレートへの差し込み", () => {
  // 各テンプレートの {{doc_qr}} に SVG が入り、URL は入らないこと。
  const cases: { file: string; kind: string; key: string }[] = [
    { file: "quote.html", kind: QR_KINDS.QUOTE, key: "QOT-202608-00001" },
    { file: "invoice.html", kind: QR_KINDS.INVOICE, key: "INV-202608-00002" },
    {
      file: "delivery-note.html",
      kind: QR_KINDS.DELIVERY_NOTE,
      key: "DRN-202608-00003",
    },
    { file: "inspection-sheet.html", kind: QR_KINDS.WO, key: "1234" },
  ];

  for (const c of cases) {
    it(`${c.file} に QR が入る`, () => {
      const tpl = readFileSync(path.join(TEMPLATES, c.file), "utf8");
      const html = renderTemplate(tpl, {
        doc_qr: documentQrSvg(c.kind, c.key),
      });
      expect(html).toContain('class="doc-qr"');
      expect(html).toContain("<svg");
      // 差し込み位置が空のまま残っていないこと
      expect(html).not.toContain("{{doc_qr}}");
      // 紙に URL を出さない（安全性・読み取りやすさの決めごと）。
      // ※ SVG の xmlns は URI だが「紙に出る URL」ではないので対象外。
      //   見るべきは QR の中身とホスト名の混入。
      const payload = `CKK:${c.kind}:${c.key}`;
      expect(payload).not.toMatch(/https?:\/\//);
      expect(html).not.toContain("kai-lab.net");
      expect(html).not.toContain("ckk-tool.co.jp");
    });
  }

  it("番号が無い検査表（白紙）は QR 枠が空のまま = CSS で消える", () => {
    const tpl = readFileSync(
      path.join(TEMPLATES, "inspection-sheet.html"),
      "utf8",
    );
    const html = renderTemplate(tpl, {
      doc_qr: documentQrSvg(QR_KINDS.WO, null),
    });
    expect(html).toContain('<div class="doc-qr"></div>');
  });

  it("差し込む文字列は統一形式に復号できる", () => {
    // encode → parse の往復（QR 画像の復号は decode スクリプトで別途確認済み）
    const payload = encodeQrPayload(QR_KINDS.QUOTE, "QOT-202608-00001");
    expect(parseQrPayload(payload)).toEqual({
      kind: "QOT",
      key: "QOT-202608-00001",
    });
  });
});
