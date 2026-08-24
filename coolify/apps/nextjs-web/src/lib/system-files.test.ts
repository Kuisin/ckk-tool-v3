import { describe, expect, it } from "vitest";
import { isSystemFileKey } from "./system-files";

describe("isSystemFileKey", () => {
  it("業務ファイル（PDF・添付・アップロード）はシステムファイルではない", () => {
    const keys = [
      "pdfs/quotes/QOT-202608-00012.pdf",
      "pdfs/invoices/INV-202608-00003.pdf",
      "attachments/material_receipts/20260815-101500_ab3d_納品書.pdf",
      "uploads/20260815-101500_ab3d_図面.png",
      "intake/20260815-101500_ab3d_注文書.pdf",
      "kiosk/floor-maps/20260815-101500_ab3d_1F.png",
      "avatars/20260815-101500_ab3d_photo.jpg",
    ];
    for (const key of keys) {
      expect(isSystemFileKey(key), key).toBe(false);
    }
  });

  it("OS・ツールの残骸はシステムファイル", () => {
    const keys = [
      "uploads/.DS_Store",
      ".DS_Store",
      "uploads/._図面.png",
      "uploads/.~lock.見積.odt#",
      "uploads/~$報告書.xlsx",
      "uploads/memo.txt~",
      "uploads/Thumbs.db",
      "uploads/desktop.ini",
      "uploads/report.pdf.part",
      "uploads/report.pdf.crdownload",
      "uploads/data.csv.tmp",
      "uploads/.gitkeep",
      "uploads/notes.txt.bak",
      "uploads/.hidden/report.pdf",
    ];
    for (const key of keys) {
      expect(isSystemFileKey(key), key).toBe(true);
    }
  });

  it("大文字小文字を区別しない", () => {
    expect(isSystemFileKey("uploads/THUMBS.DB")).toBe(true);
    expect(isSystemFileKey("uploads/report.PDF")).toBe(false);
    expect(isSystemFileKey("uploads/report.TMP")).toBe(true);
  });

  it("先頭ドットの拡張子だけのファイル名は隠しファイル扱い", () => {
    expect(isSystemFileKey("uploads/.env")).toBe(true);
    // 拡張子ではなく名前の一部としてのドットは対象外
    expect(isSystemFileKey("uploads/2026.08.15_売上.csv")).toBe(false);
  });

  it("空セグメント・先頭スラッシュを無視する", () => {
    expect(isSystemFileKey("/uploads//report.pdf")).toBe(false);
    expect(isSystemFileKey("/uploads//.DS_Store")).toBe(true);
  });
});
