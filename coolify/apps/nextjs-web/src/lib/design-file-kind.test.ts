import { describe, expect, it } from "vitest";
import {
  designFileKind,
  fileExtension,
  isViewable,
  notViewableReason,
} from "./design-file-kind";

describe("fileExtension", () => {
  it("最後のドット以降を小文字で返す", () => {
    expect(fileExtension("A-100.STL")).toBe("stl");
    expect(fileExtension("図面 v2.rev3.pdf")).toBe("pdf");
  });

  it("拡張子が無い・末尾がドットなら空", () => {
    expect(fileExtension("drawing")).toBe("");
    expect(fileExtension("drawing.")).toBe("");
  });
});

describe("designFileKind — 拡張子が正", () => {
  it("PDF / 画像 / 3D を振り分ける", () => {
    expect(designFileKind("a.pdf")).toBe("pdf");
    expect(designFileKind("a.PNG")).toBe("image");
    expect(designFileKind("a.stl")).toBe("model3d");
    expect(designFileKind("a.glb")).toBe("model3d");
  });

  it("**ブラウザの MIME より拡張子を優先する** — STL は octet-stream で来る", () => {
    expect(designFileKind("part.stl", "application/octet-stream")).toBe(
      "model3d",
    );
    expect(designFileKind("spec.pdf", "application/octet-stream")).toBe("pdf");
  });

  it("拡張子が無いときだけ MIME で拾う", () => {
    expect(designFileKind("noext", "application/pdf")).toBe("pdf");
    expect(designFileKind("noext", "image/png")).toBe("image");
    expect(designFileKind("noext", "application/octet-stream")).toBe(
      "download",
    );
  });

  it("追加ライブラリが要る 3D 形式は model3d にしない（読めないものを見せない）", () => {
    for (const f of ["a.step", "a.stp", "a.iges", "a.igs", "a.3dm", "a.ifc"]) {
      expect(designFileKind(f), f).toBe("download");
    }
  });

  it("HEIC は画像でも download — Chrome / Firefox が描けない", () => {
    expect(designFileKind("photo.heic")).toBe("download");
  });

  it("DXF / DWG は download（今回ビューアを入れていない）", () => {
    expect(designFileKind("a.dxf")).toBe("download");
    expect(designFileKind("a.dwg")).toBe("download");
  });

  it("表計算・圧縮は download", () => {
    expect(designFileKind("a.xlsx")).toBe("download");
    expect(designFileKind("a.zip")).toBe("download");
  });
});

describe("isViewable / notViewableReason", () => {
  it("download 以外は見られる", () => {
    expect(isViewable("a.pdf")).toBe(true);
    expect(isViewable("a.stl")).toBe(true);
    expect(isViewable("a.xlsx")).toBe(false);
  });

  it("読めそうに見えて読めない形式は理由を名指しする", () => {
    expect(notViewableReason("a.step")).toContain("STEP");
    expect(notViewableReason("a.dxf")).toContain("DXF");
    expect(notViewableReason("a.heic")).toContain("HEIC");
  });

  it("それ以外は一般的な文言", () => {
    expect(notViewableReason("a.zip")).toBe(
      "この形式は表示できません（ダウンロードしてご覧ください）",
    );
  });
});
